import { HANDOVER_DOMAINS } from './operations-handover-preflight.mjs';

const FORBIDDEN_PROVENANCE = /(template|staging|loopback|baseline|not[ _-]?run|pending)/i;

function validProductionEvidence(value) {
  return typeof value === 'string'
    && value.trim().length >= 3
    && /production/i.test(value)
    && !FORBIDDEN_PROVENANCE.test(value);
}

export function validateActualOperationsHandoverEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { status: 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID', failures: ['evidence must be an object'], p7CompletionReady: false };
  }
  if (evidence.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  if (evidence.template === true) failures.push('template evidence cannot complete P7');
  if (evidence.environment !== 'production') failures.push('environment must be production');
  if (evidence.activationState !== 'actual') failures.push('activationState must be actual');
  if (evidence.p6Gate?.status !== 'PASS' || !validProductionEvidence(evidence.p6Gate?.evidenceRef)) {
    failures.push('actual P6 Production cutover PASS evidence is required');
  }

  for (const name of HANDOVER_DOMAINS) {
    const domain = evidence.domains?.[name];
    if (!domain || domain.status !== 'PASS' || !validProductionEvidence(domain.evidenceRef)) {
      failures.push(`${name} actual Production PASS evidence is required`);
    }
  }

  const signoff = evidence.operationsSignoff || {};
  if (signoff.status !== 'APPROVED') failures.push('operations signoff must be APPROVED');
  if (!validProductionEvidence(signoff.evidenceRef)) failures.push('operations signoff Production evidence is required');
  if (typeof signoff.signedByRef !== 'string' || !/^identity:\/\/[A-Za-z0-9._/@:-]+$/.test(signoff.signedByRef)) {
    failures.push('operations signoff signedByRef must be an identity reference');
  }
  if (!signoff.signedAt || Number.isNaN(Date.parse(signoff.signedAt))) failures.push('operations signoff signedAt is required');

  return {
    status: failures.length === 0 ? 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE' : 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID',
    failures,
    requiredDomainCount: HANDOVER_DOMAINS.length,
    p7CompletionReady: failures.length === 0
  };
}
