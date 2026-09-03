import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRoleCredential } from '../src/operations/production-role-core-smoke.mjs';
import {
  AUTHENTICATED_IDEMPOTENCY_WRITE_CONFIRMATION,
  classifyAuthenticatedIdempotencyEvidence,
  evaluateAuthenticatedIdempotency,
  selectAuthenticatedIdempotencyTarget
} from '../src/operations/production-authenticated-idempotency.mjs';
import {
  cleanupAuthenticatedIdempotencyRun,
  readAuthenticatedIdempotencyJson,
  requestAuthenticatedIdempotencyHttp,
  runAuthenticatedIdempotencyProcess
} from '../src/operations/production-authenticated-idempotency-runtime.mjs';
import { inspectProductionUatJsonReference, readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';

const require = createRequire(import.meta.url);
const { totp } = require('../src/services/mfa-service');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREDENTIAL_ENV = 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE';
const CONFIRMATION_ENV = 'PRODUCTION_UAT_WRITE_CONFIRMATION';

function existingFile(value) {
  return inspectProductionUatJsonReference(value, { repositoryRoot: projectRoot }).present;
}

function cookieFrom(response) { return response.headers.get('set-cookie')?.split(';')[0] || ''; }
async function data(response) { return readAuthenticatedIdempotencyJson(response); }
async function get(path, cookie = '') {
  return requestAuthenticatedIdempotencyHttp({
    url:`${target}${path}`,
    options:{ redirect:'manual',headers:{ cookie,accept:'application/json' } }
  });
}
async function post(path, session, body, key, includeCsrf = true) {
  const headers = { cookie:session.cookie, origin:target, 'content-type':'application/json', 'idempotency-key':key };
  if (includeCsrf) headers['x-csrf-token'] = session.token;
  return requestAuthenticatedIdempotencyHttp({
    url:`${target}${path}`,
    options:{ method:'POST',redirect:'manual',headers,body:JSON.stringify(includeCsrf ? { ...body,_csrf:session.token } : body) }
  });
}

function databaseContainer() {
  const result = runAuthenticatedIdempotencyProcess('docker', ['ps','--filter','label=com.docker.compose.project=seowon-inventory-production','--filter','label=com.docker.compose.service=database','--format','{{.ID}}']);
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw new Error('AUTHENTICATED_IDEMPOTENCY_DATABASE_CONTAINER_INVALID');
  return ids[0];
}

function sql(container, statement) {
  const result = runAuthenticatedIdempotencyProcess('docker', ['exec',container,'psql','-U','seowon','-d','seowon_inventory','-At','-F',',','-c',statement]);
  return result.stdout.trim();
}

function cleanupSql(container, marker, key) {
  const assetTag = `P6-IDEM-${marker}`.toUpperCase();
  sql(container, `begin; delete from api_idempotency_keys where idempotency_key in ('${key}','p6-csrf-${marker}'); delete from asset_financial_profiles where asset_id in (select id from assets where asset_tag='${assetTag}'); delete from asset_status_histories where asset_id in (select id from assets where asset_tag='${assetTag}'); delete from outbox_events where aggregate_type='ASSET' and aggregate_id in (select id::text from assets where asset_tag='${assetTag}'); delete from audit_logs where entity_type='ASSET' and entity_id in (select id::text from assets where asset_tag='${assetTag}'); delete from assets where asset_tag='${assetTag}'; commit;`);
}

const now = new Date();
const selection = selectAuthenticatedIdempotencyTarget({
  publicMode: process.argv.includes('--public'),
  now,
  windowStart: new Date(PRODUCTION_CHANGE_WINDOW.start),
  windowEnd: new Date(PRODUCTION_CHANGE_WINDOW.end)
});
if (selection.status.startsWith('FAIL_')) {
  console.error(JSON.stringify({ checkedAt:now.toISOString(),...selection,productionGo:false }, null, 2));
  process.exit(1);
}
const target = selection.target;
const credentialPresent = existingFile(process.env[CREDENTIAL_ENV]);
const writeConfirmed = process.env[CONFIRMATION_ENV] === AUTHENTICATED_IDEMPOTENCY_WRITE_CONFIRMATION;
if (!credentialPresent || !writeConfirmed) {
  console.log(JSON.stringify({
    checkedAt:now.toISOString(),
    status:'READY_WAIT_ADMIN_CREDENTIAL_AND_WRITE_CONFIRMATION',
    targetKind:selection.targetKind,
    requiredEnvironment:[CREDENTIAL_ENV,CONFIRMATION_ENV],
    credentialReferencePresent:credentialPresent,
    writeConfirmationPresent:writeConfirmed,
    actualAuthenticatedCsrfIdempotency:'NOT_RUN',
    secretValuesReadOrRecorded:false,
    productionGo:false
  }, null, 2));
  process.exit(0);
}

async function executeAuthenticatedIdempotency() {
  let session = null;
  let marker = null;
  let key = null;
  let container = null;
  try {
    const credential = readProductionUatJsonDocument(process.env[CREDENTIAL_ENV], { repositoryRoot: projectRoot }).value;
    if (!validateRoleCredential(credential)) throw new Error('AUTHENTICATED_IDEMPOTENCY_CREDENTIAL_REFERENCE_INVALID');
    const csrfResponse = await get('/api/auth/csrf');
    const anonymous = { cookie:cookieFrom(csrfResponse),token:(await data(csrfResponse)).csrfToken };
    const passwordResponse = await post('/api/auth/login', anonymous, { email:credential.email,password:credential.password }, `login-${crypto.randomUUID()}`);
    const passwordData = await data(passwordResponse);
    if (passwordResponse.status !== 202) throw new Error(`AUTHENTICATED_IDEMPOTENCY_PASSWORD_STATUS_${passwordResponse.status}`);
    if (passwordData.mfaRequired !== true) throw new Error('AUTHENTICATED_IDEMPOTENCY_MFA_CHALLENGE_MISSING');
    const challenge = { cookie:cookieFrom(passwordResponse),token:passwordData.csrfToken };
    let mfaResponse = await post('/api/auth/mfa/verify', challenge, { code:totp(credential.totpSecret) }, `mfa-${crypto.randomUUID()}`);
    if (mfaResponse.status === 401) {
      const waitMs = ((30 - (Math.floor(Date.now() / 1000) % 30)) + 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      mfaResponse = await post('/api/auth/mfa/verify', challenge, { code:totp(credential.totpSecret) }, `mfa-retry-${crypto.randomUUID()}`);
    }
    const mfaData = await data(mfaResponse);
    session = { cookie:cookieFrom(mfaResponse),token:mfaData.csrfToken };
    if (mfaResponse.status !== 200 || mfaData.user?.role !== 'ADMIN') throw new Error('AUTHENTICATED_IDEMPOTENCY_ADMIN_MFA_FAILED');
    const referenceResponse = await get('/api/enterprise/reference', session.cookie);
    const reference = await data(referenceResponse);
    if (referenceResponse.status !== 200) throw new Error('AUTHENTICATED_IDEMPOTENCY_REFERENCE_UNAVAILABLE');

    marker = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
    key = `p6-idem-${marker}`;
    const body = {
      organizationId:mfaData.user.organizationId,
      assetTag:`P6-IDEM-${marker}`,
      name:`P6 idempotency ${marker}`,
      departmentId:reference.departments?.[0]?.id || null,
      locationId:reference.locations?.[0]?.id || null,
      categoryId:reference.categories?.[0]?.id || null,
      statusCode:'AVAILABLE'
    };
    container = databaseContainer();
    const missingCsrf = await post('/api/enterprise/assets', session, body, `p6-csrf-${marker}`, false);
    const missingCsrfData = await data(missingCsrf);
    const first = await post('/api/enterprise/assets', session, body, key);
    const firstData = await data(first);
    const assetId = Number(firstData.asset?.id);
    const replay = await post('/api/enterprise/assets', session, body, key);
    const replayData = await data(replay);
    const conflict = await post('/api/enterprise/assets', session, { ...body,name:`P6 conflict ${marker}` }, key);
    const conflictData = await data(conflict);
    if (!Number.isInteger(assetId)) throw new Error('AUTHENTICATED_IDEMPOTENCY_ASSET_ID_INVALID');
    const before = sql(container, `select (select count(*) from assets where id=${assetId}),(select count(*) from audit_logs where entity_type='ASSET' and entity_id='${assetId}'),(select count(*) from api_idempotency_keys where idempotency_key='${key}')`);
    const [assetCount,auditCount,keyCount] = before.split(',').map(Number);
    cleanupSql(container, marker, key);
    const after = sql(container, `select (select count(*) from assets where id=${assetId}),(select count(*) from audit_logs where entity_type='ASSET' and entity_id='${assetId}'),(select count(*) from api_idempotency_keys where idempotency_key='${key}')`);
    const [cleanupAssetCount,cleanupAuditCount,cleanupKeyCount] = after.split(',').map(Number);
    const logout = await post('/api/auth/logout', session, {}, `logout-${marker}`);
    session = null;
    const observation = {
      missingCsrfStatus:missingCsrf.status,missingCsrfCode:missingCsrfData.code,
      firstStatus:first.status,assetId,
      replayStatus:replay.status,replayHeader:replay.headers.get('idempotent-replay'),replayAssetId:Number(replayData.asset?.id),
      conflictStatus:conflict.status,conflictCode:conflictData.code,
      assetCount,auditCount,keyCount,cleanupAssetCount,cleanupAuditCount,cleanupKeyCount,
      logoutStatus:logout.status
    };
    const evaluation = evaluateAuthenticatedIdempotency(observation);
    const classification = classifyAuthenticatedIdempotencyEvidence(evaluation, selection.actualProductionGate);
    console.log(JSON.stringify({ checkedAt:new Date().toISOString(),targetKind:selection.targetKind,observation,secretValuesReadOrRecorded:false,...classification }, null, 2));
    if (classification.failures.length) process.exitCode = 1;
  } catch (error) {
    await cleanupAuthenticatedIdempotencyRun({
      cleanupDatabase:container && marker && key ? () => cleanupSql(container, marker, key) : null,
      logout:session?.cookie && session?.token ? () => post('/api/auth/logout', session, {}, `logout-${marker || 'failed'}`) : null
    });
    throw error;
  }
}

executeAuthenticatedIdempotency().catch((error) => {
  const failure = /^AUTHENTICATED_IDEMPOTENCY_[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'AUTHENTICATED_IDEMPOTENCY_EXECUTION_FAILED';
  console.error(JSON.stringify({
    checkedAt:new Date().toISOString(),
    targetKind:selection.targetKind,
    status:'FAIL_AUTHENTICATED_CSRF_IDEMPOTENCY_EXECUTION',
    failures:[failure],
    actualAuthenticatedCsrfIdempotency:'FAIL',
    secretValuesReadOrRecorded:false,
    productionGo:false
  },null,2));
  process.exitCode = 1;
});
