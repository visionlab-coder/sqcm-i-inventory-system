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
