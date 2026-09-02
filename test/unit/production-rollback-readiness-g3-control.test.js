const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('rollback readiness reads G3 evidence through the bounded physical JSON reader', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'production-rollback-readiness.mjs'), 'utf8');
  assert.match(source, /readOperationsPreflightManifest/);
  assert.doesNotMatch(
    source,
    /JSON\.parse\([^\n]*readFileSync\([^\n]*P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE/
  );
});
