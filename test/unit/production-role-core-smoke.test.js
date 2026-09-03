const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const roleSmokeModule = import('../../src/operations/production-role-core-smoke.mjs');
const pass = {
  ADMIN: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'ADMIN',dashboard:200,cost:200,admin:200,logoutStatus:204 },
  MANAGER: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'MANAGER',dashboard:200,cost:200,admin:403,logoutStatus:204 },
  USER: { passwordStatus:202,mfaRequired:true,invalidMfaStatus:401,mfaStatus:200,actualRole:'USER',dashboard:200,cost:403,admin:403,logoutStatus:204 },
  anonymousItems: 401
};

test('credential reference는 이메일·12자 비밀번호·Base32 TOTP만 허용한다', async () => {
  const { validateRoleCredential } = await roleSmokeModule;
  assert.equal(validateRoleCredential({ email:'admin@example.com',password:'LongPassword!',totpSecret:'ABCDEFGHIJKLMNOP' }), true);
  assert.equal(validateRoleCredential({ email:'bad',password:'short',totpSecret:'secret' }), false);
});

test('세 역할의 MFA와 역할별 200/403 역조건이 모두 맞으면 PASS한다', async () => {
  const { evaluateRoleCoreSmoke } = await roleSmokeModule;
  const result = evaluateRoleCoreSmoke(pass);
  assert.equal(result.status, 'PASS_PRODUCTION_ROLE_CORE_SMOKE');
  assert.deepEqual(result.failures, []);
  assert.equal(result.productionGo, false);
});

test('MFA challenge가 생략되면 fail-closed 한다', async () => {
  const { evaluateRoleCoreSmoke } = await roleSmokeModule;
  const result = evaluateRoleCoreSmoke({ ...pass, USER: { ...pass.USER, passwordStatus:200,mfaRequired:false } });
  assert.ok(result.failures.includes('USER_MFA_CHALLENGE_FAILED'));
});

test('역할 권한 또는 익명 401이 다르면 실패한다', async () => {
  const { evaluateRoleCoreSmoke } = await roleSmokeModule;
  const result = evaluateRoleCoreSmoke({ ...pass, MANAGER: { ...pass.MANAGER, admin:200 }, anonymousItems:200 });
  assert.ok(result.failures.includes('MANAGER_ADMIN_EXPECTED_403'));
  assert.ok(result.failures.includes('ANONYMOUS_ITEMS_NOT_401'));
});

test('실제 로그인 쓰기 요청은 선택된 target의 same-origin 헤더를 전송한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-role-core-smoke.mjs'), 'utf8');
  assert.match(source, /origin:target/);
});
