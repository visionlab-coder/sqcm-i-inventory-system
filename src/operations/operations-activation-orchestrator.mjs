import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const OPERATIONS_ACTIVATION_CONFIRMATION = 'ACK-EXECUTE-P7-PRODUCTION-OPERATIONS-ACTIVATION';
export const OPERATIONS_ACTIVATION_ACTIONS = [
  'slo-production-https-read', 'alert-test-delivery', 'offsite-backup-write', 'isolated-restore-database',
  'certificate-production-https-read', 'oncall-test-message', 'maintenance-production-read',
  'github-operations-read', 'local-evidence-write', 'phase-completion-state-write'
];

export const OPERATIONS_ACTIVATION_STEPS = [
  { id: 'slo-collect', script: 'operations-slo-collector.mjs', args: ['--collect'], pass: ['PASS_P7_SLO_30_DAY_EXPORT_CREATED', 'PASS_P7_SLO_30_DAY_EXPORT_ALREADY_COMPLETE'] },
  { id: 'slo-compile', script: 'operations-slo-evidence.mjs', args: ['--compile'], pass: ['PASS_SLO_EVIDENCE_COMPILED'] },
  { id: 'alert-deliver', script: 'operations-alert-delivery-runner.mjs', args: ['--send'], pass: ['PASS_PRODUCTION_ALERT_DELIVERY_RECEIPT_EXPORT_CREATED', 'PASS_ALERT_DELIVERY_EXPORT_ALREADY_COMPLETE'] },
  { id: 'alert-compile', script: 'operations-alerting-evidence.mjs', args: ['--compile'], pass: ['PASS_ALERTING_EVIDENCE_COMPILED'] },
  { id: 'backup-restore-run', script: 'operations-backup-restore-runner.mjs', args: ['--execute'], pass: ['PASS_PRODUCTION_OFFSITE_BACKUP_RESTORE_DRILL_EXPORT_CREATED'] },
  { id: 'backup-restore-compile', script: 'operations-backup-restore-evidence.mjs', args: ['--compile'], pass: ['PASS_BACKUP_RESTORE_EVIDENCE_COMPILED'] },
  { id: 'certificate-observe', script: 'operations-certificate-observer.mjs', args: ['--observe'], pass: ['PASS_PRODUCTION_TLS_CERTIFICATE_OBSERVATION_CREATED'] },
  { id: 'certificate-compile', script: 'operations-certificate-evidence.mjs', args: ['--compile'], pass: ['PASS_CERTIFICATE_EVIDENCE_COMPILED'] },
  { id: 'oncall-drill', script: 'operations-oncall-drill-runner.mjs', args: ['--send'], pass: ['PASS_PRODUCTION_ONCALL_ESCALATION_DRILL_EXPORT_CREATED', 'PASS_ONCALL_DRILL_EXPORT_ALREADY_COMPLETE'] },
  { id: 'oncall-compile', script: 'operations-oncall-evidence.mjs', args: ['--compile'], pass: ['PASS_ONCALL_EVIDENCE_COMPILED'] },
  { id: 'maintenance-run', script: 'operations-maintenance-runner.mjs', args: ['--execute'], pass: ['PASS_PRODUCTION_DAILY_MAINTENANCE_EXPORT_CREATED'] },
  { id: 'maintenance-compile', script: 'operations-maintenance-evidence.mjs', args: ['--compile'], pass: ['PASS_MAINTENANCE_EVIDENCE_COMPILED'] },
  { id: 'improvement-collect', script: 'operations-improvement-queue-collector.mjs', args: ['--collect'], pass: ['PASS_PRODUCTION_IMPROVEMENT_QUEUE_EXPORT_CREATED', 'PASS_IMPROVEMENT_QUEUE_EXPORT_ALREADY_COMPLETE'] },
  { id: 'improvement-compile', script: 'operations-improvement-queue-evidence.mjs', args: ['--compile'], pass: ['PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILED'] },
  { id: 'signoff-input-assemble', script: 'operations-signoff-input-assembler.mjs', args: ['--assemble'], pass: ['PASS_PRODUCTION_OPERATIONS_SIGNOFF_INPUT_ASSEMBLED', 'READY_EXISTING_OPERATIONS_SIGNOFF_INPUT_REQUIRES_COMPILER_VALIDATION'] },
  { id: 'signoff-compile', script: 'operations-signoff-evidence.mjs', args: ['--compile'], pass: ['PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILED'] },
  { id: 'handover-assemble', script: 'operations-handover-assembler.mjs', args: ['--assemble'], pass: ['PASS_HANDOVER_MANIFEST_ASSEMBLED'] },
  { id: 'handover-finalize', script: 'operations-handover-finalizer.mjs', args: [], pass: ['PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE'] },
  { id: 'phase-complete', script: 'operations-phase-completion.mjs', args: ['--complete'], pass: ['PASS_ALL_PHASES_COMPLETE_8_OF_8'] }
];

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const RECEIPT_ROOT_CLAIM_NAME = '.operations-activation-root.json';

