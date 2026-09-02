import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileOperationsSloEvidence,
  evaluateOperationsSloEvidenceCompiler,
  SLO_EVIDENCE_CONFIRMATION,
  writeOperationsSloEvidenceOnce
} from '../src/operations/operations-slo-evidence.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';
import { readOperationsRoadmapControl } from '../src/operations/operations-roadmap-control-reader.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = readOperationsRoadmapControl(projectDir).value;
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const execute = process.argv.includes('--compile');
const inputPath = process.env.P7_SLO_MEASUREMENT_INPUT_FILE ? path.resolve(process.env.P7_SLO_MEASUREMENT_INPUT_FILE) : null;
const outputPath = process.env.P7_SLO_EVIDENCE_OUTPUT_FILE ? path.resolve(process.env.P7_SLO_EVIDENCE_OUTPUT_FILE) : null;
const confirmed = process.env.P7_SLO_EVIDENCE_CONFIRMATION === SLO_EVIDENCE_CONFIRMATION;

function insideProject(candidate) {
  if (!candidate) return false;
  const relative = path.relative(projectDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const gate = evaluateOperationsSloEvidenceCompiler({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  inputPresent: Boolean(inputPath && fs.existsSync(inputPath)),
  outputPresent: Boolean(outputPath),
  execute,
  confirmed
});

let status = gate.status;
let sourceSampleCount = 0;
let evidenceCreated = false;
let failureCount = 0;
let metrics = null;

if (status === 'READY_SLO_EVIDENCE_COMPILATION') {
  try {
    if (insideProject(inputPath)) throw new Error('INPUT_MUST_BE_OUTSIDE_REPOSITORY');
    if (insideProject(outputPath)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
    if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
    const input = readOperationsActivationInputDocument(inputPath, { repositoryRoot: projectDir });
    const source = input.value;
    sourceSampleCount = Array.isArray(source.samples) ? source.samples.length : 0;
    const compilation = compileOperationsSloEvidence(source, { sourceSha256: input.sha256 });
    if (!compilation.evidence) throw new Error(`SLO_EVIDENCE_INVALID_${compilation.failures.length}`);
    writeOperationsSloEvidenceOnce(outputPath, compilation.evidence);
    status = compilation.status;
    metrics = compilation.evidence.metrics;
    evidenceCreated = true;
  } catch {
    status = 'BLOCKED_SLO_EVIDENCE_COMPILATION';
    failureCount = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredInputEnvironment: 'P7_SLO_MEASUREMENT_INPUT_FILE',
  requiredOutputEnvironment: 'P7_SLO_EVIDENCE_OUTPUT_FILE',
  confirmationEnvironment: 'P7_SLO_EVIDENCE_CONFIRMATION',
  requiredTargetUrl: 'https://inventory.safe-link.co.kr',
  requiredMeasurementWindowDays: 30,
  missing: gate.missing,
  sourceSampleCount,
  metrics,
  evidenceCreated,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  secretValuesReadOrRecorded: false,
  externalMutationPerformed: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));

if (status === 'BLOCKED_SLO_EVIDENCE_COMPILATION') process.exitCode = 1;
