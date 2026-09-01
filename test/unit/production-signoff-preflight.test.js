const test = require('node:test');
const assert = require('node:assert/strict');

const signoffPreflightModule = import('../../src/operations/production-signoff-preflight.mjs');
const completeRoleReferences = { ADMIN: true, MANAGER: true, USER: true };
const completeSignoffReferences = { BUSINESS: true, SECURITY: true, OPERATIONS: true };

test('Production UAT와 서명 참조가 없으면 외부 입력을 기다리고 GO를 금지한다', async () => {
  const { evaluateProductionSignoffPreflight } = await signoffPreflightModule;
  const result = evaluateProductionSignoffPreflight({ candidatePending: true, insideWindow: false });
  assert.equal(result.status, 'READY_WAIT_PRODUCTION_UAT_AND_SIGNOFF_REFERENCES');
  assert.equal(result.missing.length, 6);
  assert.equal(result.productionGo, false);
});

test('참조가 모두 있어도 변경창 전에는 서명 검증을 실행하지 않는다', async () => {
  const { evaluateProductionSignoffPreflight } = await signoffPreflightModule;
  const result = evaluateProductionSignoffPreflight({
    candidatePending: true,
    insideWindow: false,
    roleResultReferences: completeRoleReferences,
    signoffReferences: completeSignoffReferences
  });
  assert.equal(result.status, 'READY_WAIT_CHANGE_WINDOW_FOR_UAT_SIGNOFF_VALIDATION');
  assert.equal(result.requiresChangeWindow, true);
});

test('참조와 변경창이 충족되어도 실제 검증 준비만 허용한다', async () => {
  const { evaluateProductionSignoffPreflight } = await signoffPreflightModule;
  const result = evaluateProductionSignoffPreflight({
    candidatePending: true,
    insideWindow: true,
    roleResultReferences: completeRoleReferences,
    signoffReferences: completeSignoffReferences
  });
  assert.equal(result.status, 'READY_FOR_UAT_SIGNOFF_VALIDATION');
  assert.equal(result.productionGo, false);
});

test('후보 상태가 이미 바뀌었으면 fail-closed로 중단한다', async () => {
  const { evaluateProductionSignoffPreflight } = await signoffPreflightModule;
  const result = evaluateProductionSignoffPreflight({ candidatePending: false, insideWindow: true });
  assert.equal(result.status, 'FAIL_SIGNOFF_CANDIDATE_STATE');
  assert.equal(result.productionGo, false);
});