function waiting(status, missing = []) {
  return { status, missing, childProcessAllowed: false, approvalReadAllowed: false, receiptWriteAllowed: false };
}

function validDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }

function writeJsonNoReplace(output, value, { processId = process.pid, temporaryId = randomUUID() } = {}) {
  const temporary = path.join(path.dirname(output), `.${path.basename(output)}.${processId}.${temporaryId}.tmp`);
  let handle = null;
  try {
    handle = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); fs.closeSync(handle); handle = null;
    fs.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('NO_REPLACE_TARGET_EXISTS');
    throw error;
  } finally {
    if (handle !== null) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
  return output;
}

function validateReceiptRootClaim(value, runIdSha256) {
  if (value?.schemaVersion !== 1 || !DIGEST_PATTERN.test(value?.runIdSha256 ?? '') || !validDate(value?.claimedAt)
    || value?.secretValuesRecorded !== false) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INVALID');
  if (value.runIdSha256 !== runIdSha256) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_RUN_MISMATCH');
  return value;
}

export function claimOperationsActivationReceiptRoot(root, runId, {
  processId = process.pid, checkedAt = new Date().toISOString(), claimId = randomUUID()
} = {}) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('RECEIPT_ROOT_MISSING');
  if (!ID_PATTERN.test(runId ?? '') || !Number.isInteger(processId) || processId < 1 || !validDate(checkedAt) || !ID_PATTERN.test(claimId ?? '')) {
    throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INPUT_INVALID');
  }
  const runIdSha256 = createHash('sha256').update(runId, 'utf8').digest('hex');
  const claimPath = path.join(root, RECEIPT_ROOT_CLAIM_NAME);
  const readExisting = () => {
    let value;
    try { value = JSON.parse(fs.readFileSync(claimPath, 'utf8')); } catch { throw new Error('OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INVALID'); }
    validateReceiptRootClaim(value, runIdSha256);
    return { path: claimPath, runIdSha256, created: false };
  };
  if (fs.existsSync(claimPath)) return readExisting();
  const document = { schemaVersion: 1, runIdSha256, claimedAt: checkedAt, secretValuesRecorded: false };
  try {
    writeJsonNoReplace(claimPath, document, { processId, temporaryId: claimId });
    return { path: claimPath, runIdSha256, created: true };
  } catch (error) {
    if (error?.message === 'NO_REPLACE_TARGET_EXISTS') return readExisting();
    throw error;
  }
}

export function evaluateOperationsActivationGate({
  p6EvidenceComplete = false, p7InProgress = false, productionGo = false,
  p6EvidencePresent = false, approvalPresent = false, receiptRootPresent = false,
  execute = false, confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!p6EvidencePresent) missing.push('p6CutoverEvidence');
  if (!approvalPresent) missing.push('activationApproval');
  if (!receiptRootPresent) missing.push('receiptRoot');
  if (missing.length) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_INPUTS', missing);
  if (!execute) return waiting('PASS_OPERATIONS_ACTIVATION_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_OPERATIONS_ACTIVATION_CONFIRMATION');
  return { status: 'READY_EXECUTE_NEXT_OPERATIONS_ACTIVATION_STEP', missing, childProcessAllowed: true, approvalReadAllowed: true, receiptWriteAllowed: true };
}

