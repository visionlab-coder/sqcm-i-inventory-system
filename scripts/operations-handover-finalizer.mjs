import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDOVER_DOMAINS } from '../src/operations/operations-handover-preflight.mjs';
import { loadActualOperationsHandoverBundle, validateActualOperationsHandoverEvidence } from '../src/operations/operations-handover-finalizer.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const reference = process.env.OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE;
const actualEvidencePath = reference ? path.resolve(reference) : null;
const actualEvidencePresent = Boolean(actualEvidencePath && fs.existsSync(actualEvidencePath));

let status = 'READY_WAIT_P6_COMPLETION_AND_HANDOVER_EVIDENCE';
let failureCount = 0;
let verifiedDocumentCount = 0;
let p7CompletionReady = false;

if (p6?.status === 'evidence-complete' && p7?.status !== 'in-progress') status = 'READY_WAIT_P7_ACTIVATION';
else if (p6?.status === 'evidence-complete' && p7?.status === 'in-progress' && !actualEvidencePresent) status = 'READY_WAIT_ACTUAL_HANDOVER_EVIDENCE';
else if (p6?.status === 'evidence-complete' && p7?.status === 'in-progress' && actualEvidencePresent) {
  const evidence = JSON.parse(fs.readFileSync(actualEvidencePath, 'utf8'));
  const result = validateActualOperationsHandoverEvidence(evidence, { documents: loadActualOperationsHandoverBundle(evidence, { baseDir: path.dirname(actualEvidencePath) }) });
  status = result.status;
  failureCount = result.failures.length;
  verifiedDocumentCount = result.verifiedDocumentCount;
  p7CompletionReady = result.p7CompletionReady;
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredEnvironment: 'OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE',
  actualEvidencePresent,
  requiredDocumentCount: HANDOVER_DOMAINS.length + 2,
  verifiedDocumentCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  failureCount,
  p7CompletionReady,
  secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));

if (status === 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID') process.exitCode = 1;
