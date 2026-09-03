import { runCutoverExecutionEngineRehearsal } from '../src/operations/production-cutover-orchestrator.mjs';

const result = await runCutoverExecutionEngineRehearsal();
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  mode: 'synthetic-execution-engine-rehearsal',
  secretValuesReadOrRecorded: false,
  ...result
}, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
