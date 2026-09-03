export function evaluateProductionRollbackReadiness(observation) {
  const failures = [];
  if (!/^[a-f0-9]{40}$/.test(observation.candidateSha || '')) failures.push('CANDIDATE_SHA_INVALID');
  if (observation.backendRevision !== observation.candidateSha) failures.push('BACKEND_REVISION_MISMATCH');
  if (observation.frontendRevision !== observation.candidateSha) failures.push('FRONTEND_REVISION_MISMATCH');
  for (const volume of observation.requiredVolumes || []) {
    if (!observation.actualVolumes?.includes(volume)) failures.push(`VOLUME_MISSING_${volume}`);
  }
  for (const key of ['allThreeServicesStoppedCleanly', 'frontendPortClosedDuringDrill', 'postgresVolumePreserved', 'fileVolumePreserved', 'forwardRecoveryCompleted', 'postRecoverySmokePassed']) {
    if (observation.previousDrill?.[key] !== true) failures.push(`PREVIOUS_DRILL_${key.toUpperCase()}_MISSING`);
  }
  if (observation.backupRestoreVerified !== true) failures.push('BACKUP_RESTORE_NOT_VERIFIED');
  const start = Date.parse(observation.changeWindow?.start);
  const cutoff = Date.parse(observation.changeWindow?.rollbackCutoff);
  const end = Date.parse(observation.changeWindow?.end);
  if (![start, cutoff, end].every(Number.isFinite) || !(start < cutoff && cutoff < end)) failures.push('ROLLBACK_CUTOFF_INVALID');
  if (observation.routeRemoval?.tunnel !== 'sqcm-i-inventory-production') failures.push('ROLLBACK_TUNNEL_TARGET_INVALID');
  if (observation.routeRemoval?.hostname !== 'inventory.safe-link.co.kr') failures.push('ROLLBACK_HOSTNAME_INVALID');
  if (observation.routeRemoval?.preserveExistingTunnels !== true) failures.push('EXISTING_TUNNEL_PRESERVATION_MISSING');

  return {
    status: failures.length ? 'FAIL_ROLLBACK_READINESS' : 'PASS_ROLLBACK_READINESS_DRY_RUN_ONLY',
    failures,
    actualPostCutoverRollback: 'NOT_RUN',
    productionGo: false
  };
}
