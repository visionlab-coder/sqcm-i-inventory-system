import { spawnSync } from 'node:child_process';
import process from 'node:process';

for (const [script, target] of [
  ['scripts/operations-preflight.mjs', 'config/operations.manifest.example.json'],
  ['scripts/cutover-gate.mjs', 'docs/templates/cutover-evidence.example.json']
]) {
  const result = spawnSync(process.execPath, [script, target, '--allow-template'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Operational manifest and cutover evidence contracts passed.');
