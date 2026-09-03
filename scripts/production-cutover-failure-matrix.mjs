import { runCutoverFailureMatrixRehearsal } from '../src/operations/production-cutover-orchestrator.mjs';

const result = runCutoverFailureMatrixRehearsal();
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  mode: 'synthetic-failure-matrix',
  ...result,
  actualCutoverExecuted: false,
  actualRouteDisabled: false,
  secretValuesReadOrRecorded: false
}, null, 2));
if (!result.status.startsWith('PASS_')) process.exitCode = 1;
