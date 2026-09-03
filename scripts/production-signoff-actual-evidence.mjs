import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonDocument } from '../src/operations/production-cutover-actual-evidence.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_ACTUAL_SIGNOFF_CONFIRMATION,
  assembleProductionActualSignoffDocuments,
  evaluateProductionActualSignoffGate,
  writeProductionActualSignoffDocuments
} from '../src/operations/production-signoff-actual-evidence.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUEST_ENV = 'PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE';
const RECEIPT_ENV = Object.freeze({
  BUSINESS: 'PRODUCTION_BUSINESS_SIGNOFF_APPROVAL_RECEIPT_FILE',
  SECURITY: 'PRODUCTION_SECURITY_SIGNOFF_APPROVAL_RECEIPT_FILE',
  OPERATIONS: 'PRODUCTION_OPERATIONS_SIGNOFF_APPROVAL_RECEIPT_FILE'
});
const OUTPUT_ENV = Object.freeze({
  BUSINESS: 'PRODUCTION_BUSINESS_SIGNOFF_FILE',
  SECURITY: 'PRODUCTION_SECURITY_SIGNOFF_FILE',
  OPERATIONS: 'PRODUCTION_OPERATIONS_SIGNOFF_FILE'
});
const CONFIRM_ENV = 'PRODUCTION_SIGNOFF_ACTUAL_DOCUMENT_CONFIRMATION';

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
const requestPath = process.env[REQUEST_ENV] ? path.resolve(process.env[REQUEST_ENV]) : null;
const receiptPaths = Object.fromEntries(Object.entries(RECEIPT_ENV).map(([area, env]) => [
  area, process.env[env] ? path.resolve(process.env[env]) : null
]));
const outputPaths = Object.fromEntries(Object.entries(OUTPUT_ENV).map(([area, env]) => [
  area, process.env[env] ? path.resolve(process.env[env]) : null
]));
const allInputPaths = [requestPath, ...Object.values(receiptPaths)];
const allOutputPaths = Object.values(outputPaths);
const gate = evaluateProductionActualSignoffGate({
  insideWindow: now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.rollbackCutoff),
  inputReferencesReady: allInputPaths.every(externalPhysicalFile),
  outputsConfigured: allOutputPaths.every(externalNewFile),
  outputsExist: allOutputPaths.some(externalPhysicalFile),
  assemble: process.argv.includes('--assemble'),
  confirmed: process.env[CONFIRM_ENV] === PRODUCTION_ACTUAL_SIGNOFF_CONFIRMATION
});

let status = gate.status;
let inputDocumentReadCount = 0;
let outputDocumentCreatedCount = 0;
let failureCount = 0;
if (gate.inputReadAllowed) {
  try {
    const requestBundleDocument = loadJsonDocument(requestPath, { repositoryRoot: projectRoot });
    inputDocumentReadCount += 1;
    const approvalReceiptDocuments = Object.fromEntries(Object.entries(receiptPaths).map(([area, file]) => {
      const document = loadJsonDocument(file, { repositoryRoot: projectRoot });
      inputDocumentReadCount += 1;
      return [area, document];
    }));
    const result = assembleProductionActualSignoffDocuments({ requestBundleDocument, approvalReceiptDocuments });
    writeProductionActualSignoffDocuments(outputPaths, result.documents, { repositoryRoot: projectRoot });
    outputDocumentCreatedCount = 3;
    status = result.status;
  } catch (error) {
    status = 'BLOCKED_PRODUCTION_ACTUAL_SIGNOFF_DOCUMENT_ASSEMBLY';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: now.toISOString(), status,
  requiredEnvironment: [REQUEST_ENV, ...Object.values(RECEIPT_ENV), ...Object.values(OUTPUT_ENV), CONFIRM_ENV],
  missing: gate.missing, inputDocumentReadCount, outputDocumentCreatedCount, failureCount,
  externalApprovalCreated: false, externalMessageSent: false,
  externalMutationPerformed: outputDocumentCreatedCount > 0,
  secretValuesReadOrRecorded: false, productionGo: false
}, null, 2));
