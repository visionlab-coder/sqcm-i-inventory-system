import fs from 'node:fs';
import path from 'node:path';
import { evaluateErpEapprovalProviderInputs } from '../src/operations/erp-eapproval-provider-input-preflight.mjs';

const inputArg = process.argv.indexOf('--input');
const inputPath = path.resolve(inputArg >= 0 && process.argv[inputArg + 1]
  ? process.argv[inputArg + 1]
  : 'agent docs/harness/PE_C5_G4_PROVIDER_INPUT_CONTRACT.json');

let input;
try {
  input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL_INPUT_FILE', inputPath, errorCode: error.code || 'INVALID_JSON' }));
  process.exitCode = 1;
  process.exit();
}

const result = evaluateErpEapprovalProviderInputs(input);
console.log(JSON.stringify({ inputPath, ...result }, null, 2));
if (result.status !== 'READY_FOR_STAGING_CONTRACT_UAT') process.exitCode = 2;
