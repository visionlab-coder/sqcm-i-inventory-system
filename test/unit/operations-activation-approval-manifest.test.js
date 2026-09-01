const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-activation-approval-manifest.mjs');

const steps = [
  'slo-collect', 'slo-compile', 'alert-deliver', 'alert-compile', 'backup-restore-run',
  'backup-restore-compile', 'certificate-observe', 'certificate-compile', 'oncall-drill',
  'oncall-compile', 'maintenance-run', 'maintenance-compile', 'improvement-collect',
  'improvement-compile', 'signoff-input-assemble', 'signoff-compile', 'handover-assemble',
  'handover-finalize', 'phase-complete'
];
const actions = [
  'slo-production-https-read', 'alert-test-delivery', 'offsite-backup-write',
  'isolated-restore-database', 'certificate-production-https-read', 'oncall-test-message',
  'maintenance-production-read', 'github-operations-read', 'local-evidence-write',
  'phase-completion-state-write'
];

function p6(overrides = {}) {
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', productionGo: true,
    targetUrl: 'https://inventory.safe-link.co.kr', runId: '12345678-1234-1234-1234-123456789abc', releaseSha: 'a'.repeat(40),
    approvals: { operations: { status: 'APPROVED', signedBy: 'identity://operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } },
    ...overrides
  };
}
function request(overrides = {}) {
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST', targetUrl: 'https://inventory.safe-link.co.kr',
    requestId: 'p7-approval-request-12345678-1234-1234-1234-123456789abc',
    runId: 'p7-activation-12345678-1234-1234-1234-123456789abc', releaseSha: 'a'.repeat(40),
    activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64),
    p6OperationsApprovalSha256: 'e'.repeat(64), requestedToRef: 'identity://operations-owner',
    requestedAt: '2026-09-12T00:00:00.000Z', maximumApprovalValidityDays: 45,
    allowedSteps: steps, authorizedActions: actions, mfaRequired: true,
    blockingExceptionCountRequired: 0, externalApprovalCreated: false, secretValuesRecorded: false,
    ...overrides
  };
}
function receipt(overrides = {}) {
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT', targetUrl: 'https://inventory.safe-link.co.kr',
    decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: 'identity://operations-owner',
    signedAt: '2026-09-12T01:00:00.000Z', receiptId: 'p7-approval-receipt-20260912-001',
    runId: 'p7-activation-12345678-1234-1234-1234-123456789abc', releaseSha: 'a'.repeat(40),
    activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64),
    p6OperationsApprovalSha256: 'e'.repeat(64), allowedSteps: steps, authorizedActions: actions,
    mfaVerified: true, blockingExceptionCount: 0, ...overrides
  };
}

test('P6 actual·P7·Production GO 전에는 manifest input read·write를 열지 않는다', async () => {
  const { evaluateOperationsActivationApprovalManifestGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsActivationApprovalManifestGate(value);
    assert.equal(result.inputReadAllowed, false); assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.externalApprovalAllowed, false); assert.equal(result.activationExecutionAllowed, false);
  }
});

test('request와 외부 MFA receipt를 exact 실행 manifest로 조립한다', async () => {
  const { buildOperationsActivationApprovalManifest } = await modulePromise;
  const output = buildOperationsActivationApprovalManifest({
    requestDocument: request(), approvalReceipt: receipt(), approvalReceiptSha256: 'd'.repeat(64),
    p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64),
    checkedAt: '2026-09-12T02:00:00.000Z'
  });
  assert.equal(output.approved, true); assert.equal(output.authorizedByRef, 'identity://operations-owner');
  assert.equal(output.approvalReceiptSha256, 'd'.repeat(64));
  assert.equal(output.approvedAt, '2026-09-12T01:00:00.000Z');
  assert.equal(output.expiresAt, '2026-10-27T01:00:00.000Z');
  assert.equal(output.allowedSteps.length, 19); assert.equal(output.authorizedActions.length, 10);
});

test('request와 receipt의 run·bundle·identity·권한 불일치를 거부한다', async () => {
  const { buildOperationsActivationApprovalManifest } = await modulePromise;
  assert.throws(() => buildOperationsActivationApprovalManifest({
    requestDocument: request({ runId: 'p7-activation-other', requestedToRef: 'identity://other', allowedSteps: [] }),
    approvalReceipt: receipt({ activationBundleSha256: 'b'.repeat(64), authorizedActions: [] }),
    approvalReceiptSha256: 'd'.repeat(64), p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64),
    activationBundleSha256: 'c'.repeat(64), checkedAt: '2026-09-12T02:00:00.000Z'
  }), /request:runId.*request:requestedToRef.*request:allowedSteps.*receipt.*requestReceiptContent/);
});

test('45일 승인 유효기간이 지난 manifest 조립을 거부한다', async () => {
  const { buildOperationsActivationApprovalManifest } = await modulePromise;
  assert.throws(() => buildOperationsActivationApprovalManifest({
    requestDocument: request(), approvalReceipt: receipt(), approvalReceiptSha256: 'd'.repeat(64),
    p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64),
    checkedAt: '2026-10-28T01:00:00.000Z'
  }), /approvalWindow/);
});

test('실행 manifest는 저장소 밖에 원자적으로 한 번만 기록한다', async (t) => {
  const { buildOperationsActivationApprovalManifest, writeOperationsActivationApprovalManifestOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-approval-manifest-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputPath = path.join(root, 'manifest.json');
  const value = buildOperationsActivationApprovalManifest({
    requestDocument: request(), approvalReceipt: receipt(), approvalReceiptSha256: 'd'.repeat(64),
    p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), checkedAt: '2026-09-12T02:00:00.000Z'
  });
  writeOperationsActivationApprovalManifestOnce(outputPath, value, { repositoryRoot: path.join(root, 'repository'), processId: 911 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).approved, true);
  assert.throws(() => writeOperationsActivationApprovalManifestOnce(outputPath, value, { repositoryRoot: path.join(root, 'repository'), processId: 912 }), /OUTPUT_ALREADY_EXISTS/);
});
