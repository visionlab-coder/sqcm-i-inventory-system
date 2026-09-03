const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-backup-restore-runner.mjs');

const readyGate = {
  p6EvidenceComplete: true,
  p7InProgress: true,
  productionGo: true,
  offsiteRootConfigured: true,
  attestationPresent: true,
  outputPresent: true,
  execute: true,
  confirmed: true
};

function attestation(overrides = {}) {
  return {
    schemaVersion: 1,
    environment: 'production',
    approved: true,
    separateFailureDomain: true,
    encryptedAtRest: true,
    retentionDays: 30,
    storageRef: 'storage://sqcm-i-production-offsite',
    ownerRef: 'identity://operations-owner',
    rootRef: 'path://approved-offsite-root',
    rootPathSha256: 'b'.repeat(64),
    ...overrides
  };
}

function drill(overrides = {}) {
  return {
    ownerRef: 'identity://operations-owner',
    storageRef: 'storage://sqcm-i-production-offsite',
    retentionDays: 30,
    backupId: 'backup-20260912-001',
    createdAt: '2026-09-12T00:00:00.000Z',
    offsiteStoredAt: '2026-09-12T00:05:00.000Z',
    artifactSha256: 'a'.repeat(64),
    sourceDatabaseRef: 'database://sqcm-i-production/seowon_inventory',
    restoreDrillId: 'restore-20260912-001',
    restoreStartedAt: '2026-09-12T00:06:00.000Z',
    restoreCompletedAt: '2026-09-12T00:20:00.000Z',
    targetDatabaseRef: 'database://isolated/restore-20260912-001',
    sourceCounts: { users: 3, items: 12, required_tables: 33, schema_migrations: 25 },
    restoredCounts: { users: 3, items: 12, required_tables: 33, schema_migrations: 25 },
    ...overrides
  };
}

test('P6 actual·P7 활성화·Production GO 전에는 backup·DB mutation·write를 열지 않는다', async () => {
  const { evaluateOperationsBackupRestoreRunnerGate } = await modulePromise;
  for (const patch of [{ p6EvidenceComplete: false }, { p7InProgress: false }, { productionGo: false }]) {
    const result = evaluateOperationsBackupRestoreRunnerGate({ ...readyGate, ...patch });
    assert.equal(result.productionReadAllowed, false);
    assert.equal(result.offsiteWriteAllowed, false);
    assert.equal(result.isolatedDatabaseMutationAllowed, false);
  }
});

test('off-site root·attestation·output·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsBackupRestoreRunnerGate } = await modulePromise;
  const missing = evaluateOperationsBackupRestoreRunnerGate({ p6EvidenceComplete: true, p7InProgress: true, productionGo: true });
  assert.deepEqual(missing.missing, ['offsiteRoot', 'attestation', 'output']);
  assert.equal(missing.status, 'READY_WAIT_BACKUP_RESTORE_RUNNER_INPUTS');
  assert.equal(evaluateOperationsBackupRestoreRunnerGate({ ...readyGate, execute: false }).status, 'PASS_BACKUP_RESTORE_RUNNER_DRY_RUN_READY');
  assert.equal(evaluateOperationsBackupRestoreRunnerGate({ ...readyGate, confirmed: false }).status, 'READY_WAIT_BACKUP_RESTORE_RUNNER_CONFIRMATION');
});

test('off-site 저장소는 승인·별도 failure domain·암호화·30일 retention을 요구한다', async () => {
  const { validateOffsiteStorageAttestation } = await modulePromise;
  assert.equal(validateOffsiteStorageAttestation(attestation()).storageRef, 'storage://sqcm-i-production-offsite');
  for (const patch of [
    { approved: false },
    { separateFailureDomain: false },
    { encryptedAtRest: false },
    { retentionDays: 29 },
    { storageRef: 'folder' },
    { ownerRef: 'person' },
    { rootPathSha256: 'bad' }
  ]) assert.throws(() => validateOffsiteStorageAttestation(attestation(patch)), /OFFSITE_STORAGE_ATTESTATION_INVALID/);
  assert.throws(() => validateOffsiteStorageAttestation(attestation(), { expectedRootSha256: 'c'.repeat(64) }), /OFFSITE_STORAGE_ATTESTATION_INVALID/);
});

test('일관된 snapshot과 격리 restore 결과를 compiler 호환 export로 만든다', async () => {
  const { buildBackupRestoreDrillExport, countsSha256 } = await modulePromise;
  const result = buildBackupRestoreDrillExport(drill());
  assert.equal(result.evidenceType, 'PRODUCTION_BACKUP_RESTORE_DRILL_EXPORT');
  assert.equal(result.backup.retentionUntil, '2026-10-12T00:00:00.000Z');
  assert.equal(result.restore.isolatedTarget, true);
  assert.equal(result.restore.sourceCountsSha256, countsSha256(drill().sourceCounts));
  assert.equal(result.restore.sourceCountsSha256, result.restore.restoredCountsSha256);
});

test('count/migration 불일치·source target 재사용·RTO 초과·잘못된 checksum을 차단한다', async () => {
  const { buildBackupRestoreDrillExport } = await modulePromise;
  for (const patch of [
    { restoredCounts: { users: 4, items: 12, required_tables: 33, schema_migrations: 25 } },
    { restoredCounts: { users: 3, items: 12, required_tables: 33, schema_migrations: 24 } },
    { sourceCounts: { users: 3, items: 12, required_tables: 32, schema_migrations: 25 }, restoredCounts: { users: 3, items: 12, required_tables: 32, schema_migrations: 25 } },
    { targetDatabaseRef: 'database://sqcm-i-production/seowon_inventory' },
    { restoreCompletedAt: '2026-09-12T05:00:00.000Z' },
    { artifactSha256: 'bad' }
  ]) assert.throws(() => buildBackupRestoreDrillExport(drill(patch)), /BACKUP_RESTORE_DRILL_BLOCKED/);
});

test('drill export는 원자적으로 한 번만 쓰고 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeBackupRestoreDrillExportOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-backup-restore-runner-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'drill.json');
  writeBackupRestoreDrillExportOnce(outputPath, { environment: 'production' }, { processId: 801 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).environment, 'production');
  assert.throws(() => writeBackupRestoreDrillExportOnce(outputPath, {}, { processId: 802 }), /OUTPUT_ALREADY_EXISTS/);
});
