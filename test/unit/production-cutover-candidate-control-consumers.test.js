const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const consumers = {
  'production-cutover-execute.mjs': 'readOperationsPreflightManifest',
  'production-cutover-actual-evidence.mjs': 'readOperationsPreflightManifest',
  'production-signoff-preflight.mjs': 'readOperationsPreflightManifest',
  'production-role-result-evidence.mjs': 'readOperationsPreflightManifest',
  'production-cutover-evidence-check.mjs': 'readProductionCutoverEvidenceControlSnapshot'
};

test('P6 cutover candidate consumers use the bounded physical JSON reader', () => {
  for (const [file, reader] of Object.entries(consumers)) {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', file), 'utf8');
    assert.ok(source.includes(reader), `${file} must use ${reader}`);
    assert.doesNotMatch(
      source,
      /JSON\.parse\([^\n]*readFileSync\([^\n]*P6_G4_CUTOVER_EVIDENCE_CANDIDATE/,
      `${file} must not parse the candidate with an unbounded direct read`
    );
  }
});

test('cutover resume entrypoint wires atomic actual-signoff assembly controls', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts', 'production-cutover-execute.mjs'), 'utf8');
  const harness = fs.readFileSync(path.join(projectRoot, 'scripts', 'goal-harness.mjs'), 'utf8');
  assert.match(source, /--assemble-signoffs/);
  assert.match(source, /PRODUCTION_SIGNOFF_ACTUAL_DOCUMENT_CONFIRMATION/);
  assert.match(source, /assembleActualSignoffs/);
  assert.match(source, /actualSignoffOutputPaths/);
  assert.match(harness, /production-cutover-signoff-assembly-resume-dry-run/);
});
