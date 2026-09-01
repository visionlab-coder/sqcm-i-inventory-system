export const AUTHENTICATED_IDEMPOTENCY_WRITE_CONFIRMATION = 'ACK-P6-IDEMPOTENCY-UAT';

export function selectAuthenticatedIdempotencyTarget({ publicMode = false, now, windowStart, windowEnd }) {
  if (!publicMode) {
    return {
      status: 'READY_LOOPBACK_AUTHENTICATED_IDEMPOTENCY_BASELINE',
      target: 'http://127.0.0.1:3300',
      targetKind: 'loopback',
      actualProductionGate: false
    };
  }
  if (now < windowStart || now > windowEnd) {
    return {
      status: 'FAIL_PUBLIC_AUTHENTICATED_IDEMPOTENCY_OUTSIDE_CHANGE_WINDOW',
      target: null,
      targetKind: 'production-https',
      actualProductionGate: false
    };
  }
  return {
    status: 'READY_PUBLIC_AUTHENTICATED_IDEMPOTENCY_EXECUTION',
    target: 'https://inventory.safe-link.co.kr',
    targetKind: 'production-https',
    actualProductionGate: true
  };
}

export function evaluateAuthenticatedIdempotency(observation) {
  const failures = [];
  if (observation.missingCsrfStatus !== 403 || observation.missingCsrfCode !== 'CSRF_INVALID') failures.push('CSRF_NEGATIVE_CHECK_FAILED');
  if (observation.firstStatus !== 201 || !Number.isInteger(observation.assetId)) failures.push('FIRST_WRITE_FAILED');
  if (observation.replayStatus !== 201 || observation.replayHeader !== 'true' || observation.replayAssetId !== observation.assetId) failures.push('IDEMPOTENT_REPLAY_FAILED');
  if (observation.conflictStatus !== 409 || observation.conflictCode !== 'IDEMPOTENCY_CONFLICT') failures.push('IDEMPOTENCY_CONFLICT_CHECK_FAILED');
  if (observation.assetCount !== 1 || observation.auditCount < 1 || observation.keyCount !== 1) failures.push('DATABASE_EVIDENCE_FAILED');
  if (observation.cleanupAssetCount !== 0 || observation.cleanupAuditCount !== 0 || observation.cleanupKeyCount !== 0) failures.push('CLEANUP_FAILED');
  if (observation.logoutStatus !== 204) failures.push('LOGOUT_FAILED');
  return {
    status: failures.length ? 'FAIL_AUTHENTICATED_CSRF_IDEMPOTENCY' : 'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY',
    failures,
    productionGo: false
  };
}

export function classifyAuthenticatedIdempotencyEvidence(evaluation, actualProductionGate) {
  if (evaluation.failures.length) {
    return { ...evaluation, actualAuthenticatedCsrfIdempotency: 'FAIL' };
  }
  if (!actualProductionGate) {
    return {
      status: 'PASS_LOOPBACK_AUTHENTICATED_CSRF_IDEMPOTENCY_BASELINE',
      failures: [],
      actualAuthenticatedCsrfIdempotency: 'NOT_RUN',
      productionGo: false
    };
  }
  return {
    status: 'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY',
    failures: [],
    actualAuthenticatedCsrfIdempotency: 'PASS',
    productionGo: false
  };
}
