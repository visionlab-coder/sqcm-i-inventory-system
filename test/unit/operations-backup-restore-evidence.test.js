const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-backup-restore-evidence.mjs');

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_BACKUP_RESTORE_DRILL_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    ownerRef: 'identity://operations-owner',
    backup: {
      backupId: 'backup-prod-20260912',
      createdAt: '2026-09-12T00:00:00.000Z',
      offsiteStoredAt: '2026-09-12T00:10:00.000Z',
      checksumVerified: true,
      artifactSha256: 'b'.repeat(64),
      sourceDatabaseRef: 'database://production-primary',
      offsiteStorageRef: 'storage://approved-offsite-backup',
      retentionUntil: '2026-10-13T00:00:00.000Z'
    },
    restore: {
      drillId: 'restore-drill-20260912',
      backupId: 'backup-prod-20260912',
      startedAt: '2026-09-12T00:20:00.000Z',
      completedAt: '2026-09-12T00:50:00.000Z',
      isolatedTarget: true,
      rowCountsMatch: true,
      schemaMigrationsMatch: true,
      targetDatabaseRef: 'database://isolated-restore-drill',
      sourceCountsSha256: 'c'.repeat(64),
      restoredCountsSha256: 'c'.repeat(64)
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 backup/restore 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsBackupRestoreEvidenceCompiler } = await modulePromise;
  const outputs = { inputPresent: true, backupOutputPresent: true, restoreOutputPresent: true };
  assert.equal(evaluateOperationsBackupRestoreEvidenceCompiler(outputs).status, 'READY_WAIT_P6_COMPLETION_AND_BACKUP_RESTORE_DRILL');
  assert.equal(evaluateOperationsBackupRestoreEvidenceCompiler({ ...outputs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·두 출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsBackupRestoreEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsBackupRestoreEvidenceCompiler(active).missing, ['input', 'backupOutput', 'restoreOutput']);
  const ready = { ...active, inputPresent: true, backupOutputPresent: true, restoreOutputPresent: true };
  assert.equal(evaluateOperationsBackupRestoreEvidenceCompiler(ready).status, 'PASS_BACKUP_RESTORE_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsBackupRestoreEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_BACKUP_RESTORE_EVIDENCE_CONFIRMATION');
});

test('actual off-site backup과 격리 restore drill을 두 도메인 문서로 컴파일한다', async () => {
  const { compileOperationsBackupRestoreEvidence } = await modulePromise;
  const result = compileOperationsBackupRestoreEvidence(source(), { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_BACKUP_RESTORE_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.backup.metrics, { offsite: true, checksumVerified: true, ageMinutes: 60 });
  assert.deepEqual(result.evidence.restore.metrics, { isolatedTarget: true, rowCountsMatch: true, rtoMinutes: 30 });
  assert.equal(result.evidence.backup.domain, 'backup');
  assert.equal(result.evidence.restore.domain, 'restore');
});

test('template·staging·loopback과 잘못된 provenance를 거부한다', async () => {
  const { compileOperationsBackupRestoreEvidence } = await modulePromise;
  const result = compileOperationsBackupRestoreEvidence(source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300', ownerRef: 'person' }), { sourceSha256: 'x' });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /ownerRef/);
  assert.match(result.failures.join(','), /source sha256/);
});

test('오래되거나 미보관·checksum 미검증·짧은 retention backup을 거부한다', async () => {
  const { compileOperationsBackupRestoreEvidence } = await modulePromise;
  const value = source();
  value.backup.createdAt = '2026-09-10T00:00:00.000Z';
  value.backup.offsiteStoredAt = '2026-09-09T23:00:00.000Z';
  value.backup.checksumVerified = false;
  value.backup.retentionUntil = '2026-09-20T00:00:00.000Z';
  const result = compileOperationsBackupRestoreEvidence(value, { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /checksum must be verified/);
  assert.match(result.failures.join(','), /within 1440 minute RPO/);
  assert.match(result.failures.join(','), /must not precede backup creation/);
  assert.match(result.failures.join(','), /at least 30 days/);
});

test('비격리·count 불일치·migration 불일치·RTO 초과 restore를 거부한다', async () => {
  const { compileOperationsBackupRestoreEvidence } = await modulePromise;
  const value = source();
  value.restore.isolatedTarget = false;
  value.restore.rowCountsMatch = false;
  value.restore.schemaMigrationsMatch = false;
  value.restore.targetDatabaseRef = value.backup.sourceDatabaseRef;
  value.restore.restoredCountsSha256 = 'd'.repeat(64);
  value.restore.completedAt = '2026-09-12T05:00:00.000Z';
  const result = compileOperationsBackupRestoreEvidence(value, { checkedAt: '2026-09-12T06:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /target must be isolated/);
  assert.match(result.failures.join(','), /row counts must match/);
  assert.match(result.failures.join(','), /schema migrations must match/);
  assert.match(result.failures.join(','), /target must differ/);
  assert.match(result.failures.join(','), /count digests/);
  assert.match(result.failures.join(','), /within 240 minutes/);
});

test('두 증거를 원자적으로 한 번만 쓰며 부분 출력과 덮어쓰기를 막는다', async (t) => {
  const { writeOperationsBackupRestoreEvidencePairOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-backup-restore-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const backupPath = path.join(tempDir, 'backup.json');
  const restorePath = path.join(tempDir, 'restore.json');
  writeOperationsBackupRestoreEvidencePairOnce(backupPath, restorePath, { backup: { domain: 'backup' }, restore: { domain: 'restore' } }, { processId: 300 });
  assert.equal(JSON.parse(fs.readFileSync(backupPath, 'utf8')).domain, 'backup');
  assert.equal(JSON.parse(fs.readFileSync(restorePath, 'utf8')).domain, 'restore');
  assert.throws(() => writeOperationsBackupRestoreEvidencePairOnce(backupPath, path.join(tempDir, 'new.json'), { backup: {}, restore: {} }), /OUTPUT_ALREADY_EXISTS/);
  assert.throws(() => writeOperationsBackupRestoreEvidencePairOnce(restorePath, restorePath, { backup: {}, restore: {} }), /DISTINCT_OUTPUT_PATHS_REQUIRED/);
});
