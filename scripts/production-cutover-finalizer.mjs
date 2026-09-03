import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readActualCutoverEvidenceFile,
  validateActualCutoverProvenance
} from '../src/operations/production-cutover-finalizer.mjs';

const environmentName = 'PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE';
const file = process.env[environmentName];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!file) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE',
    requiredEnvironment: environmentName,
    actualEvidencePresent: false,
    productionGo: false
  }, null, 2));
  process.exit(0);
}

let evidence;
try {
  evidence = readActualCutoverEvidenceFile(file, { repositoryRoot });
} catch (error) {
  if (error?.message === 'ACTUAL_CUTOVER_EVIDENCE_NOT_FOUND') {
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      status: 'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE',
      requiredEnvironment: environmentName,
      actualEvidencePresent: false,
      productionGo: false
    }, null, 2));
    process.exit(0);
  }
  console.error(JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'FAIL_ACTUAL_CUTOVER_EVIDENCE_REFERENCE',
    failure: String(error?.message || 'ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID'),
    actualEvidencePresent: false,
    productionGo: false
  }, null, 2));
  process.exit(1);
}

const result = validateActualCutoverProvenance(evidence.value);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  actualEvidencePresent: true,
  actualEvidenceBytes: evidence.bytes,
  actualEvidenceSha256: evidence.sha256,
  ...result
}, null, 2));
if (result.failures.length) process.exitCode = 1;
