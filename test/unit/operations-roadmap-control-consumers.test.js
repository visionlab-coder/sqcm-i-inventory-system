const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const consumers = [
  'operations-alert-delivery-runner.mjs',
  'operations-alerting-evidence.mjs',
  'operations-backup-restore-evidence.mjs',
  'operations-backup-restore-runner.mjs',
  'operations-certificate-evidence.mjs',
  'operations-certificate-observer.mjs',
  'operations-handover-assembler.mjs',
  'operations-handover-finalizer.mjs',
  'operations-improvement-queue-collector.mjs',
  'operations-improvement-queue-evidence.mjs',
  'operations-maintenance-evidence.mjs',
  'operations-maintenance-runner.mjs',
  'operations-oncall-drill-runner.mjs',
  'operations-oncall-evidence.mjs',
  'operations-signoff-evidence.mjs',
  'operations-signoff-input-assembler.mjs',
  'operations-slo-collector.mjs',
  'operations-slo-evidence.mjs'
];

for (const file of consumers) {
  test(`${file} uses the bounded atomic roadmap control reader`, () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', file), 'utf8');
    assert.match(source, /operations-roadmap-control-reader\.mjs/);
    assert.match(source, /readOperationsRoadmapControl\((projectRoot|projectDir)\)\.value/);
    assert.doesNotMatch(source, /JSON\.parse\([^\n]*readFileSync\([^\n]*MASTER_ROADMAP\.json/);
  });
}
