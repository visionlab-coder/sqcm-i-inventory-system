import { runSignoffResumeRuntimeRehearsal } from '../src/operations/production-cutover-signoff-resume-runtime-rehearsal.mjs';

const result = await runSignoffResumeRuntimeRehearsal();
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'synthetic-physical-signoff-resume-runtime', ...result }, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
