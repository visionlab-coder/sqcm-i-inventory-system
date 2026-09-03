const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-cutover-signoff-resume-runtime-rehearsal.mjs');

test('물리 receipt/checkpoint로 Gate 1~11 중단 후 같은 run Gate 12만 재개한다', async () => {
  const { runSignoffResumeRuntimeRehearsal } = await modulePromise;
  const result = await runSignoffResumeRuntimeRehearsal();
  assert.equal(result.status, 'PASS_SIGNOFF_RESUME_RUNTIME_REHEARSAL');
  assert.equal(result.runIdentityCount, 1);
  assert.equal(result.initialGateCount, 11);
  assert.equal(result.resumedGateCount, 1);
  assert.equal(result.stepCount, 14);
  assert.equal(result.receiptCount, 26);
  assert.equal(result.checkpointCount, 1);
  assert.equal(result.checkpointPhysical, true);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});
