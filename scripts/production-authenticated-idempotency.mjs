import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateRoleCredential } from '../src/operations/production-role-core-smoke.mjs';
import { evaluateAuthenticatedIdempotency } from '../src/operations/production-authenticated-idempotency.mjs';

const require = createRequire(import.meta.url);
const { totp } = require('../src/services/mfa-service');
const TARGET = String(process.env.PRODUCTION_UAT_BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');
const CREDENTIAL_ENV = 'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE';
const CONFIRMATION_ENV = 'PRODUCTION_UAT_WRITE_CONFIRMATION';
const REQUIRED_CONFIRMATION = 'ACK-P6-IDEMPOTENCY-UAT';

function allowedTarget(value) {
  const url = new URL(value);
  return (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname))
    || (url.protocol === 'https:' && url.hostname === 'inventory.safe-link.co.kr');
}

function existingFile(value) {
  if (!value || !existsSync(value)) return false;
  try { return statSync(value).isFile(); } catch { return false; }
}

function cookieFrom(response) { return response.headers.get('set-cookie')?.split(';')[0] || ''; }
async function data(response) { return response.json().catch(() => ({})); }
async function get(path, cookie = '') { return fetch(`${TARGET}${path}`, { redirect:'manual', headers:{ cookie, accept:'application/json' } }); }
async function post(path, session, body, key, includeCsrf = true) {
  const headers = { cookie:session.cookie, 'content-type':'application/json', 'idempotency-key':key };
  if (includeCsrf) headers['x-csrf-token'] = session.token;
  return fetch(`${TARGET}${path}`, { method:'POST', redirect:'manual', headers, body:JSON.stringify(includeCsrf ? { ...body, _csrf:session.token } : body) });
}

function databaseContainer() {
  const result = spawnSync('docker', ['ps','--filter','label=com.docker.compose.project=seowon-inventory-production','--filter','label=com.docker.compose.service=database','--format','{{.ID}}'], { encoding:'utf8',windowsHide:true });
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0 || ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw new Error('Exactly one Production database container is required.');
  return ids[0];
}

function sql(container, statement) {
  const result = spawnSync('docker', ['exec',container,'psql','-U','seowon','-d','seowon_inventory','-At','-F',',','-c',statement], { encoding:'utf8',windowsHide:true });
  if (result.status !== 0) throw new Error('Production evidence SQL failed.');
  return result.stdout.trim();
}

if (!allowedTarget(TARGET)) throw new Error('Authenticated idempotency target is not allowlisted.');
const credentialPresent = existingFile(process.env[CREDENTIAL_ENV]);
const writeConfirmed = process.env[CONFIRMATION_ENV] === REQUIRED_CONFIRMATION;
if (!credentialPresent || !writeConfirmed) {
  console.log(JSON.stringify({
    checkedAt:new Date().toISOString(),
    status:'READY_WAIT_ADMIN_CREDENTIAL_AND_WRITE_CONFIRMATION',
    targetKind:new URL(TARGET).hostname === 'inventory.safe-link.co.kr' ? 'production-https' : 'loopback',
    requiredEnvironment:[CREDENTIAL_ENV,CONFIRMATION_ENV],
    credentialReferencePresent:credentialPresent,
    writeConfirmationPresent:writeConfirmed,
    actualAuthenticatedCsrfIdempotency:'NOT_RUN',
    secretValuesReadOrRecorded:false,
    productionGo:false
  }, null, 2));
  process.exit(0);
}

const credential = JSON.parse(readFileSync(process.env[CREDENTIAL_ENV], 'utf8'));
if (!validateRoleCredential(credential)) throw new Error('ADMIN credential reference contract is invalid.');
const csrfResponse = await get('/api/auth/csrf');
const anonymous = { cookie:cookieFrom(csrfResponse),token:(await data(csrfResponse)).csrfToken };
const passwordResponse = await post('/api/auth/login', anonymous, { email:credential.email,password:credential.password }, `login-${crypto.randomUUID()}`);
const passwordData = await data(passwordResponse);
if (passwordResponse.status !== 202 || passwordData.mfaRequired !== true) throw new Error('ADMIN MFA challenge was not issued.');
const challenge = { cookie:cookieFrom(passwordResponse),token:passwordData.csrfToken };
const mfaResponse = await post('/api/auth/mfa/verify', challenge, { code:totp(credential.totpSecret) }, `mfa-${crypto.randomUUID()}`);
const mfaData = await data(mfaResponse);
if (mfaResponse.status !== 200 || mfaData.user?.role !== 'ADMIN') throw new Error('ADMIN MFA verification failed.');
const session = { cookie:cookieFrom(mfaResponse),token:mfaData.csrfToken };
const referenceResponse = await get('/api/enterprise/reference', session.cookie);
const reference = await data(referenceResponse);
if (referenceResponse.status !== 200) throw new Error('Production reference data is unavailable.');

