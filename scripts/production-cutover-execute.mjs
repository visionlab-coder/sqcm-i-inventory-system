import fs from 'node:fs';
import {
  executeProductionCutover,
  PRODUCTION_CUTOVER_CONFIRMATION,
  resumeProductionCutoverSignoff,
  SIGNOFF_RESUME_CONFIRMATION
} from '../src/operations/production-cutover-executor.mjs';

const execute = process.argv.includes('--execute');
const resumeSignoff = process.argv.includes('--resume-signoff');
const pauseBeforeSignoff = process.argv.includes('--pause-before-signoff');
const candidate = JSON.parse(fs.readFileSync(new URL('../agent docs/harness/P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json', import.meta.url), 'utf8'));
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
const result = resumeSignoff
  ? await resumeProductionCutoverSignoff({
    execute,
    confirmation: process.env.PRODUCTION_CUTOVER_SIGNOFF_RESUME_CONFIRMATION,
    runId: process.env.PRODUCTION_CUTOVER_RUN_ID,
    releaseSha,
    checkpointPath: process.env.PRODUCTION_CUTOVER_SIGNOFF_CHECKPOINT_FILE,
    roleResultReferences,
    signoffReferences,
    finalizeActualEvidence: process.argv.includes('--finalize-actual-evidence'),
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
    ? ['PRODUCTION_CUTOVER_RUN_ID', 'PRODUCTION_CUTOVER_SIGNOFF_CHECKPOINT_FILE', 'PRODUCTION_CUTOVER_SIGNOFF_RESUME_CONFIRMATION', 'PRODUCTION_UAT_ADMIN_RESULT_FILE', 'PRODUCTION_UAT_MANAGER_RESULT_FILE', 'PRODUCTION_UAT_USER_RESULT_FILE', 'PRODUCTION_BUSINESS_SIGNOFF_FILE', 'PRODUCTION_SECURITY_SIGNOFF_FILE', 'PRODUCTION_OPERATIONS_SIGNOFF_FILE', 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE']
    : ['PRODUCTION_CUTOVER_CONFIRMATION'],
  expectedConfirmation: resumeSignoff ? SIGNOFF_RESUME_CONFIRMATION : undefined,
  secretValuesReadOrRecorded: false
};
(result.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
