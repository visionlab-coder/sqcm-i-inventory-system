import fs from 'node:fs';
import {
  executeProductionCutover,
  PRODUCTION_CUTOVER_CONFIRMATION,
  resumeProductionCutoverSignoff,
  SIGNOFF_RESUME_CONFIRMATION
} from '../src/operations/production-cutover-executor.mjs';
import { readOperationsPreflightManifest } from '../src/operations/operations-preflight-manifest-runtime.mjs';
import { fileURLToPath } from 'node:url';

const execute = process.argv.includes('--execute');
const resumeSignoff = process.argv.includes('--resume-signoff');
const pauseBeforeSignoff = process.argv.includes('--pause-before-signoff');
const assembleSignoffs = process.argv.includes('--assemble-signoffs');
const candidate = readOperationsPreflightManifest(
  fileURLToPath(new URL('../agent docs/harness/P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json', import.meta.url))
).value;
const releaseSha = candidate.releaseTag.replace(/^sha-/, '');
const exists = (value) => Boolean(value && fs.existsSync(value));
const existingPath = (value) => exists(value) ? value : false;
const roleResultReferences = {
  ADMIN: existingPath(process.env.PRODUCTION_UAT_ADMIN_RESULT_FILE),
  MANAGER: existingPath(process.env.PRODUCTION_UAT_MANAGER_RESULT_FILE),
  USER: existingPath(process.env.PRODUCTION_UAT_USER_RESULT_FILE)
};
const signoffReferences = {
  BUSINESS: existingPath(process.env.PRODUCTION_BUSINESS_SIGNOFF_FILE),
  SECURITY: existingPath(process.env.PRODUCTION_SECURITY_SIGNOFF_FILE),
  OPERATIONS: existingPath(process.env.PRODUCTION_OPERATIONS_SIGNOFF_FILE)
};
const signoffApprovalReceiptReferences = {
  BUSINESS: existingPath(process.env.PRODUCTION_BUSINESS_SIGNOFF_APPROVAL_RECEIPT_FILE),
  SECURITY: existingPath(process.env.PRODUCTION_SECURITY_SIGNOFF_APPROVAL_RECEIPT_FILE),
  OPERATIONS: existingPath(process.env.PRODUCTION_OPERATIONS_SIGNOFF_APPROVAL_RECEIPT_FILE)
};
const actualSignoffOutputPaths = {
  BUSINESS: process.env.PRODUCTION_BUSINESS_SIGNOFF_FILE,
  SECURITY: process.env.PRODUCTION_SECURITY_SIGNOFF_FILE,
  OPERATIONS: process.env.PRODUCTION_OPERATIONS_SIGNOFF_FILE
};
const result = resumeSignoff
  ? await resumeProductionCutoverSignoff({
    execute,
    confirmation: process.env.PRODUCTION_CUTOVER_SIGNOFF_RESUME_CONFIRMATION,
    runId: process.env.PRODUCTION_CUTOVER_RUN_ID,
    releaseSha,
    checkpointPath: process.env.PRODUCTION_CUTOVER_SIGNOFF_CHECKPOINT_FILE,
    roleResultReferences,
    signoffReferences,
    signoffApprovalReceiptReferences,
    signoffRequestBundleReference: existingPath(process.env.PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE),
    assembleActualSignoffs: assembleSignoffs,
    actualSignoffConfirmation: process.env.PRODUCTION_SIGNOFF_ACTUAL_DOCUMENT_CONFIRMATION,
    actualSignoffOutputPaths,
    finalizeActualEvidence: execute,
    actualEvidenceConfirmation: process.env.PRODUCTION_CUTOVER_EVIDENCE_ASSEMBLY_CONFIRMATION,
    actualEvidenceOutputPath: process.env.PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE
  })
  : await executeProductionCutover({
    execute,
    externalActionConfirmed: process.env.PRODUCTION_CUTOVER_CONFIRMATION === PRODUCTION_CUTOVER_CONFIRMATION,
    pauseBeforeSignoff,
    releaseSha
  });
const output = {
  ...result,
  requiredEnvironment: resumeSignoff
    ? ['PRODUCTION_CUTOVER_RUN_ID', 'PRODUCTION_CUTOVER_SIGNOFF_CHECKPOINT_FILE', 'PRODUCTION_CUTOVER_SIGNOFF_RESUME_CONFIRMATION', 'PRODUCTION_SIGNOFF_ACTUAL_DOCUMENT_CONFIRMATION', 'PRODUCTION_CUTOVER_EVIDENCE_ASSEMBLY_CONFIRMATION', 'PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE', 'PRODUCTION_UAT_ADMIN_RESULT_FILE', 'PRODUCTION_UAT_MANAGER_RESULT_FILE', 'PRODUCTION_UAT_USER_RESULT_FILE', 'PRODUCTION_BUSINESS_SIGNOFF_FILE', 'PRODUCTION_SECURITY_SIGNOFF_FILE', 'PRODUCTION_OPERATIONS_SIGNOFF_FILE', 'PRODUCTION_BUSINESS_SIGNOFF_APPROVAL_RECEIPT_FILE', 'PRODUCTION_SECURITY_SIGNOFF_APPROVAL_RECEIPT_FILE', 'PRODUCTION_OPERATIONS_SIGNOFF_APPROVAL_RECEIPT_FILE', 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE']
    : ['PRODUCTION_CUTOVER_CONFIRMATION'],
  expectedConfirmation: resumeSignoff ? SIGNOFF_RESUME_CONFIRMATION : undefined,
  secretValuesReadOrRecorded: false
};
(result.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
