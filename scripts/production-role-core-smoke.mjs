import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  ROLE_CORE_SMOKE_ROLES,
  evaluateRoleCoreSmoke,
  validateRoleCredential
} from '../src/operations/production-role-core-smoke.mjs';

const require = createRequire(import.meta.url);
const { totp } = require('../src/services/mfa-service');
const REFERENCE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',
  USER: 'PRODUCTION_UAT_USER_CREDENTIAL_FILE'
});
const TARGET = String(process.env.PRODUCTION_UAT_BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

function allowedTarget(value) {
  const url = new URL(value);
  return (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))
    || (url.protocol === 'https:' && url.hostname === 'inventory.safe-link.co.kr');
}

function existingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function json(response) {
  return response.json().catch(() => ({}));
}

async function post(path, session, body) {
  const response = await fetch(`${TARGET}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: session.cookie,
      'content-type': 'application/json',
      'x-csrf-token': session.token,
      'idempotency-key': crypto.randomUUID()
    },
    body: JSON.stringify({ ...body, _csrf: session.token })
  });
  return response;
}

async function get(path, cookie = '') {
  return fetch(`${TARGET}${path}`, { redirect: 'manual', headers: { cookie, accept: 'application/json' } });
}

async function loginRole(role, credential) {
  const csrfResponse = await get('/api/auth/csrf');
  const csrfData = await json(csrfResponse);
  const anonymous = { cookie: cookieFrom(csrfResponse), token: csrfData.csrfToken };
  const passwordResponse = await post('/api/auth/login', anonymous, {
    email: credential.email,
    password: credential.password
  });
  const passwordData = await json(passwordResponse);
  const challenge = { cookie: cookieFrom(passwordResponse), token: passwordData.csrfToken };
  const invalidResponse = await post('/api/auth/mfa/verify', challenge, { code: '000000' });
  const mfaResponse = await post('/api/auth/mfa/verify', challenge, { code: totp(credential.totpSecret) });
  const mfaData = await json(mfaResponse);
  const session = { cookie: cookieFrom(mfaResponse), token: mfaData.csrfToken };
  const organizationId = mfaData.user?.organizationId;
  const dashboard = await get(`/api/enterprise/dashboard?organizationId=${organizationId}`, session.cookie);
  const cost = await get(`/api/enterprise/cost/roi?organizationId=${organizationId}`, session.cookie);
  const admin = await get(`/api/enterprise/admin?organizationId=${organizationId}`, session.cookie);
  const logout = await post('/api/auth/logout', session, {});
  return {
    passwordStatus: passwordResponse.status,
    mfaRequired: passwordData.mfaRequired === true,
    invalidMfaStatus: invalidResponse.status,
    mfaStatus: mfaResponse.status,
    actualRole: mfaData.user?.role || null,
    dashboard: dashboard.status,
    cost: cost.status,
    admin: admin.status,
    logoutStatus: logout.status
  };
}

if (!allowedTarget(TARGET)) throw new Error('Production role smoke target is not allowlisted.');
const now = new Date();
const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start) && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
const publicTarget = new URL(TARGET).hostname === 'inventory.safe-link.co.kr';
const referencesPresent = Object.fromEntries(ROLE_CORE_SMOKE_ROLES.map((role) => [
  role, existingFile(process.env[REFERENCE_ENV[role]])
]));
const missing = ROLE_CORE_SMOKE_ROLES.filter((role) => !referencesPresent[role]);

if (missing.length || (publicTarget && !insideWindow)) {
  console.log(JSON.stringify({
    checkedAt: now.toISOString(),
    status: missing.length ? 'READY_WAIT_ROLE_CREDENTIAL_REFERENCES' : 'READY_WAIT_CHANGE_WINDOW_FOR_PUBLIC_ROLE_SMOKE',
    targetKind: publicTarget ? 'production-https' : 'loopback',
    referenceEnvironment: REFERENCE_ENV,
    referencesPresent,
    actualRoleCoreSmoke: 'NOT_RUN',
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exit(0);
}

const credentials = {};
for (const role of ROLE_CORE_SMOKE_ROLES) {
  credentials[role] = JSON.parse(readFileSync(process.env[REFERENCE_ENV[role]], 'utf8'));
  if (!validateRoleCredential(credentials[role])) throw new Error(`${role} credential reference contract is invalid.`);
}
const results = {};
for (const role of ROLE_CORE_SMOKE_ROLES) results[role] = await loginRole(role, credentials[role]);
results.anonymousItems = (await get('/api/items')).status;
const evaluation = evaluateRoleCoreSmoke(results);
console.log(JSON.stringify({
  checkedAt: now.toISOString(),
  targetKind: publicTarget ? 'production-https' : 'loopback',
  results,
  actualRoleCoreSmoke: evaluation.status === 'PASS_PRODUCTION_ROLE_CORE_SMOKE' ? 'PASS' : 'FAIL',
  secretValuesReadOrRecorded: false,
  ...evaluation
}, null, 2));
if (evaluation.failures.length) process.exitCode = 1;
