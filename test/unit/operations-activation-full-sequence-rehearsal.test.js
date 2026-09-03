const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-approval-to-orchestrator-rehearsal.mjs');

test('승인 체인에 결박된 19개 물리 receipt가 sequence complete까지 전진한다', async () => {
  const { runOperationsActivationFullSequenceRehearsal } = await modulePromise;
  const result = runOperationsActivationFullSequenceRehearsal({ activationBundleSha256: 'a'.repeat(64) });

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_FULL_SEQUENCE_REHEARSAL');
  assert.equal(result.sequenceComplete, true);
  assert.equal(result.activationStepCount, 19);
  assert.equal(result.activationReceiptCount, 19);
  assert.equal(result.physicalDocumentCount, 24);
  assert.equal(result.firstSelectedStep, 'slo-collect');
  assert.equal(result.finalSelectionStatus, 'PASS_OPERATIONS_ACTIVATION_SEQUENCE_COMPLETE');
  assert.equal(result.childProcessCount, 0);
  assert.equal(result.productionGo, false);
});

test('sequence·approval provenance·receipt 완결성 변조를 모두 차단한다', async () => {
  const { runOperationsActivationFullSequenceRehearsal } = await modulePromise;
  const result = runOperationsActivationFullSequenceRehearsal({ activationBundleSha256: 'b'.repeat(64) });

  assert.equal(result.tamperScenarioCount, 3);
  assert.equal(result.tamperRejectedCount, 3);
});

test('19단계 합성 receipt와 approval 문서를 항상 제거한다', async (t) => {
  const { runOperationsActivationFullSequenceRehearsal } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-full-sequence-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const before = fs.readdirSync(base);

  const result = runOperationsActivationFullSequenceRehearsal({
    activationBundleSha256: 'c'.repeat(64), temporaryBase: base
  });

  assert.deepEqual(fs.readdirSync(base), before);
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.equal(result.externalMutationPerformed, false);
});
