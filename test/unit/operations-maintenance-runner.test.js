const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-maintenance-runner.mjs');

const readyGate = {
  p6EvidenceComplete: true,
  p7InProgress: true,
  productionGo: true,
  outputPresent: true,
  operatorRef: 'identity://operations-maintainer',
  scheduleRef: 'maintenance://sqcm-i-production-daily',
  nextScheduledAt: '2026-09-13T00:00:00.000Z',
  execute: true,
  confirmed: true
};

function observation(overrides = {}) {
  return {
    startedAt: '2026-09-12T00:00:00.000Z',
    completedAt: '2026-09-12T00:10:00.000Z',
    nextScheduledAt: '2026-09-13T00:00:00.000Z',
    operatorRef: 'identity://operations-maintainer',
    scheduleRef: 'maintenance://sqcm-i-production-daily',
    releaseSha: 'a'.repeat(40),
    frontendStatus: 200,
    apiStatus: 200,
    readinessStatus: 200,
    databaseQueryOk: true,
    databaseName: 'seowon_inventory',
    recent5xx: 0,
    recentLoginFailures: 2,
    priorLoginFailures: 10,
    backupVerified: true,
    backupAgeMinutes: 60,
    ...overrides
  };
}

test('P6 actual·P7 활성화·Production GO 전에는 외부 read와 evidence write를 열지 않는다', async () => {
  const { evaluateOperationsMaintenanceRunnerGate } = await modulePromise;
  for (const patch of [
    { p6EvidenceComplete: false },
    { p7InProgress: false },
    { productionGo: false }
  ]) {
    const result = evaluateOperationsMaintenanceRunnerGate({ ...readyGate, ...patch });
    assert.equal(result.externalReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
  }
});

test('출력·운영자·실제 일정·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsMaintenanceRunnerGate } = await modulePromise;
  const missing = evaluateOperationsMaintenanceRunnerGate({ p6EvidenceComplete: true, p7InProgress: true, productionGo: true });
  assert.deepEqual(missing.missing, ['output', 'operatorRef', 'scheduleRef', 'nextScheduledAt']);
  assert.equal(missing.status, 'READY_WAIT_MAINTENANCE_EXECUTION_INPUTS');
  assert.equal(evaluateOperationsMaintenanceRunnerGate({ ...readyGate, execute: false }).status, 'PASS_MAINTENANCE_RUNNER_DRY_RUN_READY');
  assert.equal(evaluateOperationsMaintenanceRunnerGate({ ...readyGate, confirmed: false }).status, 'READY_WAIT_MAINTENANCE_EXECUTION_CONFIRMATION');
});

test('실제 점검 결과를 compiler 호환 6종 maintenance export로 만든다', async () => {
  const { buildMaintenanceExecutionExport, REQUIRED_MAINTENANCE_RUNNER_CHECKS } = await modulePromise;
  const result = buildMaintenanceExecutionExport(observation());
  assert.equal(result.evidenceType, 'PRODUCTION_MAINTENANCE_EXECUTION_EXPORT');
  assert.deepEqual(result.execution.checks.map((check) => check.id), REQUIRED_MAINTENANCE_RUNNER_CHECKS);
  assert.equal(result.execution.blockingFindingCount, 0);
  assert.equal(new Set(result.execution.checks.map((check) => check.receiptId)).size, 6);
  assert.equal(result.execution.checks.find((check) => check.id === 'login_failure_spike').details.threshold, 5);
});

test('health·DB·5xx·login spike·backup 실패와 잘못된 다음 일정을 차단한다', async () => {
  const { buildMaintenanceExecutionExport } = await modulePromise;
  for (const patch of [
    { frontendStatus: 503 },
    { apiStatus: 401 },
    { readinessStatus: 503 },
    { databaseQueryOk: false },
    { databaseName: 'staging' },
    { recent5xx: 1 },
    { recentLoginFailures: 6 },
    { backupVerified: false },
    { backupAgeMinutes: 1441 },
    { nextScheduledAt: '2026-09-14T00:00:00.000Z' }
  ]) assert.throws(() => buildMaintenanceExecutionExport(observation(patch)), /MAINTENANCE_EXECUTION_BLOCKED/);
});

test('maintenance export는 원자적으로 한 번만 쓰고 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeMaintenanceExecutionExportOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-runner-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'maintenance-input.json');
  writeMaintenanceExecutionExportOnce(outputPath, { environment: 'production' }, { processId: 701 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).environment, 'production');
  assert.throws(() => writeMaintenanceExecutionExportOnce(outputPath, {}, { processId: 702 }), /OUTPUT_ALREADY_EXISTS/);
});
