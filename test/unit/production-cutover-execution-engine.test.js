const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-cutover-orchestrator.mjs');

function handlers(sequence, calls, failureGate = null, throws = false) {
  return Object.fromEntries(sequence.map((gate) => [gate, async () => {
    calls.push(gate);
    if (gate === failureGate && throws) throw new Error('synthetic');
    if (gate === failureGate) return { status: 'FAIL', reason: 'SYNTHETIC_FAILURE' };
    return { status: 'PASS', evidenceRef: `synthetic://${gate}` };
  }]));
}

const windowContract = { windowStart: 1, rollbackCutoff: 3, windowEnd: 4, now: () => 2 };

test('변경창 밖 또는 실행 확인 전에는 어떤 Gate도 실행하지 않는다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  const outside = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls),
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' }),
    ...windowContract,
    now: () => 5,
    externalActionConfirmed: true
  });
  assert.equal(outside.status, 'FAIL_OUTSIDE_APPROVED_CHANGE_WINDOW');
  const unconfirmed = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls),
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' }),
    ...windowContract,
    externalActionConfirmed: false
  });
  assert.equal(unconfirmed.status, 'READY_WAIT_EXTERNAL_CUTOVER_ACTION_CONFIRMATION');
  assert.deepEqual(calls, []);
});

test('12개 Gate PASS 뒤에도 finalizer 전에는 Production GO가 아니다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  const result = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls),
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' }),
    ...windowContract,
    externalActionConfirmed: true
  });
  assert.equal(result.status, 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION');
  assert.deepEqual(calls, CUTOVER_GATE_SEQUENCE);
  assert.equal(result.gateResults.length, 12);
  assert.equal(result.productionGo, false);
});

test('첫 실패 뒤 Gate를 중단하고 route-disable 증거로만 격리한다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  let rollbackCalls = 0;
  const result = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls, 'csrf_idempotency'),
    routeDisableHandler: async () => {
      rollbackCalls += 1;
      return { status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' };
    },
    ...windowContract,
    externalActionConfirmed: true
  });
  assert.equal(result.status, 'PASS_CUTOVER_EXECUTION_FAILURE_CONTAINED');
  assert.deepEqual(calls, CUTOVER_GATE_SEQUENCE.slice(0, 7));
  assert.deepEqual(result.skippedGates, CUTOVER_GATE_SEQUENCE.slice(7));
  assert.equal(rollbackCalls, 1);
  assert.equal(result.productionGo, false);
});

test('Gate 예외와 route-disable 미확인은 fail-closed 한다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  const result = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls, 'core_smoke', true),
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: '' }),
    ...windowContract,
    externalActionConfirmed: true
  });
  assert.equal(result.status, 'BLOCKED_CUTOVER_EXECUTION_FAILURE_NOT_CONTAINED');
  assert.deepEqual(result.failures, ['PUBLIC_ROUTE_DISABLE_NOT_VERIFIED']);
  assert.equal(result.failedGate, 'core_smoke');
  assert.equal(result.productionGo, false);
});

test('cutoff 초과는 다음 Gate 대신 rollback으로 전환한다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  let tick = 0;
  const times = [2, 2, 2, 4];
  const result = await executeCutoverGateSequence({
    gateHandlers: handlers(CUTOVER_GATE_SEQUENCE, calls),
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' }),
    windowStart: 1,
    rollbackCutoff: 3,
    windowEnd: 5,
    now: () => times[Math.min(tick++, times.length - 1)],
    externalActionConfirmed: true
  });
  assert.equal(result.status, 'PASS_CUTOVER_EXECUTION_FAILURE_CONTAINED');
  assert.equal(result.failedGate, 'migration_review');
  assert.deepEqual(calls, CUTOVER_GATE_SEQUENCE.slice(0, 2));
});

test('Gate handler 개수·순서·함수 계약 변조는 실행 전에 차단한다', async () => {
  const { CUTOVER_GATE_SEQUENCE, executeCutoverGateSequence } = await modulePromise;
  const calls = [];
  const invalid = handlers(CUTOVER_GATE_SEQUENCE.slice().reverse(), calls);
  const result = await executeCutoverGateSequence({
    gateHandlers: invalid,
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route' }),
    ...windowContract,
    externalActionConfirmed: true
  });
  assert.equal(result.status, 'FAIL_CUTOVER_EXECUTION_HANDLER_CONTRACT');
  assert.deepEqual(calls, []);
});
