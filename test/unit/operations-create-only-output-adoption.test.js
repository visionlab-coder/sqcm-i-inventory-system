const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../..');
const protectedWriters = [
  'operations-alert-delivery-runner.mjs',
  'operations-alerting-evidence.mjs',
  'operations-backup-restore-runner.mjs',
  'operations-certificate-evidence.mjs',
  'operations-certificate-observer.mjs',
  'operations-handover-assembler.mjs',
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

test('P7 single-document actual evidence writers가 공용 hard-link no-replace writer를 사용한다', () => {
  for (const name of protectedWriters) {
    const source = fs.readFileSync(path.join(projectRoot, 'src', 'operations', name), 'utf8');
    assert.match(source, /writeCreateOnlyJsonOutput/, `${name} must use the shared create-only writer`);
    assert.doesNotMatch(source, /renameSync\s*\(/, `${name} must not publish evidence with replace-capable rename`);
  }
});
