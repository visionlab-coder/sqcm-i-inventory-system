const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-signoff-evidence.mjs');

const domains = ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue'];
const duties = ['on_call', 'alert_response', 'backup_restore', 'certificate_renewal', 'daily_maintenance', 'improvement_triage'];

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_OPERATIONS_SIGNOFF_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    releaseSha: 'b'.repeat(40),
    p6CutoverEvidenceSha256: 'c'.repeat(64),
    signoff: {
      decision: 'APPROVED',
      role: 'OPERATIONS_OWNER',
      signedByRef: 'identity://operations-owner',
      signedAt: '2026-09-12T01:00:00.000Z',
      receiptId: 'operations-signoff-receipt-20260912',
      blockingExceptionCount: 0,
      attestations: domains.map((domain, index) => ({ domain, status: 'PASS', evidenceSha256: (index + 1).toString(16).repeat(64) })),
      acceptedDuties: [...duties]
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 운영 서명 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsSignoffEvidenceCompiler } = await modulePromise;
  const refs = { inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsSignoffEvidenceCompiler(refs).status, 'READY_WAIT_P6_COMPLETION_AND_OPERATIONS_SIGNOFF');
  assert.equal(evaluateOperationsSignoffEvidenceCompiler({ ...refs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsSignoffEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsSignoffEvidenceCompiler(active).missing, ['input', 'output']);
  const ready = { ...active, inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsSignoffEvidenceCompiler(ready).status, 'PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsSignoffEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_OPERATIONS_SIGNOFF_EVIDENCE_CONFIRMATION');
});

test('실제 운영 책임자 승인을 finalizer 호환 문서로 컴파일한다', async () => {
  const { compileOperationsSignoffEvidence } = await modulePromise;
  const result = compileOperationsSignoffEvidence(source(), { checkedAt: '2026-09-12T02:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILED');
  assert.equal(result.evidence.evidenceType, 'P7_OPERATIONS_SIGNOFF_ACTUAL');
  assert.equal(result.evidence.status, 'APPROVED');
  assert.equal(result.evidence.provenance.attestations.length, 8);
  assert.deepEqual(result.evidence.provenance.acceptedDuties, duties);
});

test('template·staging·loopback·잘못된 승인 결정과 역할을 거부한다', async () => {
  const { compileOperationsSignoffEvidence } = await modulePromise;
  const value = source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300' });
  value.signoff.decision = 'PENDING';
  value.signoff.role = 'ADMIN';
  const result = compileOperationsSignoffEvidence(value, { checkedAt: '2026-09-12T02:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /decision must be APPROVED/);
  assert.match(result.failures.join(','), /role must be OPERATIONS_OWNER/);
});

test('identity·시각·receipt·release·cutover SHA·차단 예외를 검증한다', async () => {
  const { compileOperationsSignoffEvidence } = await modulePromise;
  const value = source({ releaseSha: 'mutable', p6CutoverEvidenceSha256: 'bad' });
  value.signoff.signedByRef = 'person';
  value.signoff.signedAt = '2026-09-13T00:00:00.000Z';
  value.signoff.receiptId = 'short';
  value.signoff.blockingExceptionCount = 1;
  const result = compileOperationsSignoffEvidence(value, { checkedAt: '2026-09-12T02:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /releaseSha/);
  assert.match(result.failures.join(','), /p6CutoverEvidenceSha256/);
  assert.match(result.failures.join(','), /signedByRef/);
  assert.match(result.failures.join(','), /receiptId/);
  assert.match(result.failures.join(','), /blockingExceptionCount/);
  assert.match(result.failures.join(','), /last 24 hours/);
});

test('8개 영역 순서·PASS·고유 SHA와 전체 수락 업무를 강제한다', async () => {
  const { compileOperationsSignoffEvidence } = await modulePromise;
  const value = source();
  value.signoff.attestations.reverse();
  value.signoff.attestations[0].status = 'FAIL';
  value.signoff.attestations[1].evidenceSha256 = value.signoff.attestations[0].evidenceSha256;
  value.signoff.attestations[2].evidenceSha256 = 'bad';
  value.signoff.acceptedDuties.pop();
  const result = compileOperationsSignoffEvidence(value, { checkedAt: '2026-09-12T02:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /eight ordered operations domains/);
  assert.match(result.failures.join(','), /must be PASS/);
  assert.match(result.failures.join(','), /require evidenceSha256/);
  assert.match(result.failures.join(','), /must be unique/);
  assert.match(result.failures.join(','), /acceptedDuties/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsSignoffEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-operations-signoff-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'operations-signoff.json');
  writeOperationsSignoffEvidenceOnce(outputPath, { domain: 'operations-signoff' }, { processId: 800 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).domain, 'operations-signoff');
  assert.throws(() => writeOperationsSignoffEvidenceOnce(outputPath, { domain: 'other' }, { processId: 801 }), /OUTPUT_ALREADY_EXISTS/);
});
