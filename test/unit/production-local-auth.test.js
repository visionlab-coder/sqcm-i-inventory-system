const test = require('node:test');
const assert = require('node:assert/strict');
const { requiresMfaEnrollment, validateStrongPassword } = require('../../src/app');

test('Production 로컬 인증은 권한 사용자 MFA를 유지하고 일반 직원의 최초 비밀번호 변경을 먼저 허용한다', () => {
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:false, password_reset_required:false }), true);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'MANAGER', mfa_enabled:false, password_reset_required:false }), true);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'USER', mfa_enabled:false, password_reset_required:false }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:false, password_reset_required:true }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { role:'ADMIN', mfa_enabled:true, password_reset_required:false }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: false }, { role:'ADMIN', mfa_enabled:false, password_reset_required:false }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: false }, { role:'MANAGER', mfa_enabled:false, password_reset_required:false }), false);
});

test('새 비밀번호는 10자 이상 영문·숫자·특수문자를 요구하되 대소문자 혼합은 강제하지 않는다', () => {
  assert.equal(validateStrongPassword('StrongPassword12!'), true);
  assert.equal(validateStrongPassword('lower1234!'), true);
  assert.equal(validateStrongPassword('UPPER1234!'), true);
  assert.equal(validateStrongPassword('lower123!'), false);
  assert.equal(validateStrongPassword('NoDigitsAllowed!'), false);
  assert.equal(validateStrongPassword('NoSpecial123456'), false);
  assert.equal(validateStrongPassword('123456789!'), false);
  assert.equal(validateStrongPassword('lower1234 '), false);
  assert.equal(validateStrongPassword('lower1234한'), false);
  assert.equal(validateStrongPassword(null), false);
});
