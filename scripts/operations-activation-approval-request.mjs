import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION,
  buildOperationsActivationApprovalRequest,
  evaluateOperationsActivationApprovalRequestGate,
  writeOperationsActivationApprovalRequestOnce
} from '../src/operations/operations-activation-approval-request.mjs';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';
import { readOperationsRoadmapControl } from '../src/operations/operations-roadmap-control-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = readOperationsRoadmapControl(projectRoot).value;
const p6 = roadmap.phases.find((phase) => phase.id === 'P6'); const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const p6Path = process.env.P7_P6_CUTOVER_EVIDENCE_FILE ? path.resolve(process.env.P7_P6_CUTOVER_EVIDENCE_FILE) : null;
const outputPath = process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE ? path.resolve(process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(candidate)).toLowerCase() === candidate.toLowerCase(); } catch { return false; }
}
function externalNewFile(candidate) {
  if (!candidate || fs.existsSync(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const parent = path.dirname(candidate); const stat = fs.lstatSync(parent); return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(parent)).toLowerCase() === parent.toLowerCase(); } catch { return false; }
}

const gate = evaluateOperationsActivationApprovalRequestGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress', productionGo: roadmap.invariants?.productionGo === true,
  p6EvidencePresent: externalPhysicalFile(p6Path), outputConfigured: externalNewFile(outputPath), outputExists: externalPhysicalFile(outputPath),
  execute: process.argv.includes('--assemble'), confirmed: process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION === OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION
});

let status = gate.status; let inputDocumentReadCount = 0; let outputCreated = false; let failureCount = 0;
if (gate.inputReadAllowed) {
  try {
    const p6Input = readOperationsActivationInputDocument(p6Path, { repositoryRoot: projectRoot }); inputDocumentReadCount = 1;
    const value = buildOperationsActivationApprovalRequest({ p6Document: p6Input.value, p6EvidenceSha256: p6Input.sha256, activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot) });
    writeOperationsActivationApprovalRequestOnce(outputPath, value, { repositoryRoot: projectRoot }); outputCreated = true; status = 'PASS_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_ASSEMBLED';
  } catch { status = 'BLOCKED_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_ASSEMBLY'; failureCount = 1; process.exitCode = 1; }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredP6Environment: 'P7_P6_CUTOVER_EVIDENCE_FILE', requiredOutputEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE',
  confirmationEnvironment: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_CONFIRMATION', missing: gate.missing,
  inputDocumentReadCount, outputCreated, failureCount,
  externalApprovalCreated: false, externalMessageSent: false, externalMutationPerformed: false,
  localEvidenceWritePerformed: outputCreated, secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
