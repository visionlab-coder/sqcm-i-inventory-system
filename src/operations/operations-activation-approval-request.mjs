import fs from 'node:fs';
import path from 'node:path';
import { OPERATIONS_ACTIVATION_ACTIONS, OPERATIONS_ACTIVATION_STEPS } from './operations-activation-orchestrator.mjs';

export const OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION = 'ACK-ASSEMBLE-P7-OPERATIONS-ACTIVATION-APPROVAL-REQUEST';
const TARGET_URL = 'https://inventory.safe-link.co.kr';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const P6_RUN_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const P6_OPERATIONS_APPROVAL_PATTERN = /^production operations approval sha256:([a-f0-9]{64})$/;

function validDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function waiting(status, missing = []) { return { status, missing, inputReadAllowed: false, localEvidenceWriteAllowed: false, externalApprovalAllowed: false }; }

export function evaluateOperationsActivationApprovalRequestGate({
  p6EvidenceComplete = false, p7InProgress = false, productionGo = false,
  p6EvidencePresent = false, outputConfigured = false, outputExists = false,
  execute = false, confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  if (outputExists) return waiting('READY_EXISTING_OPERATIONS_ACTIVATION_APPROVAL_REQUEST');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  if (!outputConfigured) missing.push('approvalRequestOutput');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_INPUTS', missing);
  if (!execute) return waiting('PASS_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION');
  return { status: 'READY_ASSEMBLE_OPERATIONS_ACTIVATION_APPROVAL_REQUEST', missing, inputReadAllowed: true, localEvidenceWriteAllowed: true, externalApprovalAllowed: false };
}

export function buildOperationsActivationApprovalRequest({
  p6Document, p6EvidenceSha256, activationBundleSha256, requestedAt = new Date().toISOString()
} = {}) {
  const failures = []; const operationsApproval = p6Document?.approvals?.operations ?? {};
  const approvalMatch = P6_OPERATIONS_APPROVAL_PATTERN.exec(operationsApproval?.evidence ?? '');
  if (p6Document?.schemaVersion !== 1 || p6Document?.template !== false
    || p6Document?.environment !== 'production' || p6Document?.activationState !== 'actual'
    || p6Document?.evidenceType !== 'P6_CUTOVER_ACTUAL' || p6Document?.domain !== 'p6-cutover'
    || p6Document?.status !== 'PASS') failures.push('p6:contract');
  if (p6Document?.productionGo !== true || p6Document?.targetUrl !== TARGET_URL) failures.push('p6:productionGo');
  if (!RELEASE_SHA_PATTERN.test(p6Document?.releaseSha ?? '') || !P6_RUN_PATTERN.test(p6Document?.runId ?? '')) failures.push('p6:identity');
  if (operationsApproval?.status !== 'APPROVED' || !IDENTITY_PATTERN.test(operationsApproval?.signedBy ?? '')
    || !validDate(operationsApproval?.signedAt) || !approvalMatch) failures.push('p6:operationsApproval');
  if (!SHA256_PATTERN.test(p6EvidenceSha256 ?? '')) failures.push('p6:sha256');
  if (!SHA256_PATTERN.test(activationBundleSha256 ?? '')) failures.push('activationBundleSha256');
  if (!validDate(requestedAt) || (validDate(operationsApproval?.signedAt) && Date.parse(requestedAt) < Date.parse(operationsApproval.signedAt))) failures.push('requestedAt');
  if (failures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_REQUEST_INVALID:${[...new Set(failures)].join(',')}`);
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST', targetUrl: TARGET_URL,
    requestId: `p7-approval-request-${p6Document.runId}`,
    runId: `p7-activation-${p6Document.runId}`,
    releaseSha: p6Document.releaseSha,
    activationBundleSha256, p6CutoverEvidenceSha256: p6EvidenceSha256,
    p6OperationsApprovalSha256: approvalMatch[1], requestedToRef: operationsApproval.signedBy,
    requestedAt, maximumApprovalValidityDays: 45,
    allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id),
    authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS],
    mfaRequired: true, blockingExceptionCountRequired: 0,
    externalApprovalCreated: false, secretValuesRecorded: false
  };
}

export function writeOperationsActivationApprovalRequestOnce(outputPath, value, {
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
