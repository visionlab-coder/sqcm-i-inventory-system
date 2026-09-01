import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve4, resolveCname } from 'node:dns/promises';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_ROUTE_DISABLE_CONFIRMATION,
  PRODUCTION_ROUTE_DISABLE_TARGET,
  classifyProductionRouteDisableResult,
  evaluateProductionRouteDisableGate
} from '../src/operations/production-route-disable.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const TOKEN_ENV = 'CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE';

function existingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

function productionTunnelId() {
  const result = spawnSync(CLOUDFLARED, ['tunnel','list','--output','json'], { encoding:'utf8',windowsHide:true });
  if (result.status !== 0) throw new Error('Unable to list Cloudflare tunnels.');
  const matches = JSON.parse(result.stdout).filter((item) => item.name === PRODUCTION_ROUTE_DISABLE_TARGET.tunnelName);
  if (matches.length === 0) return null;
  if (matches.length !== 1 || !/^[a-f0-9-]{36}$/i.test(matches[0].id || '')) throw new Error('Production tunnel identity is ambiguous.');
  return matches[0].id;
}

async function cloudflare(token, path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers:{ authorization:`Bearer ${token}`,'content-type':'application/json',...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) throw new Error(`Cloudflare API request failed with HTTP ${response.status}.`);
  return body.result;
}

async function dnsPublished() {
  const [addresses, aliases] = await Promise.allSettled([
    resolve4(PRODUCTION_ROUTE_DISABLE_TARGET.hostname),
    resolveCname(PRODUCTION_ROUTE_DISABLE_TARGET.hostname)
  ]);
  return (addresses.status === 'fulfilled' && addresses.value.length > 0)
    || (aliases.status === 'fulfilled' && aliases.value.length > 0);
}

const execute = process.argv.includes('--execute');
const now = new Date();
const tunnelId = productionTunnelId();
const tokenReferencePresent = existingFile(process.env[TOKEN_ENV]);
const gate = evaluateProductionRouteDisableGate({
  ...PRODUCTION_ROUTE_DISABLE_TARGET,
  preserveExistingTunnels:true,
  preserveLoopbackServices:true,
  productionTunnelId:tunnelId,
  tokenReferencePresent,
  execute,
  insideWindow:now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.end),
  confirmed:process.env.PRODUCTION_ROUTE_DISABLE_CONFIRMATION === PRODUCTION_ROUTE_DISABLE_CONFIRMATION
});

if (gate.status !== 'READY_ROUTE_DISABLE_EXECUTION') {
  const output = { checkedAt:now.toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,requiredEnvironment:[TOKEN_ENV,'PRODUCTION_ROUTE_DISABLE_CONFIRMATION'],secretValuesReadOrRecorded:false,...gate };
  const writer = gate.status.startsWith('FAIL_') ? console.error : console.log;
  writer(JSON.stringify(output,null,2));
  if (gate.status.startsWith('FAIL_')) process.exitCode = 1;
} else {
  const token = readFileSync(process.env[TOKEN_ENV], 'utf8').trim();
  if (token.length < 20) throw new Error('Cloudflare token reference contract is invalid.');
  const zones = await cloudflare(token, `/zones?name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.zone)}&status=active&match=all`);
  if (zones.length !== 1) throw new Error('Exactly one active Cloudflare zone is required.');
  const zoneId = zones[0].id;
  const recordsPath = `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.hostname)}&per_page=100`;
  const records = await cloudflare(token, recordsPath);
  if (records.length > 1) throw new Error('Production DNS route is ambiguous.');
  const expectedContent = `${tunnelId}.cfargotunnel.com`;
  if (records.length === 1 && records[0].content !== expectedContent) throw new Error('Production DNS route does not point to the approved tunnel.');
  let recordDeleted = false;
  if (records.length === 1) {
    await cloudflare(token, `/zones/${zoneId}/dns_records/${records[0].id}`, { method:'DELETE' });
    recordDeleted = true;
  }
  const recordsAfter = await cloudflare(token, recordsPath);
  const classification = classifyProductionRouteDisableResult({
    recordDeleted,
    recordCountAfter:recordsAfter.length,
    dnsPublishedAfter:await dnsPublished()
  });
  console.log(JSON.stringify({
    checkedAt:new Date().toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,
    recordDeleted,recordCountAfter:recordsAfter.length,externalMutationPerformed:recordDeleted,
    preserveExistingTunnels:true,preserveLoopbackServices:true,secretValuesReadOrRecorded:false,...classification
  },null,2));
  if (classification.failures.length) process.exitCode = 1;
}
