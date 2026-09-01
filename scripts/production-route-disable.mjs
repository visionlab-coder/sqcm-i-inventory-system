import { existsSync, readFileSync, statSync } from 'node:fs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_ROUTE_DISABLE_CONFIRMATION,
  PRODUCTION_ROUTE_DISABLE_TARGET,
  classifyProductionRouteDisableResult,
  evaluateProductionRouteDisableGate
} from '../src/operations/production-route-disable.mjs';
import {
  observeProductionRouteDisableDns,
  observeProductionRouteDisableTunnel,
  requestRouteDisableCloudflareJson
} from '../src/operations/production-route-disable-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const TOKEN_ENV = 'CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE';

function existingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

async function cloudflare(token, path, options = {}) {
  return requestRouteDisableCloudflareJson({
    url:`https://api.cloudflare.com/client/v4${path}`,
    token,
    options
  });
}

let externalMutationPerformed = false;

async function main() {
  const execute = process.argv.includes('--execute');
  const now = new Date();
  const tunnelObservation = observeProductionRouteDisableTunnel({
    cloudflared:CLOUDFLARED,
    tunnelName:PRODUCTION_ROUTE_DISABLE_TARGET.tunnelName
  });
  if (!tunnelObservation.succeeded) {
    console.error(JSON.stringify({
      checkedAt:now.toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,
      status:'FAIL_ROUTE_DISABLE_PREFLIGHT_OBSERVATION',failures:[tunnelObservation.status],
      externalMutationPerformed:false,actualPostCutoverRollback:'FAIL',
      secretValuesReadOrRecorded:false,productionGo:false
    },null,2));
    process.exitCode = 1;
    return;
  }
  const tunnelId = tunnelObservation.tunnelId;
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
    const output = { checkedAt:now.toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,tunnelObservationStatus:tunnelObservation.status,requiredEnvironment:[TOKEN_ENV,'PRODUCTION_ROUTE_DISABLE_CONFIRMATION'],secretValuesReadOrRecorded:false,...gate };
    const writer = gate.status.startsWith('FAIL_') ? console.error : console.log;
    writer(JSON.stringify(output,null,2));
    if (gate.status.startsWith('FAIL_')) process.exitCode = 1;
    return;
  }

  const token = readFileSync(process.env[TOKEN_ENV], 'utf8').trim();
  if (token.length < 20) throw new Error('ROUTE_DISABLE_TOKEN_REFERENCE_INVALID');
  const zones = await cloudflare(token, `/zones?name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.zone)}&status=active&match=all`);
  if (!Array.isArray(zones) || zones.length !== 1) throw new Error('ROUTE_DISABLE_ZONE_IDENTITY_INVALID');
  const zoneId = zones[0].id;
  const recordsPath = `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.hostname)}&per_page=100`;
  const records = await cloudflare(token, recordsPath);
  if (!Array.isArray(records) || records.length > 1) throw new Error('ROUTE_DISABLE_DNS_IDENTITY_AMBIGUOUS');
  const expectedContent = `${tunnelId}.cfargotunnel.com`;
  if (records.length === 1 && records[0].content !== expectedContent) throw new Error('ROUTE_DISABLE_DNS_TARGET_INVALID');
  let recordDeleted = false;
  if (records.length === 1) {
    await cloudflare(token, `/zones/${zoneId}/dns_records/${records[0].id}`, { method:'DELETE' });
    recordDeleted = true;
    externalMutationPerformed = true;
  }
  const recordsAfter = await cloudflare(token, recordsPath);
  if (!Array.isArray(recordsAfter)) throw new Error('ROUTE_DISABLE_DNS_RESPONSE_INVALID');
  const dnsObservation = await observeProductionRouteDisableDns({ hostname:PRODUCTION_ROUTE_DISABLE_TARGET.hostname });
  if (!dnsObservation.succeeded) throw new Error(dnsObservation.status);
  const classification = classifyProductionRouteDisableResult({ recordDeleted, recordCountAfter:recordsAfter.length, dnsPublishedAfter:dnsObservation.published });
  console.log(JSON.stringify({ checkedAt:new Date().toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,
    recordDeleted,recordCountAfter:recordsAfter.length,dnsObservationStatus:dnsObservation.status,
    externalMutationPerformed,preserveExistingTunnels:true,preserveLoopbackServices:true,
    secretValuesReadOrRecorded:false,...classification },null,2));
  if (classification.failures.length) process.exitCode = 1;
}

main().catch((error) => {
  const allowedFailure = /^ROUTE_DISABLE_[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'ROUTE_DISABLE_PROVIDER_EXECUTION_FAILED';
  console.error(JSON.stringify({
    checkedAt:new Date().toISOString(),target:PRODUCTION_ROUTE_DISABLE_TARGET,
    status:'FAIL_ROUTE_DISABLE_PROVIDER_EXECUTION',failures:[allowedFailure],
    externalMutationPerformed,actualPostCutoverRollback:'FAIL',
    secretValuesReadOrRecorded:false,productionGo:false
  },null,2));
  process.exitCode = 1;
});
