const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-rollback-readiness.mjs');

const sha = 'a'.repeat(40);
const complete = () => ({
  candidateSha: sha,
  backendRevision: sha,
  frontendRevision: sha,
  requiredVolumes: ['postgres', 'files'],
  actualVolumes: ['postgres', 'files'],
  previousDrill: {
    allThreeServicesStoppedCleanly: true,
    frontendPortClosedDuringDrill: true,
    postgresVolumePreserved: true,
    fileVolumePreserved: true,
    forwardRecoveryCompleted: true,
    postRecoverySmokePassed: true
  },
  backupRestoreVerified: true,
  changeWindow: { start: '2026-09-03T01:00:00Z', rollbackCutoff: '2026-09-03T03:00:00Z', end: '2026-09-03T04:00:00Z' },
  routeRemoval: { tunnel: 'sqcm-i-inventory-production', hostname: 'inventory.safe-link.co.kr', preserveExistingTunnels: true }
});

test('완전한 현재 상태와 과거 drill은 dry-run readiness만 PASS한다', async () => {
  const { evaluateProductionRollbackReadiness } = await modulePromise;
  const result = evaluateProductionRollbackReadiness(complete());
  assert.equal(result.status, 'PASS_ROLLBACK_READINESS_DRY_RUN_ONLY');
  assert.equal(result.actualPostCutoverRollback, 'NOT_RUN');
  assert.equal(result.productionGo, false);
});

test('필수 볼륨 누락은 rollback readiness를 차단한다', async () => {
  const { evaluateProductionRollbackReadiness } = await modulePromise;
  const result = evaluateProductionRollbackReadiness({ ...complete(), actualVolumes: ['postgres'] });
  assert.ok(result.failures.includes('VOLUME_MISSING_files'));
});

test('과거 drill 또는 현재 이미지 revision 불일치는 fail closed 한다', async () => {
  const { evaluateProductionRollbackReadiness } = await modulePromise;
  const observation = complete();
  observation.backendRevision = 'b'.repeat(40);
  observation.previousDrill.forwardRecoveryCompleted = false;
  const result = evaluateProductionRollbackReadiness(observation);
  assert.ok(result.failures.includes('BACKEND_REVISION_MISMATCH'));
  assert.ok(result.failures.includes('PREVIOUS_DRILL_FORWARDRECOVERYCOMPLETED_MISSING'));
});

test('cutoff 순서와 전용 route 제거 대상이 틀리면 차단한다', async () => {
  const { evaluateProductionRollbackReadiness } = await modulePromise;
  const observation = complete();
  observation.changeWindow.rollbackCutoff = observation.changeWindow.end;
  observation.routeRemoval.hostname = 'wrong.example';
  const result = evaluateProductionRollbackReadiness(observation);
  assert.ok(result.failures.includes('ROLLBACK_CUTOFF_INVALID'));
  assert.ok(result.failures.includes('ROLLBACK_HOSTNAME_INVALID'));
});
