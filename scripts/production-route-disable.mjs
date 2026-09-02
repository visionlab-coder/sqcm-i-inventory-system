import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectOperationsSecretInputReference, readOperationsSecretInput } from '../src/operations/operations-activation-input-reader.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_ROUTE_DISABLE_CONFIRMATION,
  PRODUCTION_ROUTE_DISABLE_TARGET,
  classifyProductionRouteDisableResult,
  evaluateProductionRouteDisableGate,
  selectProductionRouteDisableRecord,
  selectProductionRouteDisableZone
} from '../src/operations/production-route-disable.mjs';
import {
  observeProductionRouteDisableDns,
  observeProductionRouteDisableTunnel,
  requestRouteDisableCloudflareJson
} from '../src/operations/production-route-disable-runtime.mjs';

const CLOUDFLARED = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const TOKEN_ENV = 'CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const tokenReferencePresent = inspectOperationsSecretInputReference(process.env[TOKEN_ENV], { repositoryRoot: projectRoot }).present;
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

  const token = readOperationsSecretInput(process.env[TOKEN_ENV], { repositoryRoot: projectRoot }).value;
  if (token.length < 20) throw new Error('ROUTE_DISABLE_TOKEN_REFERENCE_INVALID');
  const zones = await cloudflare(token, `/zones?name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.zone)}&status=active&match=all`);
  const selectedZone = selectProductionRouteDisableZone({ zones, zone:PRODUCTION_ROUTE_DISABLE_TARGET.zone });
  const zoneId = selectedZone.id;
  const recordsPath = `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(PRODUCTION_ROUTE_DISABLE_TARGET.hostname)}&per_page=100`;
  const records = await cloudflare(token, recordsPath);
  const expectedContent = `${tunnelId}.cfargotunnel.com`;
  const selectedRecord = selectProductionRouteDisableRecord({
    records, zoneId, hostname:PRODUCTION_ROUTE_DISABLE_TARGET.hostname, expectedContent
  });
  let recordDeleted = false;
  if (selectedRecord) {
    await cloudflare(token, `/zones/${zoneId}/dns_records/${selectedRecord.id}`, { method:'DELETE' });
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
