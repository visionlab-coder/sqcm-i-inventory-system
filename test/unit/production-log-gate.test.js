const test = require('node:test');
const assert = require('node:assert/strict');

const logGateModule = import('../../src/operations/production-log-gate.mjs');

const clean = (insideWindow = false) => ({
  insideWindow,
  http5xxCount: 0,
  readinessTransient503Count: 0,
  currentReadinessStatus: 200,
  fatalEventCount: 0,
  errorLevelCount: 0,
  outboxRetryCount: 0,
  outboxDeadLetterCount: 0
});

test('변경창 전 clean 로그는 기준선 PASS와 재검사 필요를 반환한다', async () => {
  const { evaluateProductionLogGate } = await logGateModule;
  const result = evaluateProductionLogGate(clean(false));
  assert.equal(result.status, 'PASS_BASELINE_READY_FOR_POST_CUTOVER_RECHECK');
  assert.equal(result.requiresPostCutoverRecheck, true);
  assert.equal(result.productionGo, false);
});

test('변경창 안 clean 로그만 실제 logs_5xx PASS다', async () => {
  const { evaluateProductionLogGate } = await logGateModule;
  const result = evaluateProductionLogGate(clean(true));
  assert.equal(result.status, 'PASS_LOGS_5XX');
  assert.equal(result.requiresPostCutoverRecheck, false);
});

test('5xx·치명 오류·outbox 실패 중 하나라도 있으면 fail closed 한다', async () => {
  const { evaluateProductionLogGate } = await logGateModule;
  const result = evaluateProductionLogGate({
    ...clean(true), http5xxCount: 1, fatalEventCount: 2, outboxRetryCount: 3, outboxDeadLetterCount: 1
  });
  assert.equal(result.status, 'FAIL_LOGS_5XX');
  assert.equal(result.failures.length, 4);
});

test('기동 중 readiness 503은 현재 readiness 200 복구가 확인될 때만 별도 transient로 보존한다', async () => {
  const { evaluateProductionLogGate } = await logGateModule;
  assert.equal(evaluateProductionLogGate({ ...clean(true),readinessTransient503Count:1 }).status,'PASS_LOGS_5XX');
  const failed = evaluateProductionLogGate({ ...clean(true),readinessTransient503Count:1,currentReadinessStatus:503 });
  assert.ok(failed.failures.includes('CURRENT_READINESS_NOT_200'));
});
