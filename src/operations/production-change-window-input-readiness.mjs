import path from 'node:path';
import { validateRoleCredential } from './production-role-core-smoke.mjs';
import { validateProductionUatActorApproval } from './production-uat-actor-provision.mjs';

export const PREWINDOW_REFERENCE_NAMES = Object.freeze([
  'CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE',
  'PRODUCTION_UAT_ACTOR_APPROVAL_FILE',
  'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',
  'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',
  'PRODUCTION_UAT_USER_CREDENTIAL_FILE'
]);
export const MUTATING_CONFIRMATION_NAMES = Object.freeze([
  'PRODUCTION_CUTOVER_CONFIRMATION',
  'PRODUCTION_INGRESS_CONFIRMATION',
  'PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION',
  'PRODUCTION_ROUTE_DISABLE_CONFIRMATION',
  'PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION',
  'PRODUCTION_UAT_WRITE_CONFIRMATION',
  'PRODUCTION_CUTOVER_SIGNOFF_RESUME_CONFIRMATION',
  'PRODUCTION_CUTOVER_EVIDENCE_ASSEMBLY_CONFIRMATION'
]);

export function evaluateChangeWindowInputReadiness({ projectRoot, physicalReferences = {}, approval = null, credentials = {}, outputTarget = null, runtimePhysical = false, cloudflaredPresent = false, originCertificatePresent = false, armedConfirmations = [] } = {}) {
  const failures = [];
  const pending = [];
  for (const name of PREWINDOW_REFERENCE_NAMES) if (physicalReferences[name] !== true) pending.push(`${name}_MISSING_OR_NOT_PHYSICAL`);
  if (!runtimePhysical) failures.push('PRODUCTION_RUNTIME_NOT_PHYSICAL');
  if (!cloudflaredPresent) pending.push('CLOUDFLARED_BINARY_MISSING');
  if (!originCertificatePresent) pending.push('CLOUDFLARE_ORIGIN_CERTIFICATE_MISSING');
  if (armedConfirmations.length) failures.push('MUTATING_CONFIRMATION_PREARMED_OUTSIDE_CHANGE_WINDOW');

  const actorRefsReady = ['PRODUCTION_UAT_ACTOR_APPROVAL_FILE', 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE', 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE', 'PRODUCTION_UAT_USER_CREDENTIAL_FILE']
    .every((name) => physicalReferences[name] === true);
  if (actorRefsReady) {
    if (!validateProductionUatActorApproval(approval)) failures.push('UAT_ACTOR_APPROVAL_CONTRACT_INVALID');
    const roles = ['ADMIN', 'MANAGER', 'USER'];
    for (const role of roles) if (!validateRoleCredential(credentials[role])) failures.push(`${role}_CREDENTIAL_CONTRACT_INVALID`);
    if (!failures.some((failure) => /APPROVAL|CREDENTIAL/.test(failure))) {
      const approved = Object.fromEntries(approval.actors.map((actor) => [String(actor.role).toUpperCase(), String(actor.email).toLowerCase()]));
      const emails = roles.map((role) => String(credentials[role].email).toLowerCase());
      if (new Set(emails).size !== roles.length) failures.push('UAT_CREDENTIAL_EMAILS_NOT_UNIQUE');
      for (const role of roles) if (String(credentials[role].email).toLowerCase() !== approved[role]) failures.push(`${role}_CREDENTIAL_NOT_APPROVED`);
    }
  }

  if (!outputTarget) pending.push('PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE_MISSING');
  else {
    const root = path.resolve(projectRoot || '.').toLowerCase();
    const target = path.resolve(outputTarget.path || '').toLowerCase();
    if (!target || target.startsWith(`${root}${path.sep}`)) failures.push('ACTUAL_EVIDENCE_OUTPUT_MUST_BE_EXTERNAL');
    if (outputTarget.exists) failures.push('ACTUAL_EVIDENCE_OUTPUT_ALREADY_EXISTS');
    if (!outputTarget.parentPhysical) failures.push('ACTUAL_EVIDENCE_OUTPUT_PARENT_NOT_PHYSICAL');
  }

  return {
    status: failures.length ? 'BLOCKED_CHANGE_WINDOW_INPUT_CONTRACT' : pending.length ? 'READY_WAIT_CHANGE_WINDOW_INPUT_REFERENCES' : 'PASS_CHANGE_WINDOW_INPUTS_READY_UNARMED',
    failures: [...new Set(failures)], pending: [...new Set(pending)],
    referenceCount: PREWINDOW_REFERENCE_NAMES.length,
    readyReferenceCount: PREWINDOW_REFERENCE_NAMES.filter((name) => physicalReferences[name] === true).length,
    confirmationsArmed: armedConfirmations.length,
    safeToEnterChangeWindow: failures.length === 0 && pending.length === 0
  };
}
