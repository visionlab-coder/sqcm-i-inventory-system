const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('handover preflight CLI는 candidate와 roadmap을 공용 bounded pair snapshot으로만 읽는다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'operations-handover-preflight.mjs'), 'utf8');

  assert.match(source, /readOperationsHandoverPreflightControlSnapshot/);
  assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync/);
  assert.doesNotMatch(source, /import fs from 'node:fs'/);
});
