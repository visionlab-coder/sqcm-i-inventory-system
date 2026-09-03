const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/operations-activation-approval-chain-preflight.mjs');

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

function fixtures() {
  const p6 = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', productionGo: true,
    targetUrl: 'https://inventory.safe-link.co.kr', runId: '12345678-1234-1234-1234-123456789abc', releaseSha: 'a'.repeat(40),
    approvals: { operations: { status: 'APPROVED', signedBy: 'identity://operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } }
  };
  const request = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST',
    targetUrl: p6.targetUrl, requestId: `p7-approval-request-${p6.runId}`, runId: `p7-activation-${p6.runId}`, releaseSha: p6.releaseSha,
    activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64), p6OperationsApprovalSha256: 'e'.repeat(64),
    requestedToRef: 'identity://operations-owner', requestedAt: '2026-09-12T00:00:00.000Z', maximumApprovalValidityDays: 45,
    allowedSteps: steps, authorizedActions: actions, mfaRequired: true, blockingExceptionCountRequired: 0,
    externalApprovalCreated: false, secretValuesRecorded: false
  };
  const receipt = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT',
    targetUrl: p6.targetUrl, decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: 'identity://operations-owner',
    signedAt: '2026-09-12T01:00:00.000Z', receiptId: 'p7-approval-receipt-20260912-001', runId: request.runId, releaseSha: p6.releaseSha,
    activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64), p6OperationsApprovalSha256: 'e'.repeat(64),
    allowedSteps: steps, authorizedActions: actions, mfaVerified: true, blockingExceptionCount: 0
  };
  const manifest = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', approved: true, targetUrl: p6.targetUrl,
    runId: request.runId, releaseSha: p6.releaseSha, activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64),
    p6OperationsApprovalSha256: 'e'.repeat(64), approvalReceiptSha256: 'd'.repeat(64), authorizedByRef: 'identity://operations-owner',
    approvedAt: '2026-09-12T01:00:00.000Z', expiresAt: '2026-10-27T01:00:00.000Z', allowedSteps: steps, authorizedActions: actions
  };
  return { p6, request, receipt, manifest };
}

function options(overrides = {}) {
  return {
    ...fixtures(), p6EvidenceSha256: 'f'.repeat(64), approvalRequestSha256: 'b'.repeat(64),
    approvalReceiptSha256: 'd'.repeat(64), approvalManifestSha256: '9'.repeat(64),
    activationBundleSha256: 'c'.repeat(64), checkedAt: '2026-09-12T02:00:00.000Z', ...overrides
  };
}

test('P6 actual·P7·Production GO 전에는 승인 체인 input을 읽지 않는다', async () => {
  const { evaluateOperationsActivationApprovalChainPreflightGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsActivationApprovalChainPreflightGate(value);
    assert.equal(result.inputReadAllowed, false); assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.activationExecutionAllowed, false);
  }
});

test('P6·request·MFA receipt·manifest·bundle 전체 체인을 읽기 전용 PASS한다', async () => {
  const { verifyOperationsActivationApprovalChain } = await modulePromise;
  const result = verifyOperationsActivationApprovalChain(options());
  assert.equal(result.status, 'PASS_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_PREFLIGHT');
  assert.equal(result.verifiedDocumentCount, 4); assert.equal(result.activationExecutionAllowed, false);
  assert.equal(result.releaseSha, 'a'.repeat(40)); assert.equal(result.manifestExpiresAt, '2026-10-27T01:00:00.000Z');
});

test('request·receipt·manifest의 identity·bundle·권한 변조를 거부한다', async () => {
  const { verifyOperationsActivationApprovalChain } = await modulePromise;
  const value = fixtures();
  value.request.requestedToRef = 'identity://other'; value.receipt.activationBundleSha256 = '8'.repeat(64); value.manifest.allowedSteps = [];
  assert.throws(() => verifyOperationsActivationApprovalChain(options(value)), /request:requestedToRef.*receipt.*requestReceiptContent/);
});

test('승인 만료 또는 manifest 원문 불일치를 실행 전에 거부한다', async () => {
  const { verifyOperationsActivationApprovalChain } = await modulePromise;
  assert.throws(() => verifyOperationsActivationApprovalChain(options({ checkedAt: '2026-10-28T01:00:00.000Z' })), /approvalWindow/);
  const value = fixtures(); value.manifest.expiresAt = '2026-10-26T01:00:00.000Z';
  assert.throws(() => verifyOperationsActivationApprovalChain(options(value)), /manifestContent/);
});
