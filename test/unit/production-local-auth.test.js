const test = require('node:test');
const assert = require('node:assert/strict');
const { requiresMfaEnrollment, validateStrongPassword } = require('../../src/app');

test('Production 로컬 인증은 권한 사용자 MFA를 유지하고 일반 직원의 최초 비밀번호 변경을 먼저 허용한다', () => {
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:false, password_reset_required:false }), true);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'MANAGER', mfa_enabled:false, password_reset_required:false }), true);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'USER', mfa_enabled:false, password_reset_required:false }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:false, password_reset_required:true }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:true, password_reset_required:false }), false);
});

test('새 비밀번호는 12자와 네 종류 문자 조건을 모두 충족한다', () => {
  assert.equal(validateStrongPassword('StrongPassword12!'), true);
  assert.equal(validateStrongPassword('short1!A'), false);
  assert.equal(validateStrongPassword('lowercase-only-12!'), false);
  assert.equal(validateStrongPassword('UPPERCASE-ONLY-12!'), false);
  assert.equal(validateStrongPassword('NoDigitsAllowed!'), false);
  assert.equal(validateStrongPassword('NoSpecial123456'), false);
});
