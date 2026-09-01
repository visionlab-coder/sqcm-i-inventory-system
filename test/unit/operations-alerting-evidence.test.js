const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-alerting-evidence.mjs');

function source(overrides = {}) {
  const ids = ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'];
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    receiptType: 'PRODUCTION_ALERT_RECEIPT_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    providerRef: 'provider://approved-alerting',
    channelRef: 'channel://operations-primary',
    recipientRef: 'identity://operations-recipient',
    ownerRef: 'identity://operations-owner',
    signals: ids.map((id, index) => ({
      id,
      received: true,
      receiptId: `receipt-${id}`,
      triggeredAt: `2026-09-12T00:0${index}:00.000Z`,
      receivedAt: `2026-09-12T00:0${index}:30.000Z`
    })),
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 alert evidence 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsAlertingEvidenceCompiler } = await modulePromise;
  assert.equal(evaluateOperationsAlertingEvidenceCompiler({ inputPresent: true, outputPresent: true }).status, 'READY_WAIT_P6_COMPLETION_AND_ALERT_RECEIPTS');
  assert.equal(evaluateOperationsAlertingEvidenceCompiler({ p6EvidenceComplete: true, inputPresent: true, outputPresent: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsAlertingEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsAlertingEvidenceCompiler(active).missing, ['input', 'output']);
  assert.equal(evaluateOperationsAlertingEvidenceCompiler({ ...active, inputPresent: true, outputPresent: true }).status, 'PASS_ALERTING_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsAlertingEvidenceCompiler({ ...active, inputPresent: true, outputPresent: true, execute: true }).status, 'READY_WAIT_ALERTING_EVIDENCE_CONFIRMATION');
});

test('Production 5종 고유 receipt를 actual alerting 문서로 컴파일한다', async () => {
  const { compileOperationsAlertingEvidence } = await modulePromise;
  const result = compileOperationsAlertingEvidence(source(), { checkedAt: '2026-09-12T00:10:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_ALERTING_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.metrics.signals.map((item) => item.id), ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry']);
  assert.equal(result.evidence.metrics.signals.every((item) => item.received && item.deliveryLatencySeconds === 30), true);
  assert.equal(result.evidence.provenance.ownerRef, 'identity://operations-owner');
});

test('template·staging·loopback target은 actual 증거가 아니다', async () => {
  const { compileOperationsAlertingEvidence } = await modulePromise;
  const result = compileOperationsAlertingEvidence(source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300' }), { sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
});

test('누락·순서 변경·미수신·중복 receipt를 거부한다', async () => {
  const { compileOperationsAlertingEvidence } = await modulePromise;
  const value = source();
  [value.signals[0], value.signals[1]] = [value.signals[1], value.signals[0]];
  value.signals[2].received = false;
  value.signals[3].receiptId = value.signals[4].receiptId;
  const result = compileOperationsAlertingEvidence(value, { sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /five ordered required ids/);
  assert.match(result.failures.join(','), /receipt must be received/);
  assert.match(result.failures.join(','), /receiptIds must be unique/);
});

test('공급자·채널·수신자·책임자와 수신 시각을 강제한다', async () => {
  const { compileOperationsAlertingEvidence } = await modulePromise;
  const value = source({ providerRef: 'local', channelRef: '', recipientRef: 'person', ownerRef: null });
  value.signals[0].receivedAt = '2026-09-11T23:59:59.000Z';
  value.signals[1].receivedAt = '2026-09-12T00:20:00.000Z';
  const result = compileOperationsAlertingEvidence(value, { checkedAt: '2026-09-12T00:10:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /providerRef/);
  assert.match(result.failures.join(','), /channelRef/);
  assert.match(result.failures.join(','), /recipientRef/);
  assert.match(result.failures.join(','), /ownerRef/);
  assert.match(result.failures.join(','), /must not precede/);
  assert.match(result.failures.join(','), /must not be in the future/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsAlertingEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-alerting-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'alerting.json');
  writeOperationsAlertingEvidenceOnce(outputPath, { schemaVersion: 1 }, { processId: 200 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).schemaVersion, 1);
  assert.throws(() => writeOperationsAlertingEvidenceOnce(outputPath, { schemaVersion: 2 }, { processId: 201 }), /OUTPUT_ALREADY_EXISTS/);
});
