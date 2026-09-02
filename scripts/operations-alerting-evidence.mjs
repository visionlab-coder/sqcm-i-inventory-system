import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALERTING_EVIDENCE_CONFIRMATION,
  compileOperationsAlertingEvidence,
  evaluateOperationsAlertingEvidenceCompiler,
  writeOperationsAlertingEvidenceOnce
} from '../src/operations/operations-alerting-evidence.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const execute = process.argv.includes('--compile');
const inputPath = process.env.P7_ALERT_RECEIPT_INPUT_FILE ? path.resolve(process.env.P7_ALERT_RECEIPT_INPUT_FILE) : null;
const outputPath = process.env.P7_ALERTING_EVIDENCE_OUTPUT_FILE ? path.resolve(process.env.P7_ALERTING_EVIDENCE_OUTPUT_FILE) : null;
const confirmed = process.env.P7_ALERTING_EVIDENCE_CONFIRMATION === ALERTING_EVIDENCE_CONFIRMATION;

function insideProject(candidate) {
  if (!candidate) return false;
  const relative = path.relative(projectDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const gate = evaluateOperationsAlertingEvidenceCompiler({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  inputPresent: Boolean(inputPath && fs.existsSync(inputPath)),
  outputPresent: Boolean(outputPath),
  execute,
  confirmed
});

let status = gate.status;
let receiptCount = 0;
let evidenceCreated = false;
let failureCount = 0;

if (status === 'READY_ALERTING_EVIDENCE_COMPILATION') {
  try {
    if (insideProject(inputPath)) throw new Error('INPUT_MUST_BE_OUTSIDE_REPOSITORY');
    if (insideProject(outputPath)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
    if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
    const input = readOperationsActivationInputDocument(inputPath, { repositoryRoot: projectDir });
    const source = input.value;
    receiptCount = Array.isArray(source.signals) ? source.signals.length : 0;
    const compilation = compileOperationsAlertingEvidence(source, { sourceSha256: input.sha256 });
    if (!compilation.evidence) throw new Error(`ALERTING_EVIDENCE_INVALID_${compilation.failures.length}`);
    writeOperationsAlertingEvidenceOnce(outputPath, compilation.evidence);
    status = compilation.status;
    evidenceCreated = true;
  } catch {
    status = 'BLOCKED_ALERTING_EVIDENCE_COMPILATION';
    failureCount = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredInputEnvironment: 'P7_ALERT_RECEIPT_INPUT_FILE',
  requiredOutputEnvironment: 'P7_ALERTING_EVIDENCE_OUTPUT_FILE',
  confirmationEnvironment: 'P7_ALERTING_EVIDENCE_CONFIRMATION',
  requiredSignalIds: ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'],
  missing: gate.missing,
  receiptCount,
  evidenceCreated,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  secretValuesReadOrRecorded: false,
  externalMutationPerformed: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));

if (status === 'BLOCKED_ALERTING_EVIDENCE_COMPILATION') process.exitCode = 1;
