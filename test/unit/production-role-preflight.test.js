const test = require('node:test');
const assert = require('node:assert/strict');

const rolePreflightModule = import('../../src/operations/production-role-preflight.mjs');
const completeCounts = {
  ADMIN: { active: 1, mfaEnabled: 1 },
  MANAGER: { active: 1, mfaEnabled: 1 },
  USER: { active: 1, mfaEnabled: 1 }
};
const completeReferences = { ADMIN: true, MANAGER: true, USER: true };

test('역할 사용자가 없으면 외부 입력을 기다리고 Production GO를 금지한다', async () => {
  const { evaluateProductionRolePreflight } = await rolePreflightModule;
  const result = evaluateProductionRolePreflight({ insideWindow: false, roleCounts: {}, credentialReferences: {} });
  assert.equal(result.status, 'READY_WAIT_ROLE_USERS_MFA_AND_CREDENTIAL_REFERENCES');
  assert.equal(result.missing.length, 9);
  assert.equal(result.productionGo, false);
});

test('사용자와 MFA가 있어도 credential reference가 없으면 준비 완료가 아니다', async () => {
  const { evaluateProductionRolePreflight } = await rolePreflightModule;
  const result = evaluateProductionRolePreflight({ insideWindow: false, roleCounts: completeCounts, credentialReferences: {} });
  assert.deepEqual(result.missing, [
    'ADMIN_CREDENTIAL_REFERENCE_MISSING', 'MANAGER_CREDENTIAL_REFERENCE_MISSING', 'USER_CREDENTIAL_REFERENCE_MISSING'
  ]);
});

test('모든 역할 준비가 끝나도 변경창 전에는 core smoke를 실행하지 않는다', async () => {
  const { evaluateProductionRolePreflight } = await rolePreflightModule;
  const result = evaluateProductionRolePreflight({ insideWindow: false, roleCounts: completeCounts, credentialReferences: completeReferences });
  assert.equal(result.status, 'READY_WAIT_CHANGE_WINDOW_FOR_ROLE_CORE_SMOKE');
  assert.equal(result.requiresChangeWindow, true);
});

test('모든 역할 준비와 변경창이 충족되면 core smoke 실행 준비만 허용한다', async () => {
  const { evaluateProductionRolePreflight } = await rolePreflightModule;
  const result = evaluateProductionRolePreflight({ insideWindow: true, roleCounts: completeCounts, credentialReferences: completeReferences });
  assert.equal(result.status, 'READY_FOR_ROLE_CORE_SMOKE');
  assert.equal(result.productionGo, false);
});
