import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_SIGNOFF_REQUEST_BUNDLE_CONFIRMATION,
  buildProductionSignoffRequestBundle,
  evaluateProductionSignoffRequestBundleGate,
  writeProductionSignoffRequestBundle
} from '../src/operations/production-signoff-request-bundle.mjs';
import { loadJsonDocument, loadRunReceiptDocuments } from '../src/operations/production-cutover-actual-evidence.mjs';
import { PRODUCTION_CUTOVER_RECEIPT_ROOT } from '../src/operations/production-cutover-process-runner.mjs';
import {
  loadSignoffPauseCheckpoint,
  validateSignoffResumeReceiptDocuments
} from '../src/operations/production-cutover-signoff-resume.mjs';
import { compileProductionRoleResultEvidence } from '../src/operations/production-role-result-evidence.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_RESULT_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_RESULT_FILE',
  USER: 'PRODUCTION_UAT_USER_RESULT_FILE'
});
const RUN_ENV = 'PRODUCTION_CUTOVER_RUN_ID';
const CHECKPOINT_ENV = 'PRODUCTION_CUTOVER_SIGNOFF_CHECKPOINT_FILE';
const OUTPUT_ENV = 'PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE';
const CONFIRM_ENV = 'PRODUCTION_SIGNOFF_REQUEST_BUNDLE_CONFIRMATION';

function externalPhysicalFile(candidate) {
  if (!candidate || !path.isAbsolute(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase();
  } catch { return false; }
}

function externalNewFile(candidate) {
  if (!candidate || !path.isAbsolute(candidate) || fs.existsSync(candidate)
    || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate); const stat = fs.lstatSync(parent);
    return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(parent)).toLowerCase() === path.resolve(parent).toLowerCase();
  } catch { return false; }
}

const now = new Date();
const checkpointPath = process.env[CHECKPOINT_ENV] ? path.resolve(process.env[CHECKPOINT_ENV]) : null;
const rolePaths = Object.fromEntries(Object.entries(ROLE_ENV).map(([role, env]) => [
  role, process.env[env] ? path.resolve(process.env[env]) : null
]));
const outputPath = process.env[OUTPUT_ENV] ? path.resolve(process.env[OUTPUT_ENV]) : null;
const inputReferencesReady = Boolean(process.env[RUN_ENV]) && externalPhysicalFile(checkpointPath)
  && Object.values(rolePaths).every(externalPhysicalFile);
const gate = evaluateProductionSignoffRequestBundleGate({
  insideWindow: now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.rollbackCutoff),
  inputReferencesReady,
  outputConfigured: externalNewFile(outputPath),
  outputExists: externalPhysicalFile(outputPath),
  prepare: process.argv.includes('--prepare'),
  confirmed: process.env[CONFIRM_ENV] === PRODUCTION_SIGNOFF_REQUEST_BUNDLE_CONFIRMATION
});

let status = gate.status;
let inputDocumentReadCount = 0;
let outputCreated = false;
let failureCount = 0;
if (gate.inputReadAllowed) {
  try {
    const checkpoint = loadSignoffPauseCheckpoint(checkpointPath, { repositoryRoot: projectRoot });
    inputDocumentReadCount = 1;
    if (checkpoint.runId !== process.env[RUN_ENV]) throw new Error('SIGNOFF_REQUEST_CHECKPOINT_RUN_MISMATCH');
    const receipts = loadRunReceiptDocuments(PRODUCTION_CUTOVER_RECEIPT_ROOT, checkpoint.runId, { repositoryRoot: projectRoot });
    inputDocumentReadCount += receipts.length;
    const receiptValidation = validateSignoffResumeReceiptDocuments({
      documents: receipts.map(({ fileName, value, sha256 }) => ({ name: fileName, value, sha256 })), checkpoint
    });
    if (receiptValidation.status !== 'PASS_SIGNOFF_RESUME_RECEIPTS') throw new Error('SIGNOFF_REQUEST_RECEIPTS_INVALID');
    const roleStepDocument = receipts.find((document) => document.value?.kind === 'step'
      && document.value?.gate === 'core_smoke' && document.value?.step === 'role-core-smoke');
    const coreGateDocument = receipts.find((document) => document.value?.kind === 'gate' && document.value?.gate === 'core_smoke');
    const expected = compileProductionRoleResultEvidence({
      roleStepDocument, coreGateDocument, runId: checkpoint.runId, releaseSha: checkpoint.releaseSha
    });
    if (expected.failures.length) throw new Error('SIGNOFF_REQUEST_ROLE_RECEIPTS_INVALID');
    const roleResultDocuments = Object.fromEntries(Object.entries(rolePaths).map(([role, file]) => {
      const value = loadJsonDocument(file, { repositoryRoot: projectRoot }).value;
      inputDocumentReadCount += 1;
      return [role, value];
    }));
    if (Object.keys(roleResultDocuments).some((role) => JSON.stringify(roleResultDocuments[role]) !== JSON.stringify(expected.documents[role]))) {
      throw new Error('SIGNOFF_REQUEST_ROLE_RESULTS_MISMATCH');
    }
    const rollbackGateSha = checkpoint.completedGates?.find((item) => item.gate === 'rollback')?.evidenceSha256;
    const value = buildProductionSignoffRequestBundle({
      runId: checkpoint.runId, releaseSha: checkpoint.releaseSha,
      coreGateSha: coreGateDocument.sha256, rollbackGateSha,
      roleResultDocuments, preparedAt: now.toISOString()
    });
    writeProductionSignoffRequestBundle(outputPath, value, { repositoryRoot: projectRoot });
    outputCreated = true;
    status = 'PASS_PRODUCTION_SIGNOFF_REQUEST_BUNDLE_PREPARED';
  } catch {
    status = 'BLOCKED_PRODUCTION_SIGNOFF_REQUEST_BUNDLE_PREPARATION';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: now.toISOString(), status,
  requiredEnvironment: [RUN_ENV, CHECKPOINT_ENV, ...Object.values(ROLE_ENV), OUTPUT_ENV, CONFIRM_ENV],
  missing: gate.missing, inputDocumentReadCount, outputCreated, failureCount,
  externalSignatureCreated: false, externalMessageSent: false,
  externalMutationPerformed: false, localEvidenceWritePerformed: outputCreated,
  secretValuesReadOrRecorded: false, productionGo: false
}, null, 2));
