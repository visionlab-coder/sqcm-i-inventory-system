export const PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION = 'ACK-2026-09-03-PROVISION-PRODUCTION-UAT-ACTORS';
export const PRODUCTION_UAT_ACTOR_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'USER']);

export function evaluateProductionUatActorProvisionGate(input) {
  const failures = [];
  if (input.environment !== 'production') failures.push('UAT_ACTOR_ENVIRONMENT_INVALID');
  if (input.organizationCode !== 'SEOWON') failures.push('UAT_ACTOR_ORGANIZATION_INVALID');
  if (input.preserveExistingUsers !== true || input.failOnIdentityConflict !== true) failures.push('UAT_ACTOR_PRESERVATION_INVALID');
  if (failures.length) return { status: 'FAIL_UAT_ACTOR_PROVISION_CONTRACT', failures, externalMutationPerformed: false, productionGo: false };

  const pending = [];
  if (!input.approvalReferencePresent) pending.push('PRODUCTION_UAT_ACTOR_APPROVAL_REFERENCE_MISSING');
  for (const role of PRODUCTION_UAT_ACTOR_ROLES) if (input.credentialReferences?.[role] !== true) pending.push(`${role}_CREDENTIAL_REFERENCE_MISSING`);
  if (!input.execute) return { status: pending.length ? 'READY_WAIT_UAT_ACTOR_PROVISION_INPUTS' : 'PASS_UAT_ACTOR_PROVISION_DRY_RUN_READY', failures: [], pending, externalMutationPerformed: false, actualProductionActors: 'NOT_RUN', productionGo: false };
  if (!input.insideWindow) return { status: 'FAIL_UAT_ACTOR_PROVISION_OUTSIDE_CHANGE_WINDOW', failures: ['OUTSIDE_APPROVED_CHANGE_WINDOW'], externalMutationPerformed: false, productionGo: false };
  if (!input.confirmed) return { status: 'READY_WAIT_UAT_ACTOR_PROVISION_CONFIRMATION', failures: [], pending: ['UAT_ACTOR_PROVISION_CONFIRMATION_MISSING'], externalMutationPerformed: false, productionGo: false };
  if (pending.length) return { status: 'READY_WAIT_UAT_ACTOR_PROVISION_INPUTS', failures: [], pending, externalMutationPerformed: false, productionGo: false };
  return { status: 'READY_UAT_ACTOR_PROVISION_EXECUTION', failures: [], pending: [], externalMutationPerformed: false, productionGo: false };
}

export function validateProductionUatActorApproval(value) {
  if (!value || value.schemaVersion !== 1 || value.environment !== 'production' || value.organizationCode !== 'SEOWON') return false;
  if (typeof value.approvalId !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{7,79}$/.test(value.approvalId)) return false;
  if (typeof value.approvedAt !== 'string' || Number.isNaN(Date.parse(value.approvedAt))) return false;
  if (!Array.isArray(value.actors) || value.actors.length !== PRODUCTION_UAT_ACTOR_ROLES.length) return false;
  const roles = new Set(); const emails = new Set();
  for (const actor of value.actors) {
    const role = String(actor?.role || '').toUpperCase(); const email = String(actor?.email || '').toLowerCase();
    if (!PRODUCTION_UAT_ACTOR_ROLES.includes(role) || roles.has(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.has(email) || actor.approved !== true) return false;
    roles.add(role); emails.add(email);
  }
  return PRODUCTION_UAT_ACTOR_ROLES.every((role) => roles.has(role));
}

export function classifyProductionUatActorProvisionResult(value) {
  const roles = Array.isArray(value?.roles) ? value.roles : [];
  const exactRoles = roles.length === 3 && new Set(roles).size === 3 && PRODUCTION_UAT_ACTOR_ROLES.every((role) => roles.includes(role));
  if (!exactRoles || value.activeCount !== 3 || value.mfaEnabledCount !== 3 || value.scopeCount !== 3 || value.auditCount !== 3 || value.sessionCountAfter !== 0) {
    return { status: 'FAIL_UAT_ACTOR_PROVISION_RESULT', failures: ['UAT_ACTOR_POSTCONDITION_INVALID'], actualProductionActors: 'FAIL', productionGo: false };
  }
  return { status: 'PASS_PRODUCTION_UAT_ACTORS_PROVISIONED', failures: [], actualProductionActors: 'PASS', productionGo: false };
}
