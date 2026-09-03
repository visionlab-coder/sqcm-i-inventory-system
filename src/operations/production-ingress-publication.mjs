import { isIP } from 'node:net';

export const PRODUCTION_INGRESS_CONFIRMATION = 'ACK-2026-09-03-PUBLISH-PRODUCTION-INGRESS';
export const PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION = 'ACK-RECOVER-PRODUCTION-INGRESS-ORPHAN';
export const PRODUCTION_INGRESS_TARGET = Object.freeze({
  zone: 'safe-link.co.kr',
  hostname: 'inventory.safe-link.co.kr',
  tunnelName: 'sqcm-i-inventory-production',
  origin: 'http://127.0.0.1:3300',
  runtimeDirectory: 'D:\\seowon_runtime\\sqcm-i-inventory-production',
  configPath: 'D:\\seowon_runtime\\sqcm-i-inventory-production\\cloudflared.yml'
});

const CLOUDFLARE_IDENTIFIER_PATTERN = /^[a-f0-9]{32}$/i;
const TUNNEL_IDENTIFIER_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TUNNEL_CNAME_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.cfargotunnel\.com$/i;
const ACTIVE_TUNNEL_DELETED_AT = '0001-01-01T00:00:00Z';

const exactIsoInstant = (value) => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

export const isProductionIngressTunnelId = (value) => TUNNEL_IDENTIFIER_PATTERN.test(value ?? '');

export function selectProductionIngressTunnel({ tunnels, expectedName } = {}) {
  if (expectedName !== PRODUCTION_INGRESS_TARGET.tunnelName) {
    throw new Error('INGRESS_TUNNEL_IDENTITY_INVALID');
  }
  if (!Array.isArray(tunnels)) throw new Error('INGRESS_TUNNEL_RESPONSE_INVALID');
  const matches = tunnels.filter((item) => item?.name === expectedName);
  if (matches.length > 1) throw new Error('INGRESS_TUNNEL_IDENTITY_AMBIGUOUS');
  if (matches.length === 0) return null;
  const selected = matches[0];
  if (!isProductionIngressTunnelId(selected.id)
    || selected.name !== expectedName
    || !exactIsoInstant(selected.created_at)
    || selected.deleted_at !== ACTIVE_TUNNEL_DELETED_AT
    || !Array.isArray(selected.connections)) {
    throw new Error('INGRESS_TUNNEL_IDENTITY_INVALID');
  }
  for (const connection of selected.connections) {
    if (!connection || !isProductionIngressTunnelId(connection.id)
      || !/^[A-Z0-9]{2,16}$/i.test(connection.colo_name ?? '')
      || isIP(connection.origin_ip ?? '') === 0
      || !exactIsoInstant(connection.opened_at)
      || typeof connection.is_pending_reconnect !== 'boolean') {
      throw new Error('INGRESS_TUNNEL_CONNECTION_IDENTITY_INVALID');
    }
  }
  return selected;
}

export function productionIngressTunnelConnected(tunnel) {
  return Boolean(tunnel && Array.isArray(tunnel.connections)
    && tunnel.connections.some((connection) => connection?.is_pending_reconnect === false));
}

