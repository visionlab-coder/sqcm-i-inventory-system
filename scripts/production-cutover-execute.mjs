import { executeProductionCutover, PRODUCTION_CUTOVER_CONFIRMATION } from '../src/operations/production-cutover-executor.mjs';

const execute = process.argv.includes('--execute');
const result = await executeProductionCutover({
  execute,
  externalActionConfirmed: process.env.PRODUCTION_CUTOVER_CONFIRMATION === PRODUCTION_CUTOVER_CONFIRMATION
});
const output = {
  ...result,
  requiredEnvironment: ['PRODUCTION_CUTOVER_CONFIRMATION'],
  secretValuesReadOrRecorded: false
};
(result.status.startsWith('FAIL_') ? console.error : console.log)(JSON.stringify(output, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
