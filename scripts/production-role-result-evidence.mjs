import {
  ROLE_RESULT_EVIDENCE_CONFIRMATION,
  compileProductionRoleResultEvidence,
  writeProductionRoleResultEvidence
} from '../src/operations/production-role-result-evidence.mjs';
import { loadRunReceiptDocuments } from '../src/operations/production-cutover-actual-evidence.mjs';
import { PRODUCTION_CUTOVER_RECEIPT_ROOT } from '../src/operations/production-cutover-process-runner.mjs';
import { readOperationsPreflightManifest } from '../src/operations/operations-preflight-manifest-runtime.mjs';
import { fileURLToPath } from 'node:url';

const OUTPUT_ENV = Object.freeze({ ADMIN: 'PRODUCTION_UAT_ADMIN_RESULT_FILE', MANAGER: 'PRODUCTION_UAT_MANAGER_RESULT_FILE', USER: 'PRODUCTION_UAT_USER_RESULT_FILE' });
const RUN_ENV = 'PRODUCTION_CUTOVER_RUN_ID';
const CONFIRM_ENV = 'PRODUCTION_ROLE_RESULT_EVIDENCE_CONFIRMATION';
const candidate = readOperationsPreflightManifest(
  fileURLToPath(new URL('../agent docs/harness/P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json', import.meta.url))
).value;
const compile = process.argv.includes('--compile');
const missing = [];
if (!process.env[RUN_ENV]) missing.push('CUTOVER_RUN_ID_MISSING');
for (const [role, env] of Object.entries(OUTPUT_ENV)) if (!process.env[env]) missing.push(`${role}_OUTPUT_MISSING`);
if (!compile || missing.length || process.env[CONFIRM_ENV] !== ROLE_RESULT_EVIDENCE_CONFIRMATION) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: missing.length ? 'READY_WAIT_PRODUCTION_ROLE_RESULT_INPUTS' : (compile ? 'READY_WAIT_PRODUCTION_ROLE_RESULT_CONFIRMATION' : 'PASS_PRODUCTION_ROLE_RESULT_COMPILER_DRY_RUN'),
    requiredEnvironment: [RUN_ENV, CONFIRM_ENV, ...Object.values(OUTPUT_ENV)], missing,
    actualRoleResultsCreated: false, externalMutationPerformed: false, secretValuesReadOrRecorded: false, productionGo: false
  }, null, 2));
} else {
  try {
    const receipts = loadRunReceiptDocuments(PRODUCTION_CUTOVER_RECEIPT_ROOT, process.env[RUN_ENV]);
    const roleStepDocument = receipts.find((document) => document.value?.kind === 'step' && document.value?.gate === 'core_smoke' && document.value?.step === 'role-core-smoke');
    const coreGateDocument = receipts.find((document) => document.value?.kind === 'gate' && document.value?.gate === 'core_smoke');
    const result = compileProductionRoleResultEvidence({ roleStepDocument, coreGateDocument, runId: process.env[RUN_ENV], releaseSha: candidate.releaseTag.replace(/^sha-/, '') });
    if (result.failures.length) throw new Error(result.failures.join(','));
    writeProductionRoleResultEvidence(Object.fromEntries(Object.entries(OUTPUT_ENV).map(([role, env]) => [role, process.env[env]])), result.documents);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: result.status, runId: process.env[RUN_ENV], actualRoleResultsCreated: true, documentCount: 3, externalMutationPerformed: true, secretValuesReadOrRecorded: false, productionGo: false }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'FAIL_PRODUCTION_ROLE_RESULT_EVIDENCE', failure: String(error?.message || 'role result failure').replace(/[\r\n]/g, ' ').slice(0, 240), actualRoleResultsCreated: false, secretValuesReadOrRecorded: false, productionGo: false }, null, 2));
    process.exitCode = 1;
  }
}
