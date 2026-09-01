import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  evaluateOperationsActivationApprovalChainPreflightGate,
  verifyOperationsActivationApprovalChain
} from '../src/operations/operations-activation-approval-chain-preflight.mjs';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';

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
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

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
    const raw = {};
    for (const key of ['p6', 'request', 'receipt', 'manifest']) {
      raw[key] = fs.readFileSync(paths[key]); inputDocumentReadCount += 1;
    }
    verification = verifyOperationsActivationApprovalChain({
      p6: JSON.parse(raw.p6.toString('utf8')), request: JSON.parse(raw.request.toString('utf8')),
      receipt: JSON.parse(raw.receipt.toString('utf8')), manifest: JSON.parse(raw.manifest.toString('utf8')),
      p6EvidenceSha256: sha256(raw.p6), approvalRequestSha256: sha256(raw.request),
      approvalReceiptSha256: sha256(raw.receipt), approvalManifestSha256: sha256(raw.manifest),
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