const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const key = `p6-idem-${marker}`;
const body = {
  organizationId:mfaData.user.organizationId,
  assetTag:`P6-IDEM-${marker}`,
  name:`P6 idempotency ${marker}`,
  departmentId:reference.departments?.[0]?.id || null,
  locationId:reference.locations?.[0]?.id || null,
  categoryId:reference.categories?.[0]?.id || null,
  statusCode:'AVAILABLE'
};
let assetId = null;
const container = databaseContainer();
try {
  const missingCsrf = await post('/api/enterprise/assets', session, body, `p6-csrf-${marker}`, false);
  const missingCsrfData = await data(missingCsrf);
  const first = await post('/api/enterprise/assets', session, body, key);
  const firstData = await data(first);
  assetId = Number(firstData.asset?.id);
  const replay = await post('/api/enterprise/assets', session, body, key);
  const replayData = await data(replay);
  const conflict = await post('/api/enterprise/assets', session, { ...body,name:`P6 conflict ${marker}` }, key);
  const conflictData = await data(conflict);
  if (!Number.isInteger(assetId)) throw new Error('Created asset id is invalid.');
  const before = sql(container, `select (select count(*) from assets where id=${assetId}),(select count(*) from audit_logs where entity_type='ASSET' and entity_id='${assetId}'),(select count(*) from api_idempotency_keys where idempotency_key='${key}')`);
  const [assetCount,auditCount,keyCount] = before.split(',').map(Number);
  sql(container, `begin; delete from api_idempotency_keys where idempotency_key in ('${key}','p6-csrf-${marker}'); delete from asset_status_histories where asset_id=${assetId}; delete from outbox_events where aggregate_type='ASSET' and aggregate_id='${assetId}'; delete from audit_logs where entity_type='ASSET' and entity_id='${assetId}'; delete from assets where id=${assetId}; commit;`);
  const after = sql(container, `select (select count(*) from assets where id=${assetId}),(select count(*) from audit_logs where entity_type='ASSET' and entity_id='${assetId}'),(select count(*) from api_idempotency_keys where idempotency_key='${key}')`);
  const [cleanupAssetCount,cleanupAuditCount,cleanupKeyCount] = after.split(',').map(Number);
  const logout = await post('/api/auth/logout', session, {}, `logout-${marker}`);
  const observation = {
    missingCsrfStatus:missingCsrf.status,missingCsrfCode:missingCsrfData.code,
    firstStatus:first.status,assetId,
    replayStatus:replay.status,replayHeader:replay.headers.get('idempotent-replay'),replayAssetId:Number(replayData.asset?.id),
    conflictStatus:conflict.status,conflictCode:conflictData.code,
    assetCount,auditCount,keyCount,cleanupAssetCount,cleanupAuditCount,cleanupKeyCount,
    logoutStatus:logout.status
  };
  const evaluation = evaluateAuthenticatedIdempotency(observation);
  console.log(JSON.stringify({ checkedAt:new Date().toISOString(),targetKind:new URL(TARGET).hostname === 'inventory.safe-link.co.kr'?'production-https':'loopback',observation,actualAuthenticatedCsrfIdempotency:evaluation.status==='PASS_AUTHENTICATED_CSRF_IDEMPOTENCY'?'PASS':'FAIL',secretValuesReadOrRecorded:false,...evaluation }, null, 2));
  if (evaluation.failures.length) process.exitCode = 1;
} catch (error) {
  if (Number.isInteger(assetId)) {
    try { sql(container, `begin; delete from api_idempotency_keys where idempotency_key in ('${key}','p6-csrf-${marker}'); delete from asset_status_histories where asset_id=${assetId}; delete from outbox_events where aggregate_type='ASSET' and aggregate_id='${assetId}'; delete from audit_logs where entity_type='ASSET' and entity_id='${assetId}'; delete from assets where id=${assetId}; commit;`); } catch {}
  }
  throw error;
}
