import gates from './gates.js';
import { GATE_IDS } from './production-cutover-evidence.mjs';

const EXTERNAL_GATES = new Set([
  'health_readiness',
  'core_smoke',
  'logs_5xx',
  'rollback',
  'csrf_idempotency',
  'operational_health',
  'nonfunctional',
  'uat_signoff'
]);
const FORBIDDEN = /\b(staging|template|loopback|baseline|not[_ -]?run|pending)\b/i;

function actualProductionProvenance(value) {
  return typeof value === 'string'
    && /production/i.test(value)
    && !FORBIDDEN.test(value);
}

export function validateActualCutoverProvenance(evidence) {
  const contract = gates.validateCutoverEvidence(evidence);
  const failures = [...contract.failures];

  if (evidence?.template !== false) failures.push('ACTUAL_EVIDENCE_MUST_NOT_BE_TEMPLATE');
  if (evidence?.activationState !== 'actual') failures.push('ACTIVATION_STATE_NOT_ACTUAL');
  if (evidence?.targetUrl !== 'https://inventory.safe-link.co.kr') failures.push('PRODUCTION_TARGET_URL_MISMATCH');
  if (!/^sha-[0-9a-f]{40}$/.test(evidence?.releaseTag || '')) failures.push('IMMUTABLE_RELEASE_TAG_REQUIRED');
  if (evidence?.productionGo !== true) failures.push('PRODUCTION_GO_NOT_CONFIRMED');

  const ids = (evidence?.gates || []).map((gate) => gate.id);
  if (ids.length !== GATE_IDS.length || new Set(ids).size !== GATE_IDS.length) {
    failures.push('EXACT_12_UNIQUE_GATES_REQUIRED');
  }
  for (const id of ids) {
    if (!GATE_IDS.includes(id)) failures.push(`${id}_UNEXPECTED_GATE`);
  }
  for (const gate of evidence?.gates || []) {
    if (EXTERNAL_GATES.has(gate.id) && gate.status === 'PASS' && !actualProductionProvenance(gate.evidence)) {
      failures.push(`${gate.id}_NON_PRODUCTION_EVIDENCE`);
    }
  }

  for (const result of evidence?.pilot?.roleResults || []) {
    if (result.status === 'PASS' && !actualProductionProvenance(result.evidence)) {
      failures.push(`${result.role}_NON_PRODUCTION_ROLE_EVIDENCE`);
    }
  }
  for (const role of ['business', 'security', 'operations']) {
    const approval = evidence?.approvals?.[role];
    if (approval?.status === 'APPROVED' && !actualProductionProvenance(approval.evidence)) {
      failures.push(`${role}_NON_PRODUCTION_APPROVAL_EVIDENCE`);
    }
  }

  const uniqueFailures = [...new Set(failures)];
  return {
    status: uniqueFailures.length ? 'FAIL_ACTUAL_CUTOVER_EVIDENCE' : 'PASS_ACTUAL_CUTOVER_EVIDENCE',
    failures: uniqueFailures,
    requiredGateCount: GATE_IDS.length,
    productionGo: uniqueFailures.length === 0
  };
}
