const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-approval-to-orchestrator-rehearsal.mjs');

test('19개 단계가 각각 WAIT attempt 1 뒤 PASS attempt 2로 재개된다', async () => {
  const { runOperationsActivationWaitResumeSequenceRehearsal } = await modulePromise;
  const result = runOperationsActivationWaitResumeSequenceRehearsal({ activationBundleSha256: 'd'.repeat(64) });

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_WAIT_RESUME_SEQUENCE_REHEARSAL');
  assert.equal(result.sequenceComplete, true);
  assert.equal(result.activationStepCount, 19);
  assert.equal(result.waitReceiptCount, 19);
  assert.equal(result.passReceiptCount, 19);
  assert.equal(result.activationReceiptCount, 38);
  assert.equal(result.resumeVerificationCount, 19);
  assert.equal(result.physicalDocumentCount, 43);
  assert.equal(result.finalSelectionStatus, 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE');
  assert.equal(result.childProcessCount, 0);
});

test('attempt gap·terminal PASS 이후 receipt·교차 run 변조를 모두 차단한다', async () => {
  const { runOperationsActivationWaitResumeSequenceRehearsal } = await modulePromise;
  const result = runOperationsActivationWaitResumeSequenceRehearsal({ activationBundleSha256: 'e'.repeat(64) });

  assert.equal(result.tamperScenarioCount, 3);
  assert.equal(result.tamperRejectedCount, 3);
});

test('WAIT 재개 합성 문서와 receipt를 항상 제거한다', async (t) => {
  const { runOperationsActivationWaitResumeSequenceRehearsal } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-wait-resume-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const before = fs.readdirSync(base);

  const result = runOperationsActivationWaitResumeSequenceRehearsal({
    activationBundleSha256: 'f'.repeat(64), temporaryBase: base
  });

  assert.deepEqual(fs.readdirSync(base), before);
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});
