import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  PRODUCTION_SIGNOFF_AREAS,
  PRODUCTION_UAT_RESULT_ROLES,
  evaluateProductionSignoffPreflight
} from '../src/operations/production-signoff-preflight.mjs';
import { validateSignoffReferenceSet } from '../src/operations/production-signoff-reference-runtime.mjs';

const CANDIDATE_PATH = new URL('../agent docs/harness/P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json', import.meta.url);
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROLE_REFERENCE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_RESULT_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_RESULT_FILE',
  USER: 'PRODUCTION_UAT_USER_RESULT_FILE'
});
const SIGNOFF_REFERENCE_ENV = Object.freeze({
  BUSINESS: 'PRODUCTION_BUSINESS_SIGNOFF_FILE',
  SECURITY: 'PRODUCTION_SECURITY_SIGNOFF_FILE',
  OPERATIONS: 'PRODUCTION_OPERATIONS_SIGNOFF_FILE'
});
const CANDIDATE_ROLE_NAMES = Object.freeze({ ADMIN: 'admin', MANAGER: 'manager', USER: 'employee' });

const candidate = JSON.parse(readFileSync(CANDIDATE_PATH, 'utf8'));
const uatGate = candidate.gates?.find((gate) => gate.id === 'uat_signoff');
const roleStatesPending = PRODUCTION_UAT_RESULT_ROLES.every((role) =>
  candidate.pilot?.roleResults?.some((result) => result.role === CANDIDATE_ROLE_NAMES[role] && result.status === 'PENDING')
);
const approvalStatesPending = PRODUCTION_SIGNOFF_AREAS.every((area) =>
  candidate.approvals?.[area.toLowerCase()]?.status === 'PENDING'
);
const candidatePending = uatGate?.status === 'PENDING' && roleStatesPending && approvalStatesPending
  && candidate.productionGo === false;

const now = new Date();
const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
  && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
const combinedReferences = validateSignoffReferenceSet(Object.fromEntries([
  ...PRODUCTION_UAT_RESULT_ROLES.map((role) => [`ROLE_${role}`, process.env[ROLE_REFERENCE_ENV[role]]]),
  ...PRODUCTION_SIGNOFF_AREAS.map((area) => [`SIGNOFF_${area}`, process.env[SIGNOFF_REFERENCE_ENV[area]]])
]), { projectRoot: PROJECT_ROOT });
const roleResultReferences = Object.fromEntries(PRODUCTION_UAT_RESULT_ROLES.map((role) => [role, combinedReferences[`ROLE_${role}`]]));
const signoffReferences = Object.fromEntries(PRODUCTION_SIGNOFF_AREAS.map((area) => [area, combinedReferences[`SIGNOFF_${area}`]]));
const result = evaluateProductionSignoffPreflight({
  insideWindow,
  candidatePending,
  roleResultReferences,
  signoffReferences
});

console.log(JSON.stringify({
  checkedAt: now.toISOString(),
  insideWindow,
  candidatePending,
  referenceEnvironment: {
    roleResults: ROLE_REFERENCE_ENV,
    signoffs: SIGNOFF_REFERENCE_ENV
  },
  referencePresence: {
    roleResults: roleResultReferences,
    signoffs: signoffReferences
  },
  actualProductionUatSignoff: 'NOT_RUN',
  ...result
}, null, 2));

if (result.status.startsWith('FAIL_')) process.exitCode = 1;
