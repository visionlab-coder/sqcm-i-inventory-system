const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const scripts = [
  'operations-slo-evidence.mjs',
  'operations-alerting-evidence.mjs',
  'operations-backup-restore-evidence.mjs',
  'operations-certificate-evidence.mjs',
  'operations-oncall-evidence.mjs',
  'operations-maintenance-evidence.mjs',
  'operations-improvement-queue-evidence.mjs',
  'operations-signoff-evidence.mjs'
];

for (const scriptName of scripts) {
  test(`${scriptName} actual input은 bounded physical JSON reader를 사용한다`, () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', scriptName), 'utf8');
    assert.match(source, /operations-activation-input-reader\.mjs/);
    assert.match(source, /readOperationsActivationInputDocument\(inputPath/);
    assert.doesNotMatch(source, /fs\.readFileSync\(inputPath/);
    assert.match(source, /sourceSha256: input\.sha256/);
  });
}
