const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-cutover-orchestrator.mjs');

function results(sequence, failedGate = null) {
  return sequence.map((gate) => ({ gate, result: gate === failedGate ? 'FAIL' : 'PASS' }));
}

test('12개 Gate 각각의 실패가 route-disable 확인으로 격리된다', async () => {
  const { runCutoverFailureMatrixRehearsal } = await modulePromise;
  const result = runCutoverFailureMatrixRehearsal();
  assert.equal(result.status, 'PASS_CUTOVER_12_GATE_FAILURE_MATRIX_REHEARSAL');
  assert.equal(result.scenarioCount, 12);
  assert.equal(result.containedFailureCount, 12);
  assert.equal(result.routeDisableVerificationCount, 12);
  assert.equal(result.scenarios.every((scenario) => scenario.productionGo === false), true);
});

test('실패 Gate까지만 실행하고 이후 Gate를 모두 건너뛴다', async () => {
  const { CUTOVER_GATE_SEQUENCE, evaluateCutoverGateExecution } = await modulePromise;
  for (let index = 0; index < CUTOVER_GATE_SEQUENCE.length; index += 1) {
    const failedGate = CUTOVER_GATE_SEQUENCE[index];
    const result = evaluateCutoverGateExecution({ gateResults: results(CUTOVER_GATE_SEQUENCE, failedGate), routeDisableStatus: 'PASS_PUBLIC_ROUTE_DISABLED' });
    assert.equal(result.failedGate, failedGate);
    assert.deepEqual(result.executedGates, CUTOVER_GATE_SEQUENCE.slice(0, index + 1));
    assert.deepEqual(result.skippedGates, CUTOVER_GATE_SEQUENCE.slice(index + 1));
  }
});

test('Gate 결과 개수·순서·값 변조를 fail-closed 한다', async () => {
  const { CUTOVER_GATE_SEQUENCE, evaluateCutoverGateExecution } = await modulePromise;
  const tooShort = evaluateCutoverGateExecution({ gateResults: results(CUTOVER_GATE_SEQUENCE).slice(0, 11) });
  assert.match(tooShort.failures.join(','), /COUNT/);
  const reversed = evaluateCutoverGateExecution({ gateResults: results(CUTOVER_GATE_SEQUENCE).reverse() });
  assert.match(reversed.failures.join(','), /ORDER/);
  const invalid = results(CUTOVER_GATE_SEQUENCE);
  invalid[3].result = 'SKIP';
  assert.match(evaluateCutoverGateExecution({ gateResults: invalid }).failures.join(','), /VALUE/);
});

test('route-disable 확인 실패는 cutover 실패를 격리 완료로 승격하지 않는다', async () => {
  const { CUTOVER_GATE_SEQUENCE, evaluateCutoverGateExecution } = await modulePromise;
  const result = evaluateCutoverGateExecution({ gateResults: results(CUTOVER_GATE_SEQUENCE, 'core_smoke'), routeDisableStatus: 'READY_WAIT_PUBLIC_DNS_PROPAGATION' });
  assert.equal(result.status, 'BLOCKED_CUTOVER_GATE_FAILURE_NOT_CONTAINED');
  assert.equal(result.routeDisableRequired, true);
  assert.equal(result.routeDisableVerified, false);
  assert.equal(result.productionGo, false);
});

test('합성 전 Gate PASS도 실제 Production GO로 승격하지 않는다', async () => {
  const { CUTOVER_GATE_SEQUENCE, evaluateCutoverGateExecution } = await modulePromise;
  const result = evaluateCutoverGateExecution({ gateResults: results(CUTOVER_GATE_SEQUENCE) });
  assert.equal(result.status, 'PASS_ALL_CUTOVER_GATES_REHEARSAL_NO_GO');
  assert.equal(result.executedGates.length, 12);
  assert.equal(result.routeDisableRequired, false);
  assert.equal(result.productionGo, false);
});
