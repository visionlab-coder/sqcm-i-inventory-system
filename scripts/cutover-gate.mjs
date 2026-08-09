import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import gates from '../src/operations/gates.js';

const evidencePath = process.argv[2];
const allowTemplate = process.argv.includes('--allow-template');
if (!evidencePath) {
  console.error('Usage: npm run operations:cutover-gate -- <evidence.json> [--allow-template]');
  process.exit(1);
}

const resolved = path.resolve(evidencePath);
const evidence = JSON.parse(fs.readFileSync(resolved, 'utf8'));
const result = gates.validateCutoverEvidence(evidence, { allowTemplate });
if (!result.ok) {
  console.error('Cutover gate blocked:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), evidence: resolved, requiredGateCount: result.requiredGateCount, template: evidence.template === true }, null, 2));
console.log(evidence.template ? 'Cutover template contract is valid; it does not authorize production deployment.' : 'Cutover gate passed.');
