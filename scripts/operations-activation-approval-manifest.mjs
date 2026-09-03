import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION,
  buildOperationsActivationApprovalManifest,
  evaluateOperationsActivationApprovalManifestGate,
  writeOperationsActivationApprovalManifestOnce
} from '../src/operations/operations-activation-approval-manifest.mjs';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';
import { readOperationsRoadmapControl } from '../src/operations/operations-roadmap-control-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = readOperationsRoadmapControl(projectRoot).value;
const p6 = roadmap.phases.find((phase) => phase.id === 'P6'); const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const p6Path = process.env.P7_P6_CUTOVER_EVIDENCE_FILE ? path.resolve(process.env.P7_P6_CUTOVER_EVIDENCE_FILE) : null;
const requestPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE) : null;
const receiptPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE) : null;
const outputPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_FILE) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(candidate)).toLowerCase() === candidate.toLowerCase(); } catch { return false; }
}
function externalNewFile(candidate) {
  if (!candidate || fs.existsSync(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const parent = path.dirname(candidate); const stat = fs.lstatSync(parent); return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(parent)).toLowerCase() === parent.toLowerCase(); } catch { return false; }
}

const gate = evaluateOperationsActivationApprovalManifestGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress', productionGo: roadmap.invariants?.productionGo === true,
  p6EvidencePresent: externalPhysicalFile(p6Path), approvalRequestPresent: externalPhysicalFile(requestPath),
  approvalReceiptPresent: externalPhysicalFile(receiptPath), outputConfigured: externalNewFile(outputPath), outputExists: externalPhysicalFile(outputPath),
  execute: process.argv.includes('--assemble'), confirmed: process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION === OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION
});

let status = gate.status; let inputDocumentReadCount = 0; let outputCreated = false; let failureCount = 0;
if (gate.inputReadAllowed) {
  try {
    const p6Input = readOperationsActivationInputDocument(p6Path, { repositoryRoot: projectRoot }); inputDocumentReadCount += 1;
    const requestInput = readOperationsActivationInputDocument(requestPath, { repositoryRoot: projectRoot }); inputDocumentReadCount += 1;
    const receiptInput = readOperationsActivationInputDocument(receiptPath, { repositoryRoot: projectRoot }); inputDocumentReadCount += 1;
    const value = buildOperationsActivationApprovalManifest({
      requestDocument: requestInput.value,
      approvalReceipt: receiptInput.value,
      approvalReceiptSha256: receiptInput.sha256,
      p6Document: p6Input.value,
      p6EvidenceSha256: p6Input.sha256,
      activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot)
    });
    writeOperationsActivationApprovalManifestOnce(outputPath, value, { repositoryRoot: projectRoot });
    outputCreated = true; status = 'PASS_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_ASSEMBLED';
  } catch {
    status = 'BLOCKED_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_ASSEMBLY'; failureCount = 1; process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredP6Environment: 'P7_P6_CUTOVER_EVIDENCE_FILE',
  requiredRequestEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE',
  requiredReceiptEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE',
  requiredOutputEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_FILE',
  confirmationEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_MANIFEST_CONFIRMATION',
  missing: gate.missing, inputDocumentReadCount, outputCreated, failureCount,
  externalApprovalCreated: false, externalSignatureCreated: false, externalMessageSent: false,
  activationExecutionPerformed: false, externalMutationPerformed: false,
  localEvidenceWritePerformed: outputCreated, secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
