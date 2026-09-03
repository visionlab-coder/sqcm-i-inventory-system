const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-approval-to-orchestrator-rehearsal.mjs');

test('19개 단계 각각 동일 실패 3회에서 정지하고 이후 단계를 실행하지 않는다', async () => {
  const { runOperationsActivationThreeFailureMatrixRehearsal } = await modulePromise;
  const result = runOperationsActivationThreeFailureMatrixRehearsal({ activationBundleSha256: 'a'.repeat(64) });

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_THREE_FAILURE_MATRIX_REHEARSAL');
  assert.equal(result.scenarioCount, 19);
  assert.equal(result.containedFailureCount, 19);
  assert.equal(result.pausedAfterThreeCount, 19);
  assert.equal(result.laterStepReceiptCount, 0);
  assert.equal(result.totalReceiptCount, 228);
  assert.equal(result.physicalDocumentCount, 251);
  assert.equal(result.childProcessCount, 0);
});

test('실패 2회·4회 및 교차 run 변조를 모두 차단한다', async () => {
  const { runOperationsActivationThreeFailureMatrixRehearsal } = await modulePromise;
  const result = runOperationsActivationThreeFailureMatrixRehearsal({ activationBundleSha256: 'b'.repeat(64) });

  assert.equal(result.tamperScenarioCount, 3);
  assert.equal(result.tamperRejectedCount, 3);
});

test('3회 실패 매트릭스 합성 문서와 receipt를 항상 제거한다', async (t) => {
  const { runOperationsActivationThreeFailureMatrixRehearsal } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-three-failure-matrix-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const before = fs.readdirSync(base);

  const result = runOperationsActivationThreeFailureMatrixRehearsal({
    activationBundleSha256: 'c'.repeat(64), temporaryBase: base
  });

  assert.deepEqual(fs.readdirSync(base), before);
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});
