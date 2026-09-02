import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import gates from '../src/operations/gates.js';
import { readCutoverGateEvidenceFile } from '../src/operations/cutover-gate-input.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const evidencePath = process.argv[2];
const allowTemplate = process.argv.includes('--allow-template');
if (!evidencePath) {
  console.error('Usage: npm run operations:cutover-gate -- <evidence.json> [--allow-template]');
  process.exit(1);
}

const loaded = readCutoverGateEvidenceFile(evidencePath, { repositoryRoot: root, allowTemplate });
const evidence = loaded.value;
const result = gates.validateCutoverEvidence(evidence, { allowTemplate });
if (!result.ok) {
  console.error('Cutover gate blocked:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), evidence: loaded.path, evidenceBytes: loaded.bytes, evidenceSha256: loaded.sha256, requiredGateCount: result.requiredGateCount, template: evidence.template === true }, null, 2));
console.log(evidence.template ? 'Cutover template contract is valid; it does not authorize production deployment.' : 'Cutover gate passed.');
