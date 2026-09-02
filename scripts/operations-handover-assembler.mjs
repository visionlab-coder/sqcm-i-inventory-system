import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOperationsHandoverManifest,
  evaluateOperationsHandoverAssembler,
  HANDOVER_ASSEMBLY_CONFIRMATION,
  HANDOVER_EVIDENCE_ENVIRONMENT,
  writeOperationsHandoverManifestOnce
} from '../src/operations/operations-handover-assembler.mjs';
import { loadActualOperationsEvidenceDocument, validateActualOperationsHandoverEvidence } from '../src/operations/operations-handover-finalizer.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const execute = process.argv.includes('--assemble');
const outputPath = process.env.P7_HANDOVER_MANIFEST_OUTPUT_FILE ? path.resolve(process.env.P7_HANDOVER_MANIFEST_OUTPUT_FILE) : null;
const pathEntries = Object.entries(HANDOVER_EVIDENCE_ENVIRONMENT).map(([name, envName]) => [name, process.env[envName] ? path.resolve(process.env[envName]) : null]);
const referencePresence = Object.fromEntries(pathEntries.map(([name, value]) => [name, Boolean(value && fs.existsSync(value))]));
const confirmed = process.env.P7_HANDOVER_ASSEMBLY_CONFIRMATION === HANDOVER_ASSEMBLY_CONFIRMATION;
const gate = evaluateOperationsHandoverAssembler({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  referencePresence,
  outputReferencePresent: Boolean(outputPath),
  execute,
  confirmed
});

function insideProject(candidate) {
  const relative = path.relative(projectDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

let status = gate.status;
let verifiedDocumentCount = 0;
let manifestCreated = false;
let failureCount = 0;

if (status === 'READY_HANDOVER_MANIFEST_ASSEMBLY') {
  try {
    if (insideProject(outputPath)) throw new Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
    if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
    const documents = Object.fromEntries(pathEntries.map(([name, filePath]) => [name, loadActualOperationsEvidenceDocument(
      { path: filePath },
      { baseDir: path.dirname(filePath), repositoryRoot: projectDir }
    )]));
    if (Object.values(documents).some((document) => document.loadError)) throw new Error('HANDOVER_DOCUMENT_REFERENCE_INVALID');
    const references = Object.fromEntries(pathEntries.map(([name, filePath]) => [name, { path: filePath, sha256: documents[name].actualSha256 }]));
    const manifest = buildOperationsHandoverManifest({ references, documents });
    const validation = validateActualOperationsHandoverEvidence(manifest, { documents });
    if (!validation.p7CompletionReady) throw new Error(`BUNDLE_VALIDATION_FAILED_${validation.failures.length}`);
    writeOperationsHandoverManifestOnce(outputPath, manifest);
    status = 'PASS_HANDOVER_MANIFEST_ASSEMBLED';
    verifiedDocumentCount = validation.verifiedDocumentCount;
    manifestCreated = true;
  } catch {
    status = 'BLOCKED_HANDOVER_MANIFEST_ASSEMBLY';
    failureCount = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredInputEnvironment: Object.values(HANDOVER_EVIDENCE_ENVIRONMENT),
  requiredOutputEnvironment: 'P7_HANDOVER_MANIFEST_OUTPUT_FILE',
  confirmationEnvironment: 'P7_HANDOVER_ASSEMBLY_CONFIRMATION',
  missingCount: gate.missing.length,
  missing: gate.missing,
  verifiedDocumentCount,
  manifestCreated,
  failureCount,
  secretValuesReadOrRecorded: false,
  externalMutationPerformed: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));

if (status === 'BLOCKED_HANDOVER_MANIFEST_ASSEMBLY') process.exitCode = 1;
