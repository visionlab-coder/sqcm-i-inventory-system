const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-activation-approval-request.mjs');

function p6(overrides = {}) {
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', productionGo: true,
    targetUrl: 'https://inventory.safe-link.co.kr', runId: '12345678-1234-1234-1234-123456789abc', releaseSha: 'a'.repeat(40),
    approvals: { operations: { status: 'APPROVED', signedBy: 'identity://operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } },
    ...overrides
  };
}

test('P6 actual·P7·Production GO 전에는 승인 요청 input read·write를 열지 않는다', async () => {
  const { evaluateOperationsActivationApprovalRequestGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsActivationApprovalRequestGate(value);
    assert.equal(result.inputReadAllowed, false); assert.equal(result.localEvidenceWriteAllowed, false); assert.equal(result.externalApprovalAllowed, false);
  }
});

test('승인 요청은 P6·bundle·운영 서명 provenance를 exact payload로 조립한다', async () => {
  const { buildOperationsActivationApprovalRequest } = await modulePromise;
  const output = buildOperationsActivationApprovalRequest({ p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), requestedAt: '2026-09-12T00:00:00.000Z' });
  assert.equal(output.evidenceType, 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST');
  assert.equal(output.runId, 'p7-activation-12345678-1234-1234-1234-123456789abc');
  assert.equal(output.p6OperationsApprovalSha256, 'e'.repeat(64));
  assert.equal(output.requestedToRef, 'identity://operations-owner');
  assert.equal(output.mfaRequired, true); assert.equal(output.externalApprovalCreated, false);
  assert.equal(output.allowedSteps.length, 19); assert.equal(output.authorizedActions.length, 10);
});

test('승인 요청은 template·NO-GO·운영서명 변조를 거부한다', async () => {
  const { buildOperationsActivationApprovalRequest } = await modulePromise;
  const altered = p6({ template: true, productionGo: false, approvals: { operations: { status: 'PENDING', signedBy: 'person', signedAt: 'bad', evidence: 'bad' } } });
  assert.throws(() => buildOperationsActivationApprovalRequest({ p6Document: altered, p6EvidenceSha256: 'bad', activationBundleSha256: 'bad', requestedAt: 'bad' }), /p6:contract.*p6:productionGo.*p6:operationsApproval.*p6:sha256.*activationBundleSha256.*requestedAt/);
});

test('승인 요청 payload는 저장소 밖에 원자적으로 한 번만 기록한다', async (t) => {
  const { buildOperationsActivationApprovalRequest, writeOperationsActivationApprovalRequestOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-approval-request-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, 'request.json');
  const value = buildOperationsActivationApprovalRequest({ p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), requestedAt: '2026-09-12T00:00:00.000Z' });
  writeOperationsActivationApprovalRequestOnce(outputPath, value, { repositoryRoot: path.join(root, 'repository'), processId: 901 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).externalApprovalCreated, false);
  assert.throws(() => writeOperationsActivationApprovalRequestOnce(outputPath, value, { repositoryRoot: path.join(root, 'repository'), processId: 902 }), /OUTPUT_ALREADY_EXISTS/);
});
