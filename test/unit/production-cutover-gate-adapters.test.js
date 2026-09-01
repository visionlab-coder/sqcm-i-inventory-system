const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-cutover-gate-adapters.mjs');
const orchestratorPromise = import('../../src/operations/production-cutover-orchestrator.mjs');

test('adapter plan은 12 Gate 순서와 실제 public execute 인자를 고정한다', async () => {
  const { CUTOVER_GATE_ADAPTER_PLAN } = await modulePromise;
  const { CUTOVER_GATE_SEQUENCE } = await orchestratorPromise;
  assert.deepEqual(Object.keys(CUTOVER_GATE_ADAPTER_PLAN), CUTOVER_GATE_SEQUENCE);
  assert.deepEqual(CUTOVER_GATE_ADAPTER_PLAN.health_readiness.map((step) => step.args), [['--execute'], []]);
  assert.deepEqual(CUTOVER_GATE_ADAPTER_PLAN.core_smoke.map((step) => step.args), [['--execute'], ['--public']]);
  assert.deepEqual(CUTOVER_GATE_ADAPTER_PLAN.csrf_idempotency[0].args, ['--public']);
});

test('각 step의 exact 허용 상태와 evidence가 있어야 Gate PASS다', async () => {
  const { CUTOVER_GATE_ADAPTER_PLAN, createCutoverGateHandlers } = await modulePromise;
  const handlers = createCutoverGateHandlers({
    runStep: async ({ acceptedStatuses, gate, id }) => ({ exitCode: 0, status: acceptedStatuses[0], evidenceRef: `synthetic://${gate}/${id}` }),
    recordGateEvidence: async ({ gate }) => `synthetic://gate/${gate}`
  });
  for (const gate of Object.keys(CUTOVER_GATE_ADAPTER_PLAN)) {
    const result = await handlers[gate]();
    assert.equal(result.status, 'PASS');
    assert.equal(result.evidenceRef, `synthetic://gate/${gate}`);
  }
});

test('READY_WAIT 상태는 exit 0이어도 Gate PASS가 아니다', async () => {
  const { createCutoverGateHandlers } = await modulePromise;
  const handlers = createCutoverGateHandlers({
    runStep: async () => ({ exitCode: 0, status: 'READY_WAIT_DNS_TLS_PUBLICATION', evidenceRef: 'synthetic://wait' }),
    recordGateEvidence: async () => 'synthetic://gate'
  });
  const result = await handlers.health_readiness();
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /CUTOVER_GATE_STEP_NOT_PASS/);
});

test('허용 상태라도 step 또는 Gate evidence가 없으면 fail-closed 한다', async () => {
  const { createCutoverGateHandlers } = await modulePromise;
  const noStepEvidence = createCutoverGateHandlers({
    runStep: async ({ acceptedStatuses }) => ({ exitCode: 0, status: acceptedStatuses[0], evidenceRef: '' }),
    recordGateEvidence: async () => 'synthetic://gate'
  });
  assert.equal((await noStepEvidence.artifact()).status, 'FAIL');
  const noGateEvidence = createCutoverGateHandlers({
    runStep: async ({ acceptedStatuses }) => ({ exitCode: 0, status: acceptedStatuses[0], evidenceRef: 'synthetic://step' }),
    recordGateEvidence: async () => ''
  });
  assert.equal((await noGateEvidence.artifact()).status, 'FAIL');
});

test('route-disable는 exact PASS 상태와 두 단계 evidence를 모두 요구한다', async () => {
  const { createCutoverRouteDisableHandler } = await modulePromise;
  const rejected = createCutoverRouteDisableHandler({
    runStep: async () => ({ exitCode: 0, status: 'READY_WAIT_PUBLIC_DNS_PROPAGATION', evidenceRef: 'synthetic://step' }),
    recordGateEvidence: async () => 'synthetic://gate'
  });
  assert.equal((await rejected({ failedGate: 'artifact' })).status, 'FAIL_PUBLIC_ROUTE_DISABLE_NOT_VERIFIED');
  const accepted = createCutoverRouteDisableHandler({
    runStep: async () => ({ exitCode: 0, status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://step' }),
    recordGateEvidence: async () => 'synthetic://route-disable'
  });
  assert.deepEqual(await accepted({ failedGate: 'artifact', failureReason: 'x' }), {
    status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route-disable'
  });
});

test('adapter plan 변조와 dependency 누락은 handler 생성 전에 차단한다', async () => {
  const { CUTOVER_GATE_ADAPTER_PLAN, createCutoverGateHandlers } = await modulePromise;
  const reversed = Object.fromEntries(Object.entries(CUTOVER_GATE_ADAPTER_PLAN).reverse());
  assert.throws(() => createCutoverGateHandlers({ runStep: async () => {}, recordGateEvidence: async () => '', plan: reversed }), /ORDER_INVALID/);
  assert.throws(() => createCutoverGateHandlers({}), /DEPENDENCY_INVALID/);
});
