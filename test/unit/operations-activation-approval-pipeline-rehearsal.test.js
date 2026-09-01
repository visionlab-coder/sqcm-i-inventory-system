const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-activation-approval-pipeline-rehearsal.mjs');

function tempBase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-pipeline-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('request→MFA receipt→manifest→preflight 물리 파일 파이프라인을 종단 검증한다', async (t) => {
  const { runOperationsActivationApprovalPipelineRehearsal } = await modulePromise;
  const result = runOperationsActivationApprovalPipelineRehearsal({
    activationBundleSha256: 'c'.repeat(64), temporaryBase: tempBase(t)
  });
  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_APPROVAL_PIPELINE_REHEARSAL');
  assert.equal(result.stageCount, 4); assert.equal(result.physicalDocumentCount, 4);
  assert.equal(result.verifiedDocumentCount, 4); assert.equal(result.syntheticOnly, true);
  assert.equal(result.actualApprovalCreated, false); assert.equal(result.actualActivationExecuted, false);
});

test('request·receipt·manifest 세 변조 시나리오를 모두 fail-closed 한다', async (t) => {
  const { runOperationsActivationApprovalPipelineRehearsal } = await modulePromise;
  const result = runOperationsActivationApprovalPipelineRehearsal({
    activationBundleSha256: 'c'.repeat(64), temporaryBase: tempBase(t)
  });
  assert.equal(result.tamperScenarioCount, 3); assert.equal(result.tamperRejectedCount, 3);
  assert.equal(result.externalMutationPerformed, false); assert.equal(result.secretValuesReadOrRecorded, false);
});

test('리허설 임시 산출물을 성공·변조 경로 모두 남기지 않는다', async (t) => {
  const { runOperationsActivationApprovalPipelineRehearsal } = await modulePromise;
  const base = tempBase(t);
  const result = runOperationsActivationApprovalPipelineRehearsal({ activationBundleSha256: 'c'.repeat(64), temporaryBase: base });
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.deepEqual(fs.readdirSync(base), []);
});
