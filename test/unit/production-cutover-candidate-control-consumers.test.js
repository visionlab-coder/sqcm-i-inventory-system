const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const consumers = [
  'production-cutover-execute.mjs',
  'production-cutover-actual-evidence.mjs',
  'production-signoff-preflight.mjs',
  'production-role-result-evidence.mjs',
  'production-cutover-evidence-check.mjs'
];

test('P6 cutover candidate consumers use the bounded physical JSON reader', () => {
  for (const file of consumers) {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', file), 'utf8');
    assert.match(source, /readOperationsPreflightManifest/, `${file} must use the bounded candidate reader`);
    assert.doesNotMatch(
      source,
      /JSON\.parse\([^\n]*readFileSync\([^\n]*P6_G4_CUTOVER_EVIDENCE_CANDIDATE/,
      `${file} must not parse the candidate with an unbounded direct read`
    );
  }
});