export function validateOperationsActivationApproval(value, { p6Document, checkedAt = new Date().toISOString() } = {}) {
  const failures = [];
  if (value?.schemaVersion !== 1 || value?.template !== false) failures.push('contract');
  if (value?.environment !== 'production' || value?.activationState !== 'actual' || value?.approved !== true) failures.push('provenance');
  if (value?.targetUrl !== 'https://inventory.safe-link.co.kr') failures.push('targetUrl');
  if (!ID_PATTERN.test(value?.runId ?? '')) failures.push('runId');
  if (!SHA_PATTERN.test(value?.releaseSha ?? '') || value?.releaseSha !== p6Document?.releaseSha) failures.push('releaseSha');
  if (!IDENTITY_PATTERN.test(value?.authorizedByRef ?? '')) failures.push('authorizedByRef');
  if (!validDate(value?.approvedAt) || !validDate(value?.expiresAt) || !validDate(checkedAt)) failures.push('dates');
  const checkedMs = Date.parse(checkedAt); const approvedMs = Date.parse(value?.approvedAt); const expiresMs = Date.parse(value?.expiresAt);
  if (Number.isFinite(checkedMs) && Number.isFinite(approvedMs) && Number.isFinite(expiresMs)
    && (approvedMs > checkedMs || expiresMs <= checkedMs || expiresMs - approvedMs > 45 * 86400000)) failures.push('approvalWindow');
  if (JSON.stringify(value?.allowedSteps) !== JSON.stringify(OPERATIONS_ACTIVATION_STEPS.map((step) => step.id))) failures.push('allowedSteps');
  if (JSON.stringify(value?.authorizedActions) !== JSON.stringify(OPERATIONS_ACTIVATION_ACTIONS)) failures.push('authorizedActions');
  if (p6Document?.schemaVersion !== 1 || p6Document?.environment !== 'production' || p6Document?.activationState !== 'actual'
    || p6Document?.evidenceType !== 'P6_CUTOVER_ACTUAL' || p6Document?.status !== 'PASS'
    || p6Document?.productionGo !== true || p6Document?.targetUrl !== value?.targetUrl) failures.push('p6Evidence');
  if (failures.length) throw new Error(`OPERATIONS_ACTIVATION_APPROVAL_INVALID:${[...new Set(failures)].join(',')}`);
  return value;
}

export function classifyOperationsActivationStep(step, { exitCode = 0, summary = null } = {}) {
  const status = summary?.status;
  if (exitCode !== 0 || typeof status !== 'string' || status.startsWith('FAIL_') || status.startsWith('BLOCKED_')) return 'FAIL';
  if (step.pass.includes(status)) return 'PASS';
  if (status.startsWith('READY_')) return 'WAIT';
  if (step.id === 'slo-collect' && status.startsWith('PASS_SLO_SAMPLE_')) return 'WAIT';
  return 'FAIL';
}

export function selectNextOperationsActivationStep(receipts = []) {
  const failures = [];
  for (const receipt of receipts) {
    const stepIndex = OPERATIONS_ACTIVATION_STEPS.findIndex((item) => item.id === receipt?.stepId);
    const step = OPERATIONS_ACTIVATION_STEPS[stepIndex];
    if (!step || receipt?.schemaVersion !== 1 || !ID_PATTERN.test(receipt?.runId ?? '')
      || receipt?.environment !== 'production' || receipt?.activationState !== 'actual'
      || receipt?.sequence !== stepIndex + 1 || !Number.isInteger(receipt?.attempt) || receipt.attempt < 1 || receipt.attempt > 9999
      || !['PASS', 'WAIT', 'FAIL'].includes(receipt?.outcome) || typeof receipt?.status !== 'string'
      || !Number.isInteger(receipt?.exitCode) || !validDate(receipt?.checkedAt)
      || receipt?.command?.executable !== 'node' || receipt?.command?.script !== step?.script
      || JSON.stringify(receipt?.command?.args) !== JSON.stringify(step?.args)
      || !DIGEST_PATTERN.test(receipt?.stdoutSha256 ?? '') || !DIGEST_PATTERN.test(receipt?.stderrSha256 ?? '')
      || receipt?.secretValuesRecorded !== false
      || (step && classifyOperationsActivationStep(step, { exitCode: receipt?.exitCode, summary: { status: receipt?.status } }) !== receipt?.outcome)) failures.push('receiptContract');
  }
  if (new Set(receipts.map((receipt) => receipt.runId)).size > 1) failures.push('receiptRunId');
  let earlierStepsPassed = true;
  for (const step of OPERATIONS_ACTIVATION_STEPS) {
    const stepReceipts = receipts.filter((receipt) => receipt.stepId === step.id).sort((left, right) => left.attempt - right.attempt);
    if (stepReceipts.length && !earlierStepsPassed) failures.push('receiptOrder');
    if (stepReceipts.some((receipt, index) => receipt.attempt !== index + 1)) failures.push('receiptAttemptSequence');
    const passIndexes = stepReceipts.map((receipt, index) => receipt.outcome === 'PASS' ? index : -1).filter((index) => index >= 0);
    if (passIndexes.length > 1 || (passIndexes.length === 1 && passIndexes[0] !== stepReceipts.length - 1)) failures.push('receiptTerminalPass');
    if (stepReceipts.filter((receipt) => receipt.outcome === 'FAIL').length > 3) failures.push('receiptFailureLimit');
    earlierStepsPassed = earlierStepsPassed && passIndexes.length === 1;
  }
  if (failures.length) throw new Error('OPERATIONS_ACTIVATION_RECEIPT_INVALID');
  for (const step of OPERATIONS_ACTIVATION_STEPS) {
    const stepReceipts = receipts.filter((receipt) => receipt.stepId === step.id);
    if (stepReceipts.some((receipt) => receipt.outcome === 'PASS')) continue;
    const failedAttempts = stepReceipts.filter((receipt) => receipt.outcome === 'FAIL').length;
    if (failedAttempts >= 3) return { status: 'PAUSED_OPERATIONS_ACTIVATION_STEP_FAILED_THREE_TIMES', step, attempt: stepReceipts.length + 1, failedAttempts };
    if (stepReceipts.length >= 9999) return { status: 'PAUSED_OPERATIONS_ACTIVATION_ATTEMPT_LIMIT', step, attempt: 10000, failedAttempts };
    return { status: 'READY_NEXT_OPERATIONS_ACTIVATION_STEP', step, attempt: stepReceipts.length + 1, failedAttempts };
  }
  return { status: 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE', step: null, attempt: 0, failedAttempts: 0 };
}

export function buildOperationsActivationReceipt({ approval, step, attempt, result, checkedAt = new Date().toISOString() } = {}) {
  const outcome = classifyOperationsActivationStep(step, result);
  return {
    schemaVersion: 1, environment: 'production', activationState: 'actual',
    runId: approval.runId, stepId: step.id, sequence: OPERATIONS_ACTIVATION_STEPS.indexOf(step) + 1,
    attempt, outcome, status: result.summary?.status ?? 'MISSING_STATUS', exitCode: result.exitCode,
    checkedAt, command: { executable: 'node', script: step.script, args: [...step.args] },
    stdoutSha256: createHash('sha256').update(result.stdout ?? '').digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr ?? '').digest('hex'),
    secretValuesRecorded: false
  };
}