export function acknowledgeProductionIngressTunnelCreation({ output, observedTunnel } = {}) {
  if (typeof output !== 'string' || /^\s*[\[{]/.test(output) || /"token"\s*:/i.test(output)) {
    throw new Error('INGRESS_TUNNEL_CREATE_OUTPUT_UNSAFE');
  }
  const acknowledgementPattern = /^Created tunnel ([^\r\n]+) with id ([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\r?$/gim;
  const matches = [...output.matchAll(acknowledgementPattern)];
  if (matches.length !== 1 || matches[0][1] !== PRODUCTION_INGRESS_TARGET.tunnelName
    || !isProductionIngressTunnelId(matches[0][2])) {
    throw new Error('INGRESS_TUNNEL_CREATE_ACK_INVALID');
  }
  if (!observedTunnel) throw new Error('INGRESS_TUNNEL_CREATE_NOT_OBSERVED');
  const observed = selectProductionIngressTunnel({
    tunnels: [observedTunnel],
    expectedName: PRODUCTION_INGRESS_TARGET.tunnelName
  });
  if (!observed) throw new Error('INGRESS_TUNNEL_CREATE_NOT_OBSERVED');
  if (observed.id.toLowerCase() !== matches[0][2].toLowerCase()) {
    throw new Error('INGRESS_TUNNEL_CREATE_ID_MISMATCH');
  }
  return { id: observed.id, name: observed.name };
}

export function selectProductionIngressZone({ zones, expectedName } = {}) {
  if (expectedName !== PRODUCTION_INGRESS_TARGET.zone || !Array.isArray(zones) || zones.length !== 1) {
    throw new Error('INGRESS_DNS_ZONE_IDENTITY_INVALID');
  }
  const selected = zones[0];
  if (!selected || !CLOUDFLARE_IDENTIFIER_PATTERN.test(selected.id ?? '')
    || selected.name !== expectedName || selected.status !== 'active') {
    throw new Error('INGRESS_DNS_ZONE_IDENTITY_INVALID');
  }
  return selected;
}

export function selectProductionIngressDnsRecord({ records, zoneId, hostname, expectedContent } = {}) {
  if (!CLOUDFLARE_IDENTIFIER_PATTERN.test(zoneId ?? '')
    || hostname !== PRODUCTION_INGRESS_TARGET.hostname
    || !TUNNEL_CNAME_PATTERN.test(expectedContent ?? '')) {
    throw new Error('INGRESS_DNS_RECORD_TARGET_INVALID');
  }
  if (!Array.isArray(records)) throw new Error('INGRESS_DNS_RECORD_RESPONSE_INVALID');
  if (records.length > 1) throw new Error('INGRESS_DNS_RECORD_IDENTITY_AMBIGUOUS');
  if (records.length === 0) return null;
  const selected = records[0];
  if (!selected || !CLOUDFLARE_IDENTIFIER_PATTERN.test(selected.id ?? '')
    || (selected.zone_id !== undefined && selected.zone_id !== zoneId)
    || selected.name !== hostname
    || selected.type !== 'CNAME'
    || selected.content !== expectedContent
    || selected.proxied !== true
    || selected.ttl !== 1) {
    throw new Error('INGRESS_DNS_RECORD_TARGET_INVALID');
  }
  return selected;
}

export function evaluateProductionIngressPublicationGate(input) {
  const failures = [];
  for (const key of ['zone', 'hostname', 'tunnelName', 'origin', 'runtimeDirectory', 'configPath']) {
    if (input[key] !== PRODUCTION_INGRESS_TARGET[key]) failures.push(`INGRESS_${key.toUpperCase()}_INVALID`);
  }
  if (input.preserveExistingTunnels !== true || input.preserveLoopbackServices !== true) failures.push('INGRESS_PRESERVATION_INVALID');
  if (!Number.isInteger(input.existingTunnelCount) || input.existingTunnelCount < 0 || input.existingTunnelCount > 1) failures.push('INGRESS_TUNNEL_IDENTITY_AMBIGUOUS');
  if (input.dnsObservationSucceeded !== true) failures.push('INGRESS_DNS_OBSERVATION_FAILED');
  if (input.unexpectedPublicDns === true) failures.push('INGRESS_UNEXPECTED_PUBLIC_DNS_PRESENT');
  if (failures.length) return { status: 'FAIL_INGRESS_PUBLICATION_CONTRACT', failures, externalMutationPerformed: false, productionGo: false };

  const pending = [];
  if (!input.originCertificatePresent) pending.push('CLOUDFLARE_ORIGIN_CERTIFICATE_MISSING');
  if (!input.rollbackTokenReferencePresent) pending.push('CLOUDFLARE_ROLLBACK_TOKEN_REFERENCE_MISSING');
  if (input.existingTunnelCount === 1 && !input.tunnelCredentialPresent) pending.push('PRODUCTION_TUNNEL_CREDENTIAL_FILE_MISSING');
  if (!input.execute) {
    return {
      status: pending.length ? 'READY_WAIT_INGRESS_PUBLICATION_INPUTS' : 'PASS_INGRESS_PUBLICATION_DRY_RUN_READY',
      failures: [], pending, externalMutationPerformed: false, actualProductionIngress: 'NOT_RUN', productionGo: false
    };
  }
  if (!input.insideWindow) return { status: 'FAIL_INGRESS_PUBLICATION_OUTSIDE_CHANGE_WINDOW', failures: ['OUTSIDE_APPROVED_CHANGE_WINDOW'], externalMutationPerformed: false, productionGo: false };
  if (!input.confirmed) return { status: 'READY_WAIT_INGRESS_PUBLICATION_CONFIRMATION', failures: [], pending: ['INGRESS_PUBLICATION_CONFIRMATION_MISSING'], externalMutationPerformed: false, productionGo: false };
  if (!input.rollbackConfirmed) return { status: 'READY_WAIT_ROUTE_DISABLE_CONFIRMATION', failures: [], pending: ['ROUTE_DISABLE_CONFIRMATION_MISSING'], externalMutationPerformed: false, productionGo: false };
  if (pending.length) return { status: 'READY_WAIT_INGRESS_PUBLICATION_INPUTS', failures: [], pending, externalMutationPerformed: false, productionGo: false };
  return { status: 'READY_INGRESS_PUBLICATION_EXECUTION', failures: [], pending: [], externalMutationPerformed: false, productionGo: false };
}

export function classifyProductionIngressPublicationResult(input) {
  const failures = [];
  if (input.configValid !== true) failures.push('PRODUCTION_INGRESS_CONFIG_INVALID');
  if (input.tunnelConnected !== true) failures.push('PRODUCTION_TUNNEL_NOT_CONNECTED');
  if (input.dnsRecordExact !== true) failures.push('PRODUCTION_DNS_RECORD_NOT_EXACT');
  if (failures.length) return { status: 'FAIL_INGRESS_PUBLICATION_RESULT', failures, actualProductionIngress: 'FAIL', productionGo: false };
  if (input.publicDnsPublished !== true) return { status: 'PASS_INGRESS_PROVIDER_PUBLISHED_READY_FOR_PUBLIC_PROBE', failures: [], actualProductionIngress: 'NOT_RUN', productionGo: false };
  return { status: 'PASS_INGRESS_PUBLISHED_READY_FOR_TLS_PROBE', failures: [], actualProductionIngress: 'PASS', productionGo: false };
}

export function evaluateProductionIngressOrphanRecoveryPreflight(input = {}) {
  const stateKeys = [
    'tunnelPresent',
    'temporaryCredentialPresent',
    'finalCredentialPresent',
    'configPresent',
    'processRunning',
    'dnsPublished'
  ];
  if (input.tunnelObservationSucceeded !== true || input.dnsObservationSucceeded !== true
    || stateKeys.some((key) => typeof input[key] !== 'boolean')) {
    return {
      status: 'FAIL_INGRESS_ORPHAN_RECOVERY_OBSERVATION',
      recoveryRequired: false,
      externalMutationPerformed: false,
      productionGo: false
    };
  }

  const noState = stateKeys.every((key) => input[key] === false);
  if (noState) {
    return {
      status: 'PASS_NO_INGRESS_PARTIAL_STATE',
      recoveryRequired: false,
      externalMutationPerformed: false,
      productionGo: false
    };
  }

  const complete = input.tunnelPresent === true
    && input.temporaryCredentialPresent === false
    && input.finalCredentialPresent === true
    && input.configPresent === true
    && input.processRunning === true
    && input.dnsPublished === true;
  if (complete) {
    return {
      status: 'PASS_INGRESS_PUBLICATION_COMPLETE_NOT_ORPHANED',
      recoveryRequired: false,
      externalMutationPerformed: false,
      productionGo: false
    };
  }

  return {
    status: 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW',
    recoveryRequired: true,
    presentComponents: stateKeys.filter((key) => input[key] === true),
    externalMutationPerformed: false,
    productionGo: false
  };
}

export function evaluateProductionIngressOrphanRecoveryExecution(input = {}) {
  const booleanKeys = [
    'tunnelPresent',
    'tunnelConnected',
    'temporaryCredentialPresent',
    'finalCredentialPresent',
    'configPresent',
    'processRunning',
    'dnsPublished'
  ];
  if (input.tunnelObservationSucceeded !== true || input.dnsObservationSucceeded !== true
    || booleanKeys.some((key) => typeof input[key] !== 'boolean')) {
    return { status: 'FAIL_INGRESS_ORPHAN_RECOVERY_OBSERVATION', recoveryRequired: false, externalMutationPerformed: false, productionGo: false };
  }

  const noState = booleanKeys.every((key) => input[key] === false);
  if (noState) return {
    status: input.processObservationSucceeded === true
      ? 'PASS_NO_INGRESS_PARTIAL_STATE'
      : 'PASS_NO_INGRESS_RECOVERY_TARGET_PROCESS_UNOBSERVED',
    recoveryRequired: false,
    processObservationComplete: input.processObservationSucceeded === true,
    externalMutationPerformed: false,
    productionGo: false
  };
  if (input.processObservationSucceeded !== true) {
    return { status: 'FAIL_INGRESS_ORPHAN_RECOVERY_OBSERVATION', recoveryRequired: false, externalMutationPerformed: false, productionGo: false };
  }

  const complete = input.tunnelPresent === true
    && input.tunnelConnected === true
    && input.temporaryCredentialPresent === false
    && input.finalCredentialPresent === true
    && input.configPresent === true
    && input.processRunning === true
    && input.dnsPublished === true;
  if (complete) return { status: 'PASS_INGRESS_PUBLICATION_COMPLETE_NOT_ORPHANED', recoveryRequired: false, externalMutationPerformed: false, productionGo: false };

  const routeDisabledReady = input.tunnelPresent === true
    && input.tunnelConnected === true
    && input.temporaryCredentialPresent === false
    && input.finalCredentialPresent === true
    && input.configPresent === true
    && input.processRunning === true
    && input.dnsPublished === false;
  if (routeDisabledReady) return { status: 'PASS_INGRESS_ROUTE_DISABLED_NOT_ORPHANED', recoveryRequired: false, externalMutationPerformed: false, productionGo: false };

  const exactOrphan = input.tunnelPresent === true
    && input.tunnelConnected === false
    && input.temporaryCredentialPresent === true
    && input.finalCredentialPresent === false
    && input.configPresent === false
    && input.processRunning === false
    && input.dnsPublished === false;
  if (!exactOrphan) return { status: 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW', recoveryRequired: true, externalMutationPerformed: false, productionGo: false };
  if (input.execute !== true) return { status: 'PASS_INGRESS_ORPHAN_RECOVERY_DRY_RUN_READY', recoveryRequired: true, externalMutationPerformed: false, productionGo: false };
  if (input.insideWindow !== true) return { status: 'FAIL_INGRESS_ORPHAN_RECOVERY_OUTSIDE_CHANGE_WINDOW', recoveryRequired: true, externalMutationPerformed: false, productionGo: false };
  if (input.confirmation !== PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION) return { status: 'READY_WAIT_INGRESS_ORPHAN_RECOVERY_CONFIRMATION', recoveryRequired: true, externalMutationPerformed: false, productionGo: false };
  return { status: 'READY_INGRESS_ORPHAN_RECOVERY_EXECUTION', recoveryRequired: true, externalMutationPerformed: false, productionGo: false };
}
