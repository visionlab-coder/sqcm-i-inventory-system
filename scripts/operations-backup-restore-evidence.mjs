import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_RESTORE_EVIDENCE_CONFIRMATION,
  compileOperationsBackupRestoreEvidence,
  evaluateOperationsBackupRestoreEvidenceCompiler,
  writeOperationsBackupRestoreEvidencePairOnce
} from '../src/operations/operations-backup-restore-evidence.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectDir, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const execute = process.argv.includes('--compile');
const inputPath = process.env.P7_BACKUP_RESTORE_DRILL_INPUT_FILE ? path.resolve(process.env.P7_BACKUP_RESTORE_DRILL_INPUT_FILE) : null;
const backupOutputPath = process.env.P7_BACKUP_EVIDENCE_OUTPUT_FILE ? path.resolve(process.env.P7_BACKUP_EVIDENCE_OUTPUT_FILE) : null;
const restoreOutputPath = process.env.P7_RESTORE_EVIDENCE_OUTPUT_FILE ? path.resolve(process.env.P7_RESTORE_EVIDENCE_OUTPUT_FILE) : null;
const confirmed = process.env.P7_BACKUP_RESTORE_EVIDENCE_CONFIRMATION === BACKUP_RESTORE_EVIDENCE_CONFIRMATION;

function insideProject(candidate) {
  if (!candidate) return false;
  const relative = path.relative(projectDir, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const gate = evaluateOperationsBackupRestoreEvidenceCompiler({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  inputPresent: Boolean(inputPath && fs.existsSync(inputPath)),
  backupOutputPresent: Boolean(backupOutputPath),
  restoreOutputPresent: Boolean(restoreOutputPath),
  execute,
  confirmed
});

let status = gate.status;
let evidenceCreated = false;
let failureCount = 0;

if (status === 'READY_BACKUP_RESTORE_EVIDENCE_COMPILATION') {
  try {
    if ([inputPath, backupOutputPath, restoreOutputPath].some(insideProject)) throw new Error('INPUT_AND_OUTPUTS_MUST_BE_OUTSIDE_REPOSITORY');
    const input = readOperationsActivationInputDocument(inputPath, { repositoryRoot: projectDir });
    const source = input.value;
    const compilation = compileOperationsBackupRestoreEvidence(source, { sourceSha256: input.sha256 });
    if (!compilation.evidence) throw new Error(`BACKUP_RESTORE_EVIDENCE_INVALID_${compilation.failures.length}`);
    writeOperationsBackupRestoreEvidencePairOnce(backupOutputPath, restoreOutputPath, compilation.evidence);
    status = compilation.status;
    evidenceCreated = true;
  } catch {
    status = 'BLOCKED_BACKUP_RESTORE_EVIDENCE_COMPILATION';
    failureCount = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredInputEnvironment: 'P7_BACKUP_RESTORE_DRILL_INPUT_FILE',
  requiredOutputEnvironments: ['P7_BACKUP_EVIDENCE_OUTPUT_FILE', 'P7_RESTORE_EVIDENCE_OUTPUT_FILE'],
  confirmationEnvironment: 'P7_BACKUP_RESTORE_EVIDENCE_CONFIRMATION',
  missing: gate.missing,
  evidenceCreated,
  createdDocumentCount: evidenceCreated ? 2 : 0,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  secretValuesReadOrRecorded: false,
  externalMutationPerformed: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));

if (status === 'BLOCKED_BACKUP_RESTORE_EVIDENCE_COMPILATION') process.exitCode = 1;
