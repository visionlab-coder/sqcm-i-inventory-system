import fs from 'node:fs';
import path from 'node:path';
import {
  ACTUAL_CUTOVER_ASSEMBLY_CONFIRMATION,
  assembleActualCutoverEvidence,
  loadJsonDocument,
  loadRunReceiptDocuments,
  writeActualCutoverEvidence
} from '../src/operations/production-cutover-actual-evidence.mjs';
import { PRODUCTION_CUTOVER_RECEIPT_ROOT } from '../src/operations/production-cutover-process-runner.mjs';
import { readOperationsPreflightManifest } from '../src/operations/operations-preflight-manifest-runtime.mjs';
import { fileURLToPath } from 'node:url';

const ROLE_ENV = Object.freeze({ ADMIN: 'PRODUCTION_UAT_ADMIN_RESULT_FILE', MANAGER: 'PRODUCTION_UAT_MANAGER_RESULT_FILE', USER: 'PRODUCTION_UAT_USER_RESULT_FILE' });
const SIGNOFF_ENV = Object.freeze({ BUSINESS: 'PRODUCTION_BUSINESS_SIGNOFF_FILE', SECURITY: 'PRODUCTION_SECURITY_SIGNOFF_FILE', OPERATIONS: 'PRODUCTION_OPERATIONS_SIGNOFF_FILE' });
const RUN_ENV = 'PRODUCTION_CUTOVER_RUN_ID';
const OUTPUT_ENV = 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE';
const CONFIRM_ENV = 'PRODUCTION_CUTOVER_EVIDENCE_ASSEMBLY_CONFIRMATION';
const candidate = readOperationsPreflightManifest(
  fileURLToPath(new URL('../agent docs/harness/P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json', import.meta.url))
).value;
const execute = process.argv.includes('--assemble');
const references = { ...ROLE_ENV, ...SIGNOFF_ENV };
const missing = Object.entries(references).filter(([, env]) => !process.env[env] || !fs.existsSync(process.env[env])).map(([name]) => `${name}_REFERENCE_MISSING`);
if (!process.env[RUN_ENV]) missing.push('CUTOVER_RUN_ID_MISSING');
if (!process.env[OUTPUT_ENV]) missing.push('ACTUAL_EVIDENCE_OUTPUT_MISSING');

if (!execute || missing.length || process.env[CONFIRM_ENV] !== ACTUAL_CUTOVER_ASSEMBLY_CONFIRMATION) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: missing.length ? 'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_INPUTS' : (execute ? 'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY_CONFIRMATION' : 'PASS_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLER_DRY_RUN'),
    requiredEnvironment: [RUN_ENV, OUTPUT_ENV, CONFIRM_ENV, ...Object.values(ROLE_ENV), ...Object.values(SIGNOFF_ENV)],
    missing, actualEvidenceCreated: false, externalMutationPerformed: false, secretValuesReadOrRecorded: false, productionGo: false
  }, null, 2));
} else {
  try {
    const result = assembleActualCutoverEvidence({
      receiptDocuments: loadRunReceiptDocuments(PRODUCTION_CUTOVER_RECEIPT_ROOT, process.env[RUN_ENV]),
      roleResultDocuments: Object.fromEntries(Object.entries(ROLE_ENV).map(([role, env]) => [role, loadJsonDocument(process.env[env])])),
      signoffDocuments: Object.fromEntries(Object.entries(SIGNOFF_ENV).map(([area, env]) => [area, loadJsonDocument(process.env[env])])),
      runId: process.env[RUN_ENV], releaseSha: candidate.releaseTag.replace(/^sha-/, '')
    });
    if (!result.productionGo) throw new Error(result.failures.join(','));
    const output = writeActualCutoverEvidence(process.env[OUTPUT_ENV], result.evidence);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: result.status, runId: process.env[RUN_ENV], outputFile: path.basename(output), actualEvidenceCreated: true, externalMutationPerformed: true, secretValuesReadOrRecorded: false, productionGo: true }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'FAIL_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY', failure: String(error?.message || 'assembly failure').replace(/[\r\n]/g, ' ').slice(0, 240), actualEvidenceCreated: false, secretValuesReadOrRecorded: false, productionGo: false }, null, 2));
    process.exitCode = 1;
  }
}
