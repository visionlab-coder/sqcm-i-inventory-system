import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeOperationsActivationBundleSha256 } from '../src/operations/operations-activation-orchestrator.mjs';
import { runOperationsActivationSignoffLifecycleRehearsal } from '../src/operations/operations-activation-signoff-lifecycle-rehearsal.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = runOperationsActivationSignoffLifecycleRehearsal({
  activationBundleSha256: computeOperationsActivationBundleSha256(projectRoot),
  releaseSha: 'b'.repeat(40)
});

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
if (!result.status.startsWith('PASS_')) process.exitCode = 1;
