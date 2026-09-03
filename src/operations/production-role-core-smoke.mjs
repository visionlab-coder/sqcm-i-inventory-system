export const ROLE_CORE_SMOKE_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'USER']);

export const ROLE_CORE_SMOKE_MATRIX = Object.freeze({
  ADMIN: Object.freeze({ dashboard: 200, cost: 200, admin: 200 }),
  MANAGER: Object.freeze({ dashboard: 200, cost: 200, admin: 403 }),
  USER: Object.freeze({ dashboard: 200, cost: 403, admin: 403 })
});

export function validateRoleCredential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
    && typeof value.password === 'string' && value.password.length >= 12
    && typeof value.totpSecret === 'string' && /^[A-Z2-7]{16,128}$/.test(value.totpSecret);
}

export function evaluateRoleCoreSmoke(results) {
  const failures = [];
  for (const role of ROLE_CORE_SMOKE_ROLES) {
    const result = results?.[role];
    if (!result) {
      failures.push(`${role}_RESULT_MISSING`);
      continue;
    }
    if (result.passwordStatus !== 202 || result.mfaRequired !== true) failures.push(`${role}_MFA_CHALLENGE_FAILED`);
    if (result.invalidMfaStatus !== 401) failures.push(`${role}_INVALID_MFA_NOT_REJECTED`);
    if (result.mfaStatus !== 200 || result.actualRole !== role) failures.push(`${role}_MFA_ROLE_FAILED`);
    for (const [check, expected] of Object.entries(ROLE_CORE_SMOKE_MATRIX[role])) {
      if (result[check] !== expected) failures.push(`${role}_${check.toUpperCase()}_EXPECTED_${expected}`);
    }
    if (result.logoutStatus !== 204) failures.push(`${role}_LOGOUT_FAILED`);
  }
  if (results?.anonymousItems !== 401) failures.push('ANONYMOUS_ITEMS_NOT_401');
  return {
    status: failures.length ? 'FAIL_PRODUCTION_ROLE_CORE_SMOKE' : 'PASS_PRODUCTION_ROLE_CORE_SMOKE',
    failures,
    productionGo: false
  };
}
