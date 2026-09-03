const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const contracts = [
  ['operations-alert-delivery-runner.mjs', 'manifestPath'],
  ['operations-backup-restore-runner.mjs', 'attestationPath'],
  ['operations-oncall-drill-runner.mjs', 'manifestPath'],
  ['operations-improvement-queue-collector.mjs', 'attestationPath']
];

for (const [scriptName, inputVariable] of contracts) {
  test(`${scriptName} control JSON은 bounded physical reader를 사용한다`, () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', scriptName), 'utf8');
    assert.match(source, /operations-activation-input-reader\.mjs/);
    assert.match(source, new RegExp(`readOperationsActivationInputDocument\\(${inputVariable}`));
    assert.doesNotMatch(source, new RegExp(`JSON\\.parse\\(fs\\.readFileSync\\(${inputVariable}`));
  });
}
