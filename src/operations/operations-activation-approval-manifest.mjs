import fs from 'node:fs';
import path from 'node:path';
import {
  OPERATIONS_ACTIVATION_ACTIONS,
  OPERATIONS_ACTIVATION_STEPS,
  validateOperationsActivationApproval,
  validateOperationsActivationApprovalReceipt
} from './operations-activation-orchestrator.mjs';

export const OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION = 'ACK-ASSEMBLE-P7-OPERATIONS-ACTIVATION-APPROVAL-MANIFEST';
const TARGET_URL = 'https://inventory.safe-link.co.kr';
const REQUEST_TYPE = 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const MAXIMUM_APPROVAL_VALIDITY_DAYS = 45;
const DAY_MS = 86400000;

function validDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function waiting(status, missing = []) {
  return {
    status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false,
    externalApprovalAllowed: false, activationExecutionAllowed: false
  };
}

export function evaluateOperationsActivationApprovalManifestGate({
  p6EvidenceComplete = false, p7InProgress = false, productionGo = false,
  p6EvidencePresent = false, approvalRequestPresent = false, approvalReceiptPresent = false,
  outputConfigured = false, outputExists = false, execute = false, confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  if (outputExists) return waiting('READY_EXISTING_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  if (!approvalRequestPresent) missing.push('activationApprovalRequest');
  if (!approvalReceiptPresent) missing.push('activationApprovalReceipt');
  if (!outputConfigured) missing.push('activationApprovalManifestOutput');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_INPUTS', missing);
  if (!execute) return waiting('PASS_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION');
  return {
    status: 'READY_ASSEMBLE_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST', missing,
    inputReadAllowed: true, localEvidenceWriteAllowed: true,
    externalApprovalAllowed: false, activationExecutionAllowed: false
  };
}

export function buildOperationsActivationApprovalManifest({
  requestDocument, approvalReceipt, approvalReceiptSha256,
  p6Document, p6EvidenceSha256, activationBundleSha256,
  checkedAt = new Date().toISOString()
} = {}) {
  const failures = [];
  const expectedSteps = OPERATIONS_ACTIVATION_STEPS.map((step) => step.id);
  const p6Approval = p6Document?.approvals?.operations ?? {};
  const expectedRequestId = `p7-approval-request-${p6Document?.runId ?? ''}`;
  const expectedRunId = `p7-activation-${p6Document?.runId ?? ''}`;

  if (requestDocument?.schemaVersion !== 1 || requestDocument?.template !== false
    || requestDocument?.environment !== 'production' || requestDocument?.activationState !== 'actual'
    || requestDocument?.evidenceType !== REQUEST_TYPE || requestDocument?.targetUrl !== TARGET_URL) failures.push('request:contract');
  if (!ID_PATTERN.test(requestDocument?.requestId ?? '') || requestDocument?.requestId !== expectedRequestId) failures.push('request:requestId');
  if (!ID_PATTERN.test(requestDocument?.runId ?? '') || requestDocument?.runId !== expectedRunId) failures.push('request:runId');
  if (!RELEASE_SHA_PATTERN.test(requestDocument?.releaseSha ?? '') || requestDocument?.releaseSha !== p6Document?.releaseSha) failures.push('request:releaseSha');
  if (!SHA256_PATTERN.test(activationBundleSha256 ?? '') || requestDocument?.activationBundleSha256 !== activationBundleSha256) failures.push('request:activationBundleSha256');
  if (!SHA256_PATTERN.test(p6EvidenceSha256 ?? '') || requestDocument?.p6CutoverEvidenceSha256 !== p6EvidenceSha256) failures.push('request:p6CutoverEvidenceSha256');
  const p6ApprovalSha256 = /^production operations approval sha256:([a-f0-9]{64})$/.exec(p6Approval?.evidence ?? '')?.[1];
  if (!SHA256_PATTERN.test(p6ApprovalSha256 ?? '') || requestDocument?.p6OperationsApprovalSha256 !== p6ApprovalSha256) failures.push('request:p6OperationsApprovalSha256');
  if (!IDENTITY_PATTERN.test(requestDocument?.requestedToRef ?? '') || requestDocument?.requestedToRef !== p6Approval?.signedBy) failures.push('request:requestedToRef');
  if (!validDate(requestDocument?.requestedAt) || !validDate(p6Approval?.signedAt)
    || Date.parse(requestDocument?.requestedAt) < Date.parse(p6Approval?.signedAt)) failures.push('request:requestedAt');
  if (requestDocument?.maximumApprovalValidityDays !== MAXIMUM_APPROVAL_VALIDITY_DAYS) failures.push('request:maximumApprovalValidityDays');
  if (JSON.stringify(requestDocument?.allowedSteps) !== JSON.stringify(expectedSteps)) failures.push('request:allowedSteps');
  if (JSON.stringify(requestDocument?.authorizedActions) !== JSON.stringify(OPERATIONS_ACTIVATION_ACTIONS)) failures.push('request:authorizedActions');
  if (requestDocument?.mfaRequired !== true || requestDocument?.blockingExceptionCountRequired !== 0
    || requestDocument?.externalApprovalCreated !== false || requestDocument?.secretValuesRecorded !== false) failures.push('request:approvalBoundary');

  try {
    validateOperationsActivationApprovalReceipt(approvalReceipt, {
      p6Document, p6EvidenceSha256, activationBundleSha256, checkedAt
    });
  } catch { failures.push('receipt'); }

  if (requestDocument?.runId !== approvalReceipt?.runId
    || requestDocument?.releaseSha !== approvalReceipt?.releaseSha
    || requestDocument?.activationBundleSha256 !== approvalReceipt?.activationBundleSha256
    || requestDocument?.p6CutoverEvidenceSha256 !== approvalReceipt?.p6CutoverEvidenceSha256
    || requestDocument?.p6OperationsApprovalSha256 !== approvalReceipt?.p6OperationsApprovalSha256
    || requestDocument?.requestedToRef !== approvalReceipt?.signedByRef
    || !validDate(approvalReceipt?.signedAt) || !validDate(requestDocument?.requestedAt)
    || Date.parse(approvalReceipt?.signedAt) < Date.parse(requestDocument?.requestedAt)
    || JSON.stringify(requestDocument?.allowedSteps) !== JSON.stringify(approvalReceipt?.allowedSteps)
    || JSON.stringify(requestDocument?.authorizedActions) !== JSON.stringify(approvalReceipt?.authorizedActions)) failures.push('requestReceiptContent');
  if (!SHA256_PATTERN.test(approvalReceiptSha256 ?? '')) failures.push('approvalReceiptSha256');
  if (failures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_INVALID:${[...new Set(failures)].join(',')}`);

  const approvedAtMs = Date.parse(approvalReceipt.signedAt);
  const manifest = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    approved: true, targetUrl: TARGET_URL, runId: approvalReceipt.runId,
    releaseSha: approvalReceipt.releaseSha, activationBundleSha256,
    p6CutoverEvidenceSha256: p6EvidenceSha256,
    p6OperationsApprovalSha256: approvalReceipt.p6OperationsApprovalSha256,
    approvalReceiptSha256, authorizedByRef: approvalReceipt.signedByRef,
    approvedAt: approvalReceipt.signedAt,
    expiresAt: new Date(approvedAtMs + MAXIMUM_APPROVAL_VALIDITY_DAYS * DAY_MS).toISOString(),
    allowedSteps: [...expectedSteps], authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS]
  };
  try {
    return validateOperationsActivationApproval(manifest, {
      p6Document, p6EvidenceSha256, activationBundleSha256,
      approvalReceipt, approvalReceiptSha256, checkedAt
    });
  } catch (error) {
    const suffix = String(error?.message ?? '').split(':').slice(1).join(':');
    throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_INVALID:${suffix || 'approval'}`);
  }
}

export function writeOperationsActivationApprovalManifestOnce(outputPath, value, {
  repositoryRoot = process.cwd(), processId = process.pid
} = {}) {
  const output = path.resolve(outputPath); const repository = path.resolve(repositoryRoot);
  if (output.toLowerCase() === repository.toLowerCase() || output.toLowerCase().startsWith(`${repository.toLowerCase()}${path.sep}`)) throw new Error('OUTPUT_MUST_BE_EXTERNAL');
  if (fs.existsSync(output)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const parent = path.dirname(output); const stat = fs.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(fs.realpathSync(parent)).toLowerCase() !== path.resolve(parent).toLowerCase()) throw new Error('OUTPUT_PARENT_NOT_PHYSICAL');
  const temporary = path.join(parent, `.${path.basename(output)}.${processId}.tmp`);
  try {
    const handle = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    fs.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('OUTPUT_ALREADY_EXISTS');
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
  return output;
}
