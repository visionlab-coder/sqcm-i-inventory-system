export const PRODUCTION_INGRESS_CONFIRMATION = 'ACK-2026-09-11-PUBLISH-PRODUCTION-INGRESS';
export const PRODUCTION_INGRESS_TARGET = Object.freeze({
  zone: 'safe-link.co.kr',
  hostname: 'inventory.safe-link.co.kr',
  tunnelName: 'sqcm-i-inventory-production',
  origin: 'http://127.0.0.1:3300',
  runtimeDirectory: 'D:\\seowon_runtime\\sqcm-i-inventory-production',
  configPath: 'D:\\seowon_runtime\\sqcm-i-inventory-production\\cloudflared.yml'
});

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
  if (input.publicDnsPublished !== true) return { status: 'READY_WAIT_PRODUCTION_DNS_PROPAGATION', failures: [], actualProductionIngress: 'NOT_RUN', productionGo: false };
  return { status: 'PASS_INGRESS_PUBLISHED_READY_FOR_TLS_PROBE', failures: [], actualProductionIngress: 'PASS', productionGo: false };
}
