const test = require('node:test');
const assert = require('node:assert/strict');
const { requiresMfaEnrollment } = require('../../src/app');

test('Production 로컬 인증은 MFA 미등록 사용자만 세션 발급 전에 차단한다', () => {
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { mfa_enabled: false }), true);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: true }, { mfa_enabled: true }), false);
  assert.equal(requiresMfaEnrollment({ localAuthMfaRequired: false }, { mfa_enabled: false }), false);
});
