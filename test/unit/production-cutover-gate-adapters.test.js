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
  assert.equal(CUTOVER_GATE_ADAPTER_PLAN.migration_review[0].script, 'scripts/production-migration-verify.mjs');
  assert.deepEqual(CUTOVER_GATE_ADAPTER_PLAN.migration_review[0].environment, []);
  assert.deepEqual(CUTOVER_GATE_ADAPTER_PLAN.migration_review[0].acceptedStatuses, ['PASS_PRODUCTION_MIGRATION_HISTORY']);
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
    status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route-disable',
    orphanRecoveryRequired: false, orphanRecoveryVerified: false, orphanRecoveryEvidenceRef: ''
  });
});

test('ingress-publication 실패 containment는 route-disable과 orphan recovery evidence를 모두 요구한다', async () => {
  const { createCutoverRouteDisableHandler } = await modulePromise;
  const calls = [];
  const contained = createCutoverRouteDisableHandler({
    runStep: async (step) => {
      calls.push(step.id);
      return { exitCode: 0, status: step.acceptedStatuses[0], evidenceRef: `synthetic://step/${step.id}` };
    },
    recordGateEvidence: async ({ stepEvidenceRefs }) => {
      assert.deepEqual(stepEvidenceRefs, ['synthetic://step/route-disable', 'synthetic://step/ingress-orphan-recovery']);
      return 'synthetic://containment';
    }
  });
  const result = await contained({
    failedGate: 'health_readiness',
    failureReason: 'CUTOVER_GATE_STEP_NOT_PASS:health_readiness:ingress-publication'
  });
  assert.deepEqual(calls, ['route-disable', 'ingress-orphan-recovery']);
  assert.equal(result.status, 'PASS_PUBLIC_ROUTE_DISABLED');
  assert.equal(result.orphanRecoveryRequired, true);
  assert.equal(result.orphanRecoveryVerified, true);
  assert.equal(result.orphanRecoveryEvidenceRef, 'synthetic://step/ingress-orphan-recovery');

  const blocked = createCutoverRouteDisableHandler({
    runStep: async (step) => step.id === 'route-disable'
      ? { exitCode: 0, status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://step/route-disable' }
      : { exitCode: 0, status: 'READY_WAIT_INGRESS_PARTIAL_MUTATION_REVIEW', evidenceRef: 'synthetic://step/orphan-review' },
    recordGateEvidence: async () => 'synthetic://must-not-record'
  });
  assert.equal((await blocked({
    failedGate: 'health_readiness',
    failureReason: 'CUTOVER_GATE_STEP_NOT_PASS:health_readiness:ingress-publication'
  })).status, 'FAIL_INGRESS_ORPHAN_RECOVERY_NOT_VERIFIED');
});

test('step 예외는 원문 없이 gate와 step identity를 보존한다', async () => {
  const { createCutoverGateHandlers } = await modulePromise;
  const handlers = createCutoverGateHandlers({
    runStep: async () => { throw new Error('provider-secret-and-response-must-not-escape'); },
    recordGateEvidence: async () => 'synthetic://must-not-record'
  });
  const result = await handlers.health_readiness();
  assert.deepEqual(result, {
    status: 'FAIL',
    reason: 'CUTOVER_GATE_STEP_THROWN:health_readiness:ingress-publication'
  });
  assert.doesNotMatch(JSON.stringify(result), /provider-secret|response/);
});

test('adapter plan 변조와 dependency 누락은 handler 생성 전에 차단한다', async () => {
  const { CUTOVER_GATE_ADAPTER_PLAN, createCutoverGateHandlers } = await modulePromise;
  const reversed = Object.fromEntries(Object.entries(CUTOVER_GATE_ADAPTER_PLAN).reverse());
  assert.throws(() => createCutoverGateHandlers({ runStep: async () => {}, recordGateEvidence: async () => '', plan: reversed }), /ORDER_INVALID/);
  assert.throws(() => createCutoverGateHandlers({}), /DEPENDENCY_INVALID/);
});
