import { runSignoffPauseResumeRehearsal } from '../src/operations/production-cutover-signoff-resume.mjs';

const result = runSignoffPauseResumeRehearsal();
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'synthetic-signoff-pause-resume', ...result }, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
