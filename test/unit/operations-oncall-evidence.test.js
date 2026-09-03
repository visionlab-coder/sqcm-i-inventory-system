const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-oncall-evidence.mjs');

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_ONCALL_HANDOVER_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    schedule: {
      scheduleRef: 'schedule://sqcm-i-production-primary',
      timezone: 'Asia/Seoul',
      continuousCoverage: true,
      effectiveFrom: '2026-09-11T11:00:00.000Z',
      effectiveUntil: '2026-10-31T15:00:00.000Z',
      primaryOwnerRef: 'identity://operations-primary',
      escalationOwnerRef: 'identity://operations-escalation',
      primaryAcceptedAt: '2026-09-11T11:01:00.000Z',
      escalationAcceptedAt: '2026-09-11T11:02:00.000Z'
    },
    drill: {
      drillId: 'oncall-drill-20260912',
      channelRef: 'channel://operations-primary',
      primaryOwnerRef: 'identity://operations-primary',
      escalationOwnerRef: 'identity://operations-escalation',
      initiatedAt: '2026-09-12T00:00:00.000Z',
      primaryAcknowledgedAt: '2026-09-12T00:04:00.000Z',
      primaryReceiptId: 'receipt-primary-20260912',
      escalationTriggeredAt: '2026-09-12T00:05:00.000Z',
      escalationAcknowledgedAt: '2026-09-12T00:15:00.000Z',
      escalationReceiptId: 'receipt-escalation-20260912'
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 onCall 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsOnCallEvidenceCompiler } = await modulePromise;
  const refs = { inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsOnCallEvidenceCompiler(refs).status, 'READY_WAIT_P6_COMPLETION_AND_ONCALL_HANDOVER');
  assert.equal(evaluateOperationsOnCallEvidenceCompiler({ ...refs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsOnCallEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsOnCallEvidenceCompiler(active).missing, ['input', 'output']);
  const ready = { ...active, inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsOnCallEvidenceCompiler(ready).status, 'PASS_ONCALL_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsOnCallEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_ONCALL_EVIDENCE_CONFIRMATION');
});

test('실제 당번표와 양 역할 drill receipt를 onCall 문서로 컴파일한다', async () => {
  const { compileOperationsOnCallEvidence } = await modulePromise;
  const result = compileOperationsOnCallEvidence(source(), { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_ONCALL_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.metrics, { primaryOwnerRef: 'identity://operations-primary', escalationOwnerRef: 'identity://operations-escalation' });
  assert.equal(result.evidence.provenance.primaryAckMinutes, 4);
  assert.equal(result.evidence.provenance.escalationAckMinutes, 10);
});

test('template·staging·loopback·잘못된 schedule과 동일 책임자를 거부한다', async () => {
  const { compileOperationsOnCallEvidence } = await modulePromise;
  const value = source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300' });
  value.schedule.scheduleRef = 'file.txt';
  value.schedule.timezone = 'UTC';
  value.schedule.continuousCoverage = false;
  value.schedule.escalationOwnerRef = value.schedule.primaryOwnerRef;
  const result = compileOperationsOnCallEvidence(value, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /scheduleRef/);
  assert.match(result.failures.join(','), /Asia\/Seoul/);
  assert.match(result.failures.join(','), /continuous coverage/);
  assert.match(result.failures.join(','), /must be distinct/);
});

test('미시작·30일 미만·미수락 당번표를 거부한다', async () => {
  const { compileOperationsOnCallEvidence } = await modulePromise;
  const value = source();
  value.schedule.effectiveFrom = '2026-09-13T00:00:00.000Z';
  value.schedule.effectiveUntil = '2026-09-20T00:00:00.000Z';
  value.schedule.primaryAcceptedAt = '2026-09-10T00:00:00.000Z';
  value.schedule.escalationAcceptedAt = '2026-09-13T01:00:00.000Z';
  const result = compileOperationsOnCallEvidence(value, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /already be effective/);
  assert.match(result.failures.join(','), /at least 30 future days/);
  assert.match(result.failures.join(','), /primary acceptance must not precede/);
  assert.match(result.failures.join(','), /escalation acceptance must not be in the future/);
});

test('역할 불일치·중복 receipt·느린 응답·오래된 drill을 거부한다', async () => {
  const { compileOperationsOnCallEvidence } = await modulePromise;
  const value = source();
  value.drill.primaryOwnerRef = 'identity://different';
  value.drill.primaryAcknowledgedAt = '2026-09-12T00:05:01.000Z';
  value.drill.escalationAcknowledgedAt = '2026-09-12T00:20:01.000Z';
  value.drill.escalationReceiptId = value.drill.primaryReceiptId;
  const result = compileOperationsOnCallEvidence(value, { checkedAt: '2026-09-20T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /primary owner must match/);
  assert.match(result.failures.join(','), /receiptIds must be unique/);
  assert.match(result.failures.join(','), /within 5 minutes/);
  assert.match(result.failures.join(','), /within 15 minutes/);
  assert.match(result.failures.join(','), /within 7 days/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsOnCallEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-oncall-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'oncall.json');
  writeOperationsOnCallEvidenceOnce(outputPath, { domain: 'onCall' }, { processId: 500 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).domain, 'onCall');
  assert.throws(() => writeOperationsOnCallEvidenceOnce(outputPath, { domain: 'other' }, { processId: 501 }), /OUTPUT_ALREADY_EXISTS/);
});
