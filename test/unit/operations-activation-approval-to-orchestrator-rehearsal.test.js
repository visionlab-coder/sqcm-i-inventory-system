const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-approval-to-orchestrator-rehearsal.mjs');

test('물리 승인 체인은 activation 오케스트레이터의 첫 receipt까지 호환된다', async () => {
  const { runOperationsActivationApprovalToOrchestratorRehearsal } = await modulePromise;
  const result = runOperationsActivationApprovalToOrchestratorRehearsal({
    activationBundleSha256: 'c'.repeat(64)
  });

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_APPROVAL_TO_ORCHESTRATOR_REHEARSAL');
  assert.equal(result.approvalChainVerified, true);
  assert.equal(result.orchestratorApprovalVerified, true);
  assert.equal(result.firstSelectedStep, 'slo-collect');
  assert.equal(result.nextSelectedStep, 'slo-compile');
  assert.equal(result.activationReceiptCount, 1);
  assert.equal(result.physicalDocumentCount, 6);
  assert.equal(result.childProcessCount, 0);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});

test('승인 manifest·MFA receipt·bundle 연결 변조를 모두 차단한다', async () => {
  const { runOperationsActivationApprovalToOrchestratorRehearsal } = await modulePromise;
  const result = runOperationsActivationApprovalToOrchestratorRehearsal({
    activationBundleSha256: 'd'.repeat(64)
  });

  assert.equal(result.tamperScenarioCount, 3);
  assert.equal(result.tamperRejectedCount, 3);
});

test('합성 물리 파일과 receipt root를 항상 제거한다', async (t) => {
  const { runOperationsActivationApprovalToOrchestratorRehearsal } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-approval-orchestrator-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const before = fs.readdirSync(base);

  const result = runOperationsActivationApprovalToOrchestratorRehearsal({
    activationBundleSha256: 'e'.repeat(64), temporaryBase: base
  });

  assert.deepEqual(fs.readdirSync(base), before);
  assert.equal(result.temporaryArtifactsRetained, false);
});
