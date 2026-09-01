import { createHash } from 'node:crypto';
import { buildOperationsActivationApprovalManifest } from './operations-activation-approval-manifest.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function waiting(status, missing = []) {
  return {
    status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false,
    activationExecutionAllowed: false
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sameDocument(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export function evaluateOperationsActivationApprovalChainPreflightGate({
  p6EvidenceComplete = false, p7InProgress = false, productionGo = false,
  p6EvidencePresent = false, approvalRequestPresent = false,
  approvalReceiptPresent = false, approvalManifestPresent = false,
  verify = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  if (!approvalRequestPresent) missing.push('activationApprovalRequest');
  if (!approvalReceiptPresent) missing.push('activationApprovalReceipt');
  if (!approvalManifestPresent) missing.push('activationApprovalManifest');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_INPUTS', missing);
  if (!verify) return waiting('PASS_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_DRY_RUN_READY');
  return {
    status: 'READY_VERIFY_OPERATIONS_ACTIVATION_APPROVAL_CHAIN', missing,
    inputReadAllowed: true, localEvidenceWriteAllowed: false,
    activationExecutionAllowed: false
  };
}

export function verifyOperationsActivationApprovalChain({
  p6, request, receipt, manifest,
  p6EvidenceSha256, approvalRequestSha256, approvalReceiptSha256,
  approvalManifestSha256, activationBundleSha256,
  checkedAt = new Date().toISOString()
} = {}) {
  const hashFailures = [];
  for (const [name, value] of Object.entries({
    p6EvidenceSha256, approvalRequestSha256, approvalReceiptSha256,
    approvalManifestSha256, activationBundleSha256
  })) if (!SHA256_PATTERN.test(value ?? '')) hashFailures.push(name);
  if (hashFailures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_CHAIN_INVALID:${hashFailures.join(',')}`);

  const expectedManifest = buildOperationsActivationApprovalManifest({
    requestDocument: request, approvalReceipt: receipt, approvalReceiptSha256,
    p6Document: p6, p6EvidenceSha256, activationBundleSha256, checkedAt
  });
  if (!sameDocument(manifest, expectedManifest)) throw new Error('OPERATIONS_ACTIVATION_APPROVAL_CHAIN_INVALID:manifestContent');

  return {
    status: 'PASS_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_PREFLIGHT',
    checkedAt, verifiedDocumentCount: 4, releaseSha: manifest.releaseSha,
    runIdSha256: createHash('sha256').update(manifest.runId).digest('hex'),
    p6EvidenceSha256, approvalRequestSha256, approvalReceiptSha256,
    approvalManifestSha256, activationBundleSha256,
    manifestExpiresAt: manifest.expiresAt,
    localEvidenceWriteAllowed: false, activationExecutionAllowed: false,
    externalMutationPerformed: false, secretValuesReadOrRecorded: false
  };
}
