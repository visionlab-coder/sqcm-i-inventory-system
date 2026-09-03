const EXPECTED_SIGNAL_IDS = ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'];

export const HANDOVER_DOMAINS = [
  'slo',
  'alerting',
  'backup',
  'restore',
  'certificate',
  'onCall',
  'maintenance',
  'improvementQueue'
];

function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function evidencePresent(value) {
  return typeof value === 'string' && value.trim().length >= 3;
}

export function evaluateOperationsHandoverPreflight(candidate, { p6EvidenceComplete = false } = {}) {
  const contractErrors = [];
  const missingInputs = [];

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { status: 'BLOCKED_HANDOVER_CONTRACT_INVALID', contractErrors: ['candidate must be an object'], missingInputs, productionGo: false };
  }
  if (candidate.schemaVersion !== 1) contractErrors.push('schemaVersion must be 1');
  if (candidate.environment !== 'production') contractErrors.push('environment must be production');
  if (candidate.template === true) contractErrors.push('template cannot authorize operations handover');
  if (candidate.activationState !== 'preflight') contractErrors.push('activationState must remain preflight');
  if (candidate.p7Status !== 'not-started') contractErrors.push('P7 must remain not-started before P6 completion');
  if (candidate.productionGo !== false) contractErrors.push('productionGo must remain false');

  const domains = candidate.domains || {};
  for (const name of HANDOVER_DOMAINS) {
    if (!domains[name] || typeof domains[name] !== 'object') contractErrors.push(`domains.${name} is required`);
  }

  if (!positiveNumber(domains.slo?.availabilityTargetPercent) || domains.slo.availabilityTargetPercent > 100) {
    contractErrors.push('domains.slo.availabilityTargetPercent must be 0..100');
  }
  if (!positiveNumber(domains.slo?.p95TargetMs) || !Number.isInteger(domains.slo?.measurementWindowDays)) {
    contractErrors.push('domains.slo p95TargetMs and measurementWindowDays are required');
  }
  if (JSON.stringify(domains.alerting?.requiredSignals) !== JSON.stringify(EXPECTED_SIGNAL_IDS)) {
    contractErrors.push('domains.alerting.requiredSignals contract mismatch');
  }
  if (!positiveNumber(domains.backup?.rpoMinutes) || !positiveNumber(domains.backup?.retentionDays)) {
    contractErrors.push('domains.backup RPO and retention are required');
  }
  if (!positiveNumber(domains.restore?.rtoMinutes)) contractErrors.push('domains.restore.rtoMinutes is required');
  if (domains.certificate?.hostname !== 'inventory.safe-link.co.kr' || !positiveNumber(domains.certificate?.renewalLeadDays)) {
    contractErrors.push('domains.certificate hostname and renewal lead contract mismatch');
  }
  if (domains.maintenance?.scheduleContractRef !== 'docs/maintenance.md') {
    contractErrors.push('domains.maintenance.scheduleContractRef must use docs/maintenance.md');
  }

  const requiredEvidence = {
    slo: ['measurementEvidenceRef'],
    alerting: ['receiptEvidenceRef', 'ownerRef'],
    backup: ['offsiteEvidenceRef'],
    restore: ['drillEvidenceRef'],
    certificate: ['expiryEvidenceRef', 'renewalOwnerRef'],
    onCall: ['primaryOwnerRef', 'escalationOwnerRef'],
    maintenance: ['executionEvidenceRef'],
    improvementQueue: ['queueRef', 'triageOwnerRef']
  };
  for (const [domain, fields] of Object.entries(requiredEvidence)) {
    for (const field of fields) {
      if (!evidencePresent(domains[domain]?.[field])) missingInputs.push(`${domain}.${field}`);
    }
  }

  if (contractErrors.length > 0) {
    return { status: 'BLOCKED_HANDOVER_CONTRACT_INVALID', contractErrors, missingInputs, productionGo: false };
  }
  if (!p6EvidenceComplete) {
    return { status: 'READY_WAIT_P6_COMPLETION_AND_HANDOVER_INPUTS', contractErrors, missingInputs, productionGo: false };
  }
  if (missingInputs.length > 0) {
    return { status: 'READY_WAIT_HANDOVER_INPUTS', contractErrors, missingInputs, productionGo: false };
  }
  return { status: 'READY_FOR_OPERATIONS_ACTIVATION', contractErrors, missingInputs, productionGo: false };
}
