import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateOperationsActivationApprovalChainPreflightGate,
  verifyOperationsActivationApprovalChain
} from '../src/operations/operations-activation-approval-chain-preflight.mjs';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6'); const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const paths = {
  p6: process.env.P7_P6_CUTOVER_EVIDENCE_FILE,
  request: process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE,
  receipt: process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE,
  manifest: process.env.P7_OPERATIONS_ACTIVATION_APPROVAL_FILE
};
for (const [key, value] of Object.entries(paths)) paths[key] = value ? path.resolve(value) : null;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false) && path.resolve(fs.realpathSync(candidate)).toLowerCase() === candidate.toLowerCase(); } catch { return false; }
}
const present = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, externalPhysicalFile(value)]));
const gate = evaluateOperationsActivationApprovalChainPreflightGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete', p7InProgress: p7?.status === 'in-progress', productionGo: roadmap.invariants?.productionGo === true,
  p6EvidencePresent: present.p6, approvalRequestPresent: present.request,
  approvalReceiptPresent: present.receipt, approvalManifestPresent: present.manifest,
  verify: process.argv.includes('--verify')
});

let status = gate.status; let inputDocumentReadCount = 0; let failureCount = 0; let verification = null;
if (gate.inputReadAllowed) {
  try {
    const inputs = {};
    for (const key of ['p6', 'request', 'receipt', 'manifest']) {
      inputs[key] = readOperationsActivationInputDocument(paths[key], { repositoryRoot: projectRoot }); inputDocumentReadCount += 1;
    }
    verification = verifyOperationsActivationApprovalChain({
      p6: inputs.p6.value, request: inputs.request.value,
      receipt: inputs.receipt.value, manifest: inputs.manifest.value,
      p6EvidenceSha256: inputs.p6.sha256, approvalRequestSha256: inputs.request.sha256,
      approvalReceiptSha256: inputs.receipt.sha256, approvalManifestSha256: inputs.manifest.sha256,
      activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot)
    });
    status = verification.status;
  } catch {
    status = 'BLOCKED_OPERATIONS_ACTIVATION_APPROVAL_CHAIN_PREFLIGHT'; failureCount = 1; process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status,
  requiredEnvironment: {
    p6: 'P7_P6_CUTOVER_EVIDENCE_FILE', request: 'P7_OPERATIONS_ACTIVATION_APPROVAL_REQUEST_FILE',
    receipt: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT_FILE', manifest: 'P7_OPERATIONS_ACTIVATION_APPROVAL_FILE'
  },
  missing: gate.missing, inputDocumentReadCount,
  verifiedDocumentCount: verification?.verifiedDocumentCount ?? 0,
  failureCount, localEvidenceWritePerformed: false, activationExecutionPerformed: false,
  leaseAcquired: false, childProcessCount: 0, receiptCreated: false,
  externalMutationPerformed: false, secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
