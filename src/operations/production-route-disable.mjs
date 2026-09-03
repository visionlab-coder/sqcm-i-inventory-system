export const PRODUCTION_ROUTE_DISABLE_CONFIRMATION = 'ACK-2026-09-03-DISABLE-PRODUCTION-ROUTE';
export const PRODUCTION_ROUTE_DISABLE_TARGET = Object.freeze({
  zone: 'safe-link.co.kr',
  hostname: 'inventory.safe-link.co.kr',
  tunnelName: 'sqcm-i-inventory-production'
});

const CLOUDFLARE_IDENTIFIER_PATTERN = /^[a-f0-9]{32}$/i;

export function selectProductionRouteDisableZone({ zones, zone } = {}) {
  if (!Array.isArray(zones) || zones.length !== 1) throw new Error('ROUTE_DISABLE_ZONE_IDENTITY_INVALID');
  const selected = zones[0];
  if (!selected || !CLOUDFLARE_IDENTIFIER_PATTERN.test(selected.id ?? '')
    || selected.name !== zone || selected.status !== 'active') {
    throw new Error('ROUTE_DISABLE_ZONE_IDENTITY_INVALID');
  }
  return selected;
}

export function selectProductionRouteDisableRecord({ records, zoneId, hostname, expectedContent } = {}) {
  if (!Array.isArray(records)) throw new Error('ROUTE_DISABLE_DNS_RESPONSE_INVALID');
  if (records.length > 1) throw new Error('ROUTE_DISABLE_DNS_IDENTITY_AMBIGUOUS');
  if (records.length === 0) return null;
  const selected = records[0];
  if (!selected || !CLOUDFLARE_IDENTIFIER_PATTERN.test(zoneId ?? '')
    || !CLOUDFLARE_IDENTIFIER_PATTERN.test(selected.id ?? '')
    || (selected.zone_id !== undefined && selected.zone_id !== zoneId)
    || selected.name !== hostname
    || selected.type !== 'CNAME'
    || selected.content !== expectedContent
    || selected.proxied !== true) {
    throw new Error('ROUTE_DISABLE_DNS_TARGET_INVALID');
  }
  return selected;
}

export function evaluateProductionRouteDisableGate(input) {
  const failures = [];
  if (input.zone !== PRODUCTION_ROUTE_DISABLE_TARGET.zone) failures.push('ROUTE_DISABLE_ZONE_INVALID');
  if (input.hostname !== PRODUCTION_ROUTE_DISABLE_TARGET.hostname) failures.push('ROUTE_DISABLE_HOSTNAME_INVALID');
  if (input.tunnelName !== PRODUCTION_ROUTE_DISABLE_TARGET.tunnelName) failures.push('ROUTE_DISABLE_TUNNEL_INVALID');
  if (input.preserveExistingTunnels !== true || input.preserveLoopbackServices !== true) failures.push('ROUTE_DISABLE_PRESERVATION_INVALID');
  if (failures.length) return { status:'FAIL_ROUTE_DISABLE_CONTRACT',failures,externalMutationPerformed:false,productionGo:false };

  const pending = [];
  if (!input.productionTunnelId) pending.push('PRODUCTION_TUNNEL_MISSING');
  if (!input.tokenReferencePresent) pending.push('CLOUDFLARE_DNS_TOKEN_REFERENCE_MISSING');
  if (!input.execute) {
    return {
      status:pending.length ? 'READY_WAIT_ROUTE_DISABLE_INPUTS' : 'PASS_ROUTE_DISABLE_DRY_RUN_READY',
      failures:[],pending,externalMutationPerformed:false,actualPostCutoverRollback:'NOT_RUN',productionGo:false
    };
  }
  if (!input.insideWindow) return { status:'FAIL_ROUTE_DISABLE_OUTSIDE_CHANGE_WINDOW',failures:['OUTSIDE_APPROVED_CHANGE_WINDOW'],externalMutationPerformed:false,productionGo:false };
  if (!input.confirmed) return { status:'READY_WAIT_ROUTE_DISABLE_CONFIRMATION',failures:[],pending:['ROUTE_DISABLE_CONFIRMATION_MISSING'],externalMutationPerformed:false,productionGo:false };
  if (pending.length) return { status:'READY_WAIT_ROUTE_DISABLE_INPUTS',failures:[],pending,externalMutationPerformed:false,productionGo:false };
  return { status:'READY_ROUTE_DISABLE_EXECUTION',failures:[],pending:[],externalMutationPerformed:false,productionGo:false };
}

export function classifyProductionRouteDisableResult({ recordDeleted, recordCountAfter, dnsPublishedAfter }) {
  if (!Number.isInteger(recordCountAfter) || recordCountAfter !== 0) {
    return { status:'FAIL_PUBLIC_ROUTE_RECORD_STILL_PRESENT',failures:['PUBLIC_ROUTE_RECORD_STILL_PRESENT'],actualPostCutoverRollback:'FAIL',productionGo:false };
  }
  if (dnsPublishedAfter) {
    return { status:'READY_WAIT_PUBLIC_DNS_PROPAGATION',failures:[],recordDeleted,actualPostCutoverRollback:'NOT_RUN',productionGo:false };
  }
  return { status:'PASS_PUBLIC_ROUTE_DISABLED',failures:[],recordDeleted,actualPostCutoverRollback:'PASS',productionGo:false };
}
