const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-process-runner-rehearsal.mjs');

test('실제 process runner 계약으로 19개 단계를 물리 receipt에 연결한다', async () => {
  const { runOperationsActivationProcessRunnerRehearsal } = await modulePromise;
  const result = runOperationsActivationProcessRunnerRehearsal();

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_PROCESS_RUNNER_REHEARSAL');
  assert.equal(result.activationStepCount, 19);
  assert.equal(result.childProcessCount, 19);
  assert.equal(result.activationReceiptCount, 19);
  assert.equal(result.sequenceComplete, true);
  assert.equal(result.physicalDocumentCount, 36);
  assert.equal(result.unexpectedEnvironmentPropagationCount, 0);
  assert.equal(result.alternateProfileScenarioCount, 2);
  assert.equal(result.alternateProfilePassCount, 2);
});

test('malformed JSON·exit 1·민감 stdout을 FAIL 또는 redacted receipt로 고정한다', async () => {
  const { runOperationsActivationProcessRunnerRehearsal } = await modulePromise;
  const result = runOperationsActivationProcessRunnerRehearsal();

  assert.equal(result.negativeScenarioCount, 4);
  assert.equal(result.negativeScenarioPassCount, 4);
  assert.equal(result.secretValueOccurrenceCount, 0);
});

test('process runner 합성 receipt를 항상 제거한다', async (t) => {
  const { runOperationsActivationProcessRunnerRehearsal } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-process-runner-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const before = fs.readdirSync(base);

  const result = runOperationsActivationProcessRunnerRehearsal({ temporaryBase: base });

  assert.deepEqual(fs.readdirSync(base), before);
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});
