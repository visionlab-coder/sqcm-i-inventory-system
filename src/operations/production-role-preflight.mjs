export const PRODUCTION_UAT_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'USER']);

export function evaluateProductionRolePreflight(observation) {
  const missing = [];
  const roles = {};

  for (const role of PRODUCTION_UAT_ROLES) {
    const counts = observation.roleCounts?.[role] || {};
    const active = Number(counts.active || 0);
    const mfaEnabled = Number(counts.mfaEnabled || 0);
    const credentialReferencePresent = observation.credentialReferences?.[role] === true;
    roles[role] = { active, mfaEnabled, credentialReferencePresent };
    if (active < 1) missing.push(`${role}_ACTIVE_USER_MISSING`);
    if (mfaEnabled < 1) missing.push(`${role}_MFA_USER_MISSING`);
    if (!credentialReferencePresent) missing.push(`${role}_CREDENTIAL_REFERENCE_MISSING`);
  }

  const ready = missing.length === 0;
  return {
    status: !ready
      ? 'READY_WAIT_ROLE_USERS_MFA_AND_CREDENTIAL_REFERENCES'
      : observation.insideWindow
        ? 'READY_FOR_ROLE_CORE_SMOKE'
        : 'READY_WAIT_CHANGE_WINDOW_FOR_ROLE_CORE_SMOKE',
    roles,
    missing,
    requiresExternalInput: !ready,
    requiresChangeWindow: ready && !observation.insideWindow,
    productionGo: false
  };
}
