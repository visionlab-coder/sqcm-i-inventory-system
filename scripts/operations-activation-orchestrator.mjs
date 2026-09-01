import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONS_ACTIVATION_CONFIRMATION,
  acquireOperationsActivationLease,
  computeOperationsActivationBundleSha256,
  evaluateOperationsActivationGate,
  releaseOperationsActivationLease,
  selectNextOperationsActivationStep,
  validateOperationsActivationApproval
} from '../src/operations/operations-activation-orchestrator.mjs';
import { executeOperationsActivationSelection } from '../src/operations/operations-activation-process-runner.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6'); const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const p6Path = process.env.P7_P6_CUTOVER_EVIDENCE_FILE ? path.resolve(process.env.P7_P6_CUTOVER_EVIDENCE_FILE) : null;
const approvalPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_FILE) : null;
const approvalReceiptPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE) : null;
const receiptRoot = process.env.P7_OPERATIONS_ACTIVATION_RECEIPT_ROOT ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_RECEIPT_ROOT) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase(); } catch { return false; }
}
function externalPhysicalDirectory(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const stat = fs.lstatSync(candidate); return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase(); } catch { return false; }
}
function loadReceipts(root, runId) {
  return fs.readdirSync(root).filter((name) => /^\d{2}-[a-z0-9-]+-attempt-\d{4}\.json$/.test(name)).sort().map((name) => {
    const candidate = path.join(root, name); if (!externalPhysicalFile(candidate)) throw new Error('RECEIPT_NOT_PHYSICAL_FILE');
    const value = JSON.parse(fs.readFileSync(candidate, 'utf8')); if (value.runId !== runId) throw new Error('RECEIPT_RUN_ID_MISMATCH');
    const expectedName = `${String(value.sequence).padStart(2, '0')}-${value.stepId}-attempt-${String(value.attempt).padStart(4, '0')}.json`;
    if (name !== expectedName) throw new Error('RECEIPT_FILENAME_MISMATCH');
    return value;
  });
}

const gate = evaluateOperationsActivationGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress', productionGo: roadmap.invariants?.productionGo === true,
  p6EvidencePresent: externalPhysicalFile(p6Path), approvalPresent: externalPhysicalFile(approvalPath), approvalReceiptPresent: externalPhysicalFile(approvalReceiptPath), receiptRootPresent: externalPhysicalDirectory(receiptRoot),
  execute: process.argv.includes('--execute'), confirmed: process.env.P7_OPERATIONS_ACTIVATION_CONFIRMATION === OPERATIONS_ACTIVATION_CONFIRMATION
});

let status = gate.status; let childProcessCount = 0; let receiptCreated = false; let currentStep = null; let attempt = 0; let failureCount = 0;
let lease = null; let leaseAcquired = false; let leaseReleased = false; let leaseConflict = false; let receiptRootClaimCreated = false; let activationBundleVerified = false; let approvalReceiptVerified = false;
if (gate.childProcessAllowed) {
  try {
    const p6Raw = fs.readFileSync(p6Path); const p6Document = JSON.parse(p6Raw.toString('utf8'));
    const approvalReceiptRaw = fs.readFileSync(approvalReceiptPath); const approvalReceipt = JSON.parse(approvalReceiptRaw.toString('utf8'));
    const activationBundleSha256 = computeOperationsActivationBundleSha256(projectRoot);
    const approval = validateOperationsActivationApproval(JSON.parse(fs.readFileSync(approvalPath, 'utf8')), {
      p6Document, p6EvidenceSha256: createHash('sha256').update(p6Raw).digest('hex'), activationBundleSha256,
      approvalReceipt, approvalReceiptSha256: createHash('sha256').update(approvalReceiptRaw).digest('hex')
    }); activationBundleVerified = true; approvalReceiptVerified = true;
    lease = acquireOperationsActivationLease(receiptRoot, approval); leaseAcquired = true; receiptRootClaimCreated = lease.rootClaim.created;
    const selection = selectNextOperationsActivationStep(loadReceipts(receiptRoot, approval.runId), { approval });
    status = selection.status; currentStep = selection.step?.id ?? null; attempt = selection.attempt; failureCount = selection.failedAttempts;
    if (selection.step && !status.startsWith('PAUSED_')) {
      const execution = executeOperationsActivationSelection({ projectRoot, selection, approval, receiptRoot });
      childProcessCount = execution.childProcessCount; receiptCreated = true; status = execution.status;
      if (execution.receipt.outcome === 'FAIL') { failureCount += 1; process.exitCode = 1; }
    }
  } catch (error) {
    if (error?.message === 'OPERATIONS_ACTIVATION_LEASE_HELD') { status = 'READY_WAIT_OPERATIONS_ACTIVATION_LEASE'; leaseConflict = true; }
    else { status = 'FAIL_OPERATIONS_ACTIVATION_ORCHESTRATOR'; failureCount += 1; process.exitCode = 1; }
  } finally {
    if (lease) {
      try { releaseOperationsActivationLease(lease); leaseReleased = true; }
      catch { status = 'FAIL_OPERATIONS_ACTIVATION_LEASE_RELEASE'; failureCount += 1; process.exitCode = 1; }
    }
  }
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status, currentStep, attempt, failureCount,
  requiredP6Environment: 'P7_P6_CUTOVER_EVIDENCE_FILE', requiredApprovalEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_FILE', requiredApprovalReceiptEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE',
  requiredReceiptRootEnvironment: 'P7_OPERATIONS_ACTIVATION_RECEIPT_ROOT', confirmationEnvironment: 'P7_OPERATIONS_ACTIVATION_CONFIRMATION',
  missing: gate.missing, childProcessCount, receiptCreated, receiptRootClaimCreated, leaseAcquired, leaseReleased, leaseConflict,
  activationBundleVerified, approvalReceiptVerified,
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7Status: p7?.status ?? null,
  secretValuesReadOrRecorded: false, productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