export function writeOperationsActivationReceiptOnce(root, receipt, { processId = process.pid } = {}) {
  if (!root || !fs.existsSync(root)) throw new Error('RECEIPT_ROOT_MISSING');
  if (!Number.isInteger(receipt?.attempt) || receipt.attempt < 1 || receipt.attempt > 9999) throw new Error('RECEIPT_ATTEMPT_INVALID');
  const name = `${String(receipt.sequence).padStart(2, '0')}-${receipt.stepId}-attempt-${String(receipt.attempt).padStart(4, '0')}.json`;
  const output = path.join(root, name);
  if (fs.existsSync(output)) throw new Error('RECEIPT_ALREADY_EXISTS');
  try { writeJsonNoReplace(output, receipt, { processId }); }
  catch (error) { if (error?.message === 'NO_REPLACE_TARGET_EXISTS') throw new Error('RECEIPT_ALREADY_EXISTS'); throw error; }
  return output;
}

export function acquireOperationsActivationLease(root, runId, {
  processId = process.pid, checkedAt = new Date().toISOString(), leaseId = randomUUID()
} = {}) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('RECEIPT_ROOT_MISSING');
  if (!ID_PATTERN.test(runId ?? '') || !ID_PATTERN.test(leaseId ?? '') || !Number.isInteger(processId) || processId < 1 || !validDate(checkedAt)) {
    throw new Error('OPERATIONS_ACTIVATION_LEASE_INPUT_INVALID');
  }
  const runIdSha256 = createHash('sha256').update(runId, 'utf8').digest('hex');
  const rootClaim = claimOperationsActivationReceiptRoot(root, runId, { processId, checkedAt, claimId: leaseId });
  const leasePath = path.join(root, `.operations-activation-${runIdSha256.slice(0, 16)}.lock`);
  const document = { schemaVersion: 1, runIdSha256, leaseId, processId, acquiredAt: checkedAt, secretValuesRecorded: false };
  let handle = null; let created = false;
  try {
    handle = fs.openSync(leasePath, 'wx', 0o600); created = true;
    fs.writeFileSync(handle, `${JSON.stringify(document, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('OPERATIONS_ACTIVATION_LEASE_HELD');
    if (created && fs.existsSync(leasePath)) fs.rmSync(leasePath);
    throw error;
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
  return { path: leasePath, runIdSha256, leaseId, processId, rootClaim };
}

export function releaseOperationsActivationLease(lease) {
  if (!lease?.path || !fs.existsSync(lease.path)) throw new Error('OPERATIONS_ACTIVATION_LEASE_MISSING');
  let document;
  try { document = JSON.parse(fs.readFileSync(lease.path, 'utf8')); } catch { throw new Error('OPERATIONS_ACTIVATION_LEASE_INVALID'); }
  if (document?.schemaVersion !== 1 || document?.runIdSha256 !== lease.runIdSha256 || document?.leaseId !== lease.leaseId
    || document?.processId !== lease.processId || document?.secretValuesRecorded !== false) {
    throw new Error('OPERATIONS_ACTIVATION_LEASE_OWNERSHIP_MISMATCH');
  }
  fs.unlinkSync(lease.path);
  return true;
}
