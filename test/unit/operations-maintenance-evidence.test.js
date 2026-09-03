const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-maintenance-evidence.mjs');

const CHECKS = ['frontend_health', 'api_health', 'database_health', 'http_5xx', 'login_failure_spike', 'backup_success'];

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_MAINTENANCE_EXECUTION_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    releaseSha: 'b'.repeat(40),
    execution: {
      executionId: 'maintenance-20260912-daily',
      scheduleRef: 'maintenance://sqcm-i-production-daily',
      contractRef: 'docs/maintenance.md',
      operatorRef: 'identity://operations-maintainer',
      startedAt: '2026-09-12T00:00:00.000Z',
      completedAt: '2026-09-12T00:30:00.000Z',
      nextScheduledAt: '2026-09-13T00:00:00.000Z',
      blockingFindingCount: 0,
      checks: CHECKS.map((id, index) => ({
        id,
        status: 'PASS',
        observedAt: `2026-09-12T00:${String(index + 1).padStart(2, '0')}:00.000Z`,
        receiptId: `receipt-${id}-20260912`
      }))
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 maintenance 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsMaintenanceEvidenceCompiler } = await modulePromise;
  const refs = { inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsMaintenanceEvidenceCompiler(refs).status, 'READY_WAIT_P6_COMPLETION_AND_MAINTENANCE_EXECUTION');
  assert.equal(evaluateOperationsMaintenanceEvidenceCompiler({ ...refs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsMaintenanceEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsMaintenanceEvidenceCompiler(active).missing, ['input', 'output']);
  const ready = { ...active, inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsMaintenanceEvidenceCompiler(ready).status, 'PASS_MAINTENANCE_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsMaintenanceEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_MAINTENANCE_EVIDENCE_CONFIRMATION');
});

test('실제 일일 점검 6종을 maintenance 문서로 컴파일한다', async () => {
  const { compileOperationsMaintenanceEvidence } = await modulePromise;
  const result = compileOperationsMaintenanceEvidence(source(), { checkedAt: '2026-09-12T00:40:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_MAINTENANCE_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.metrics, { contractRef: 'docs/maintenance.md', executionPassed: true, executedAt: '2026-09-12T00:30:00.000Z' });
  assert.equal(result.evidence.provenance.checks.length, 6);
});

test('template·staging·loopback·가변 release를 actual 증거로 거부한다', async () => {
  const { compileOperationsMaintenanceEvidence } = await modulePromise;
  const value = source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300', releaseSha: 'latest' });
  const result = compileOperationsMaintenanceEvidence(value, { checkedAt: '2026-09-12T00:40:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /immutable SHA/);
});

test('잘못된 계약·운영자·시각·다음 일정·차단 finding을 거부한다', async () => {
  const { compileOperationsMaintenanceEvidence } = await modulePromise;
  const value = source();
  value.execution.scheduleRef = 'cron.txt';
  value.execution.contractRef = 'other.md';
  value.execution.operatorRef = 'person';
  value.execution.startedAt = '2026-09-12T01:00:00.000Z';
  value.execution.completedAt = '2026-09-10T00:00:00.000Z';
  value.execution.nextScheduledAt = '2026-09-14T00:00:00.000Z';
  value.execution.blockingFindingCount = 1;
  const result = compileOperationsMaintenanceEvidence(value, { checkedAt: '2026-09-12T00:40:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /scheduleRef/);
  assert.match(result.failures.join(','), /contractRef/);
  assert.match(result.failures.join(','), /operatorRef/);
  assert.match(result.failures.join(','), /completion must follow/);
  assert.match(result.failures.join(','), /last 24 hours/);
  assert.match(result.failures.join(','), /within 24 hours/);
  assert.match(result.failures.join(','), /must be zero/);
});

test('점검 누락·순서 변경·FAIL·중복 receipt·실행창 밖 관측을 거부한다', async () => {
  const { compileOperationsMaintenanceEvidence } = await modulePromise;
  const value = source();
  [value.execution.checks[0], value.execution.checks[1]] = [value.execution.checks[1], value.execution.checks[0]];
  value.execution.checks[0].status = 'FAIL';
  value.execution.checks[1].receiptId = value.execution.checks[0].receiptId;
  value.execution.checks[2].observedAt = '2026-09-12T01:00:00.000Z';
  const result = compileOperationsMaintenanceEvidence(value, { checkedAt: '2026-09-12T00:40:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /approved order/);
  assert.match(result.failures.join(','), /check must PASS/);
  assert.match(result.failures.join(','), /receiptIds must be unique/);
  assert.match(result.failures.join(','), /execution window/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsMaintenanceEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'maintenance.json');
  writeOperationsMaintenanceEvidenceOnce(outputPath, { domain: 'maintenance' }, { processId: 600 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).domain, 'maintenance');
  assert.throws(() => writeOperationsMaintenanceEvidenceOnce(outputPath, { domain: 'other' }, { processId: 601 }), /OUTPUT_ALREADY_EXISTS/);
});
