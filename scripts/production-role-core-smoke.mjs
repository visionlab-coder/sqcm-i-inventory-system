import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import {
  ROLE_CORE_SMOKE_ROLES,
  evaluateRoleCoreSmoke,
  validateRoleCredential
} from '../src/operations/production-role-core-smoke.mjs';
import {
  classifyRoleSmokeEvidence,
  selectProductionRoleSmokeTarget
} from '../src/operations/production-role-smoke-target.mjs';
import {
  cleanupRoleSmokeSession,
  readRoleSmokeJson,
  requestRoleSmokeHttp
} from '../src/operations/production-role-core-smoke-runtime.mjs';
import { inspectProductionUatJsonReference, readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';

const require = createRequire(import.meta.url);
const { totp } = require('../src/services/mfa-service');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE_ENV = Object.freeze({
  ADMIN: 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',
  MANAGER: 'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',
  USER: 'PRODUCTION_UAT_USER_CREDENTIAL_FILE'
});

function existingFile(value) {
  return inspectProductionUatJsonReference(value, { repositoryRoot: projectRoot }).present;
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function json(response) {
  return readRoleSmokeJson(response);
}

async function post(path, session, body) {
  return requestRoleSmokeHttp({
    url:`${target}${path}`,
    options:{
      method:'POST',
      redirect:'manual',
      headers:{
        cookie:session.cookie,
        origin:target,
        'content-type':'application/json',
        'x-csrf-token':session.token,
        'idempotency-key':crypto.randomUUID()
      },
      body:JSON.stringify({ ...body, _csrf:session.token })
    }
  });
}

async function get(path, cookie = '') {
  return requestRoleSmokeHttp({
    url:`${target}${path}`,
    options:{ redirect:'manual',headers:{ cookie,accept:'application/json' } }
  });
}

async function loginRole(role, credential) {
  let activeSession = null;
  try {
    const csrfResponse = await get('/api/auth/csrf');
    const csrfData = await json(csrfResponse);
    const anonymous = { cookie:cookieFrom(csrfResponse),token:csrfData.csrfToken };
    const passwordResponse = await post('/api/auth/login', anonymous, {
      email:credential.email,password:credential.password
    });
    const passwordData = await json(passwordResponse);
    const challenge = { cookie:cookieFrom(passwordResponse),token:passwordData.csrfToken };
    const invalidResponse = await post('/api/auth/mfa/verify', challenge, { code:'000000' });
    const mfaResponse = await post('/api/auth/mfa/verify', challenge, { code:totp(credential.totpSecret) });
    const mfaData = await json(mfaResponse);
    activeSession = { cookie:cookieFrom(mfaResponse),token:mfaData.csrfToken };
    const organizationId = mfaData.user?.organizationId;
    const dashboard = await get(`/api/enterprise/dashboard?organizationId=${organizationId}`, activeSession.cookie);
    const cost = await get(`/api/enterprise/cost/roi?organizationId=${organizationId}`, activeSession.cookie);
    const admin = await get(`/api/enterprise/admin?organizationId=${organizationId}`, activeSession.cookie);
    const logout = await post('/api/auth/logout', activeSession, {});
    activeSession = null;
    return {
      passwordStatus:passwordResponse.status,
      mfaRequired:passwordData.mfaRequired === true,
      invalidMfaStatus:invalidResponse.status,
      mfaStatus:mfaResponse.status,
      actualRole:mfaData.user?.role || null,
      dashboard:dashboard.status,
      cost:cost.status,
      admin:admin.status,
      logoutStatus:logout.status
    };
  } catch (error) {
    await cleanupRoleSmokeSession({
      session:activeSession,
      logout:(session) => post('/api/auth/logout', session, {})
    });
    throw error;
  }
}

const now = new Date();
const selection = selectProductionRoleSmokeTarget({
  publicMode: process.argv.includes('--public'),
  now,
  windowStart: new Date(PRODUCTION_CHANGE_WINDOW.start),
  windowEnd: new Date(PRODUCTION_CHANGE_WINDOW.end),
  confirmation: process.env.PRODUCTION_PUBLIC_ROLE_SMOKE_CONFIRMATION
});
if (selection.status.startsWith('FAIL_')) {
  console.error(JSON.stringify({ checkedAt: now.toISOString(), ...selection, productionGo: false }, null, 2));
  process.exit(1);
}
if (!selection.target) {
  console.log(JSON.stringify({ checkedAt: now.toISOString(), ...selection, actualRoleCoreSmoke: 'NOT_RUN', productionGo: false }, null, 2));
  process.exit(0);
}
const target = selection.target;
const referencesPresent = Object.fromEntries(ROLE_CORE_SMOKE_ROLES.map((role) => [
  role, existingFile(process.env[REFERENCE_ENV[role]])
]));
const missing = ROLE_CORE_SMOKE_ROLES.filter((role) => !referencesPresent[role]);

if (missing.length) {
  console.log(JSON.stringify({
    checkedAt: now.toISOString(),
    status: 'READY_WAIT_ROLE_CREDENTIAL_REFERENCES',
    targetKind: selection.targetKind,
    referenceEnvironment: REFERENCE_ENV,
    referencesPresent,
    actualRoleCoreSmoke: 'NOT_RUN',
    secretValuesReadOrRecorded: false,
    productionGo: false
  }, null, 2));
  process.exit(0);
}

async function executeRoleCoreSmoke() {
  const credentials = {};
  for (const role of ROLE_CORE_SMOKE_ROLES) {
    credentials[role] = readProductionUatJsonDocument(process.env[REFERENCE_ENV[role]], { repositoryRoot: projectRoot }).value;
    if (!validateRoleCredential(credentials[role])) throw new Error('ROLE_SMOKE_CREDENTIAL_REFERENCE_INVALID');
  }
  const results = {};
  for (const role of ROLE_CORE_SMOKE_ROLES) results[role] = await loginRole(role, credentials[role]);
  results.anonymousItems = (await get('/api/items')).status;
  const evaluation = evaluateRoleCoreSmoke(results);
  const classification = classifyRoleSmokeEvidence(evaluation, selection.actualProductionGate);
  console.log(JSON.stringify({
    checkedAt:now.toISOString(),
    targetKind:selection.targetKind,
    results,
    secretValuesReadOrRecorded:false,
    ...classification
  },null,2));
  if (classification.failures.length) process.exitCode = 1;
}

executeRoleCoreSmoke().catch((error) => {
  const allowedFailure = /^ROLE_SMOKE_[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'ROLE_SMOKE_EXECUTION_FAILED';
  console.error(JSON.stringify({
    checkedAt:new Date().toISOString(),
    targetKind:selection.targetKind,
    status:'FAIL_PRODUCTION_ROLE_CORE_SMOKE_EXECUTION',
    failures:[allowedFailure],
    actualRoleCoreSmoke:'FAIL',
    secretValuesReadOrRecorded:false,
    productionGo:false
  },null,2));
  process.exitCode = 1;
});
