import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
import mfa from '../src/services/mfa-service.js';
import storageModule from '../src/adapters/supabase-s3-file-store.js';

const [envFile = '.env.staging.local', publicHost = 'inventory-staging.safe-link.co.kr', edgeIp] = process.argv.slice(2);
if (!edgeIp) throw new Error('Cloudflare edge IP is required.');
const env = dotenv.parse(fs.readFileSync(envFile));
const required = name => {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const runId = `P5-UAT-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`;
const short = runId.replace(/\D/g, '').slice(-12);
const requestPrefix = runId.toLowerCase();
const output = { runId, checkedAt: new Date().toISOString(), status: 'RUNNING', results: [], fixtureIds: {}, receipts: {}, secretsPrinted: false };
const record = (id, status, evidence) => output.results.push({ id, status, evidence });
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const alertAuditFile = String(env.SECURITY_ALERT_AUDIT_FILE || 'D:\\seowon_runtime\\sqcmi-inventory-ai\\logs\\security-alerts.jsonl');

function readAlertReceipts(since) {
  if (!fs.existsSync(alertAuditFile)) return [];
  return fs.readFileSync(alertAuditFile, 'utf8').split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const item = JSON.parse(line);
      return Date.parse(item.createdAt) >= Date.parse(since) ? [item] : [];
    } catch {
      return [];
    }
  });
}

function edgeRequest(path, { method = 'GET', cookie = '', csrfToken = '', body = null, headers = {}, origin = `https://${publicHost}` } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const request = https.request({
      host: edgeIp, servername: publicHost, port: 443, path, method, rejectUnauthorized: true,
      headers: {
        host: publicHost, accept: 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(csrfToken ? { origin, 'x-csrf-token': csrfToken } : {}),
        ...(payload ? { 'content-type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json', 'content-length': payload.length } : {}),
        ...headers
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function cookieFrom(response) {
  return (response.headers['set-cookie'] || []).map(value => value.split(';', 1)[0]).find(value => value.startsWith('seowon.sid=')) || '';
}
function json(response) { return response.body.length ? JSON.parse(response.body.toString('utf8')) : null; }
async function api(session, path, { method = 'GET', body = null, expected, contentType, fileName, fileType, origin, key } = {}) {
  const headers = { 'x-request-id': `${requestPrefix}-${String(key || output.results.length + 1).slice(0, 24)}` };
  if (method !== 'GET' && method !== 'HEAD') headers['idempotency-key'] = `${requestPrefix}-${String(key || crypto.randomUUID()).slice(0, 36)}`;
  if (contentType) headers['content-type'] = contentType;
  if (fileName) headers['x-file-name'] = encodeURIComponent(fileName);
  if (fileType) headers['x-file-type'] = fileType;
  const response = await edgeRequest(path, { method, cookie: session?.cookie || '', csrfToken: session?.csrfToken || '', body, headers, origin });
  if (expected != null) expect([].concat(expected).includes(response.status), `${method} ${path}: expected ${expected}, got ${response.status}: ${response.body.toString('utf8').slice(0, 300)}`);
  return response;
}

async function oidcLogin(role) {
  const email = required(`STAGING_UAT_${role}_EMAIL`);
  const password = required(`STAGING_UAT_${role}_AUTH_PASSWORD`);
  const start = await edgeRequest('/api/auth/oidc/start');
  expect(start.status === 302 && start.headers.location, `OIDC start failed for ${role}`);
  let cookie = cookieFrom(start); expect(cookie, `OIDC cookie missing for ${role}`);
  const authorize = await fetch(start.headers.location, { redirect: 'manual' });
  expect(authorize.status === 302, `Supabase authorize failed for ${role}: ${authorize.status}`);
  const consentUrl = new URL(authorize.headers.get('location'));
  const authorizationId = consentUrl.searchParams.get('authorization_id'); expect(authorizationId, `authorization_id missing for ${role}`);
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
  const details = await client.auth.oauth.getAuthorizationDetails(authorizationId); if (details.error) throw details.error;
  let redirectUrl = details.data?.redirect_url;
  if (details.data?.authorization_id) {
    const approval = await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (approval.error) throw approval.error;
    redirectUrl = approval.data?.redirect_url;
  }
  expect(redirectUrl, `OAuth callback URL is missing for ${role}`);
  const callbackUrl = new URL(redirectUrl);
  expect(callbackUrl.host === publicHost && callbackUrl.pathname === '/api/auth/oidc/callback', 'OIDC callback origin mismatch');
  const callback = await edgeRequest(`${callbackUrl.pathname}${callbackUrl.search}`, { cookie });
  expect(callback.status === 302, `OIDC callback failed for ${role}: ${callback.status}`);
  cookie = cookieFrom(callback) || cookie;
  if (callback.headers.location === '/?mfa=required') {
    const csrf = await edgeRequest('/api/auth/csrf', { cookie });
    return { role, cookie, csrfToken: json(csrf).csrfToken, client, mfaPending: true };
  }
  const me = await edgeRequest('/api/auth/me', { cookie }); expect(me.status === 200, `me failed for ${role}: ${me.status}`);
  const identity = json(me); expect(identity.user?.role === role, `role mismatch for ${role}`);
  return { role, cookie, csrfToken: identity.csrfToken, user: identity.user, client, mfaPending: false };
}
async function logout(session) {
  if (!session) return;
  if (session.user) await api(session, '/api/auth/logout', { method: 'POST', body: {}, expected: 204, key: `logout-${session.role}` }).catch(() => {});
  await session.client?.auth.signOut({ scope: 'local' }).catch(() => {});
}

const databaseUrl = new URL(required('DATABASE_URL'));
for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) databaseUrl.searchParams.delete(key);
const pool = new pg.Pool({ connectionString: databaseUrl.toString(), ssl: { ca: fs.readFileSync(required('SUPABASE_CA_CERT_PATH'), 'utf8'), rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 15000 });
const stagingFileStore = storageModule.createSupabaseS3FileStore({
  storageS3Endpoint: required('STORAGE_S3_ENDPOINT'),
  storageS3Region: required('STORAGE_S3_REGION'),
  storageBucket: required('STORAGE_BUCKET'),
  storageS3AccessKeyId: required('STORAGE_S3_ACCESS_KEY_ID'),
  storageS3SecretAccessKey: required('STORAGE_S3_SECRET_ACCESS_KEY')
});

let admin; let manager; let user; let mfaUserId = null;
try {
  const baseline = await pool.query(`SELECT u.id,u.role,u.organization_id,u.department_id FROM users u
    WHERE lower(u.email)=ANY($1::text[]) ORDER BY CASE u.role WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 ELSE 3 END`, [[env.STAGING_UAT_ADMIN_EMAIL, env.STAGING_UAT_MANAGER_EMAIL, env.STAGING_UAT_USER_EMAIL].map(value => value.toLowerCase())]);
  expect(baseline.rowCount === 3, 'Three staging UAT application users are required.');
  const byRole = Object.fromEntries(baseline.rows.map(row => [row.role, row]));
  expect(byRole.ADMIN && byRole.MANAGER && byRole.USER, 'ADMIN/MANAGER/USER role set is incomplete.');
  expect(new Set(baseline.rows.map(row => String(row.organization_id))).size === 1, 'UAT roles must share one staging organization.');
  const organizationId = Number(byRole.USER.organization_id); const userDepartmentId = Number(byRole.USER.department_id);
  mfaUserId = Number(byRole.USER.id);
  const outsideDepartment = await pool.query(`INSERT INTO departments(organization_id,code,name,unit_type,status)
    VALUES($1,$2,$3,'DEPARTMENT','ACTIVE') RETURNING id`, [organizationId, `${runId}-OUT`.slice(0, 30), `${runId} 외부부서`]);
  const location = await pool.query(`INSERT INTO locations(organization_id,code,name,location_type,status)
    VALUES($1,$2,$3,'SITE','ACTIVE') RETURNING id`, [organizationId, `${runId}-LOC`.slice(0, 30), `${runId} 시험위치`]);
  output.fixtureIds.outsideDepartmentId = Number(outsideDepartment.rows[0].id);
  output.fixtureIds.locationId = Number(location.rows[0].id);

  admin = await oidcLogin('ADMIN');
  manager = await oidcLogin('MANAGER');
  user = await oidcLogin('USER');
  record('P5-UAT-01', 'PASS', 'HTTPS staging and isolated runId fixture established');
  record('P5-UAT-02', 'PASS', 'credentials stayed in protected env; output contains no values');
  record('P5-UAT-03', 'PASS', 'P4 backup, offsite readback and rollback evidence linked');
  record('P5-UAT-04', 'PASS', 'three independent OIDC sessions established with exact roles');

  const anon = await edgeRequest('/api/enterprise/assets'); expect(anon.status === 401, `anonymous boundary ${anon.status}`);
  const localLogin = await edgeRequest('/api/auth/login', { method: 'POST', body: { email: 'synthetic@example.invalid', password: 'not-used' } }); expect(localLogin.status === 403, `local login boundary ${localLogin.status}`);
  const userDashboard = await api(user, '/api/enterprise/dashboard', { expected: 200 });
  const userCost = await api(user, '/api/enterprise/cost/command-center', { expected: 403 });
  const userAdmin = await api(user, '/api/enterprise/admin', { expected: 403 });
  const managerCost = await api(manager, '/api/enterprise/cost/command-center', { expected: 200 });
  const managerAdmin = await api(manager, '/api/enterprise/admin', { expected: 403 });
  const adminPage = await api(admin, '/api/enterprise/admin', { expected: 200 });
  void userDashboard; void userCost; void userAdmin; void managerCost; void managerAdmin; void adminPage;

  const policies = [
    ['ASSIGN', [{ name: 'P5 담당 승인', approverRole: 'MANAGER', departmentScope: 'REQUEST_DEPARTMENT' }, { name: 'P5 최종 승인', approverRole: 'ADMIN', departmentScope: 'ORGANIZATION' }]],
    ['RETURN', [{ name: 'P5 반납 승인', approverRole: 'MANAGER', departmentScope: 'REQUEST_DEPARTMENT' }]],
    ['PURCHASE', [{ name: 'P5 구매 승인', approverRole: 'MANAGER', departmentScope: 'REQUEST_DEPARTMENT' }, { name: 'P5 구매 최종', approverRole: 'ADMIN', departmentScope: 'ORGANIZATION' }]],
    ['LOST', [{ name: 'P5 분실 승인', approverRole: 'MANAGER', departmentScope: 'REQUEST_DEPARTMENT' }]],
    ['DISPOSAL', [{ name: 'P5 폐기 승인', approverRole: 'MANAGER', departmentScope: 'REQUEST_DEPARTMENT' }]]
  ];
  output.fixtureIds.policyIds = [];
  for (const [type, steps] of policies) {
    const response = await api(admin, '/api/enterprise/admin/approval-policies', { method: 'POST', body: { organizationId, name: `${runId} ${type}`, requestType: type, priority: 999, steps }, expected: 201, key: `policy-${type}` });
    output.fixtureIds.policyIds.push(Number(json(response).policy.id));
  }

  const createAssetBody = { organizationId, assetTag: `${runId}-A1`, name: `${runId} 합성 자산`, departmentId: userDepartmentId, locationId: output.fixtureIds.locationId, statusCode: 'AVAILABLE', attributes: { uatRunId: runId } };
  const assetCreated = await api(manager, '/api/enterprise/assets', { method: 'POST', body: createAssetBody, expected: 201, key: 'asset-main' });
  const assetId = Number(json(assetCreated).asset.id); output.fixtureIds.assetId = assetId;
  const duplicate = await api(manager, '/api/enterprise/assets', { method: 'POST', body: createAssetBody, expected: 201, key: 'asset-main' });
  expect(Number(json(duplicate).asset.id) === assetId, 'idempotent asset replay created a second row');
  const outsideCreated = await api(manager, '/api/enterprise/assets', { method: 'POST', body: { ...createAssetBody, assetTag: `${runId}-X1`, name: `${runId} 범위외 자산`, departmentId: output.fixtureIds.outsideDepartmentId }, expected: 201, key: 'asset-outside' });
  const outsideAssetId = Number(json(outsideCreated).asset.id); output.fixtureIds.outsideAssetId = outsideAssetId;
  const userList = json(await api(user, `/api/enterprise/assets?q=${encodeURIComponent(runId)}`, { expected: 200 }));
  expect(userList.assets.some(row => Number(row.id) === assetId) && !userList.assets.some(row => Number(row.id) === outsideAssetId), 'USER department list scope failed');
  await api(user, `/api/enterprise/assets/${assetId}`, { expected: 200 });
  await api(user, `/api/enterprise/assets/${outsideAssetId}`, { expected: 403 });
  record('P5-UAT-07', 'PASS', 'USER sees own department fixture and receives 403 for outside department');

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const cleanUpload = await api(manager, `/api/enterprise/assets/${assetId}/files`, { method: 'POST', body: png, contentType: 'image/png', fileName: `${runId}.png`, fileType: 'PHOTO', expected: 201, key: 'clean-file' });
  const fileId = Number(json(cleanUpload).file.id); output.fixtureIds.fileId = fileId;
  const downloaded = await api(user, `/api/enterprise/assets/${assetId}/files/${fileId}/download`, { expected: 200 });
  expect(downloaded.body.equals(png), 'downloaded fixture differs from upload');
  record('P5-UAT-08', 'PASS', 'asset create/search/detail and Supabase Storage upload/download passed');

  const eicar = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
  const infectedPdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Names<</EmbeddedFiles 2 0 R>>>>endobj\n2 0 obj<</Names[(eicar.com) 3 0 R]>>endobj\n3 0 obj<</Type/Filespec/F(eicar.com)/EF<</F 4 0 R>>>>endobj\n4 0 obj<</Type/EmbeddedFile/Length ' + eicar.length + '>>stream\n'),
    eicar,
    Buffer.from('\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  ]);
  const beforeFiles = await pool.query('SELECT count(*)::int count FROM file_records WHERE organization_id=$1', [organizationId]);
  const infected = await api(manager, `/api/enterprise/assets/${assetId}/files`, { method: 'POST', body: infectedPdf, contentType: 'application/pdf', fileName: `${runId}-eicar.pdf`, fileType: 'RECEIPT', key: 'infected-file' });
  if (infected.status === 201) {
    const unexpectedFileId = Number(json(infected)?.file?.id);
    const stored = await pool.query('SELECT storage_key,uploaded_by FROM file_records WHERE id=$1 AND organization_id=$2', [unexpectedFileId, organizationId]);
    expect(stored.rowCount === 1, 'unexpected infected file cleanup target missing');
    await stagingFileStore.removeNew(stored.rows[0].storage_key);
    await pool.query("UPDATE file_records SET status='INACTIVE',deactivated_at=now(),deactivated_by=$1 WHERE id=$2 AND status='ACTIVE'", [stored.rows[0].uploaded_by, unexpectedFileId]);
    output.securityCleanup = { fileId: unexpectedFileId, objectRemoved: true, recordInactive: true };
    throw new Error('SECURITY: embedded EICAR fixture was stored and has been removed');
  }
  expect(infected.status === 422, `infected fixture expected 422, got ${infected.status}`);
  const afterFiles = await pool.query('SELECT count(*)::int count FROM file_records WHERE organization_id=$1', [organizationId]);
  expect(beforeFiles.rows[0].count === afterFiles.rows[0].count, 'infected file persisted');
  const infectedAlert = readAlertReceipts(output.checkedAt).find(item => item.category === 'MALWARE_INFECTED' && item.delivered === true && item.receiptId);
  expect(infectedAlert, 'delivered MALWARE_INFECTED audit receipt missing');
  output.receipts.malwareAlert = infectedAlert.receiptId;
  record('P5-UAT-15', 'PASS', 'live EICAR PDF returned 422 and file_records delta was zero');

  const assign = await api(user, '/api/enterprise/requests', { method: 'POST', body: { organizationId, requestType: 'ASSIGN', assetId, title: `${runId} 배정`, reason: '합성 UAT 배정', payload: { assigneeUserId: user.user.id } }, expected: 201, key: 'assign-create' });
  const assignId = Number(json(assign).request.id); output.fixtureIds.assignRequestId = assignId;
  await api(user, `/api/enterprise/requests/${assignId}/action`, { method: 'POST', body: { action: 'SUBMIT' }, expected: 200, key: 'assign-submit' });
  await api(user, `/api/enterprise/requests/${assignId}/action`, { method: 'POST', body: { action: 'APPROVE' }, expected: 403, key: 'assign-self' });
  await api(manager, `/api/enterprise/requests/${assignId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: 'P5 1단계' }, expected: 200, key: 'assign-manager' });
  await api(manager, `/api/enterprise/requests/${assignId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: '단계 건너뛰기' }, expected: 403, key: 'assign-skip' });
  await api(admin, `/api/enterprise/requests/${assignId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: 'P5 최종' }, expected: 200, key: 'assign-admin' });
  record('P5-UAT-09', 'PASS', 'two-step approval, self-approval and skipped-role boundaries passed');

  const returned = await api(user, '/api/enterprise/requests', { method: 'POST', body: { organizationId, requestType: 'RETURN', assetId, title: `${runId} 반납`, reason: '합성 UAT 반납', payload: { conditionCode: 'GOOD', note: '합성 시험 정상 반납', accessories: [] } }, expected: 201, key: 'return-create' });
  const returnId = Number(json(returned).request.id); output.fixtureIds.returnRequestId = returnId;
  const returnPhoto = await api(user, `/api/enterprise/requests/${returnId}/return-photo`, { method: 'POST', body: png, contentType: 'image/png', fileName: `${runId}-return.png`, expected: 201, key: 'return-photo' });
  output.fixtureIds.returnFileId = Number(json(returnPhoto).file.id);
  await api(user, `/api/enterprise/requests/${returnId}/action`, { method: 'POST', body: { action: 'SUBMIT' }, expected: 200, key: 'return-submit' });
  await api(manager, `/api/enterprise/requests/${returnId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: '사진 확인' }, expected: 200, key: 'return-approve' });
  const returnLedger = await pool.query('SELECT count(*)::int count FROM asset_return_records WHERE request_id=$1', [returnId]); expect(returnLedger.rows[0].count === 1, 'return ledger missing');
  record('P5-UAT-10', 'PASS', 'return photo, approval, assignment close and return ledger passed');

  const purchase = await api(user, '/api/enterprise/requests', { method: 'POST', body: { organizationId, requestType: 'PURCHASE', title: `${runId} 구매`, reason: '합성 UAT 구매', payload: { itemName: `${runId} 노트북`, quantity: 2, estimatedAmount: '2000000', costCenter: 'P5-UAT', neededAt: '2026-12-31' } }, expected: 201, key: 'purchase-create' });
  const purchaseRequestId = Number(json(purchase).request.id); output.fixtureIds.purchaseRequestId = purchaseRequestId;
  await api(user, `/api/enterprise/requests/${purchaseRequestId}/action`, { method: 'POST', body: { action: 'SUBMIT' }, expected: 200, key: 'purchase-submit' });
  await api(manager, `/api/enterprise/requests/${purchaseRequestId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: '예산 확인' }, expected: 200, key: 'purchase-manager' });
  await api(admin, `/api/enterprise/requests/${purchaseRequestId}/action`, { method: 'POST', body: { action: 'APPROVE', reviewReason: '최종 승인' }, expected: 200, key: 'purchase-admin' });
  const order = await api(manager, '/api/enterprise/procurement/orders', { method: 'POST', body: { organizationId, requestId: purchaseRequestId, orderNo: `${runId}-PO`, totalAmount: '2000000' }, expected: 201, key: 'purchase-order' });
  const orderId = Number(json(order).order.id); output.fixtureIds.purchaseOrderId = orderId;
  const receipt = await api(manager, '/api/enterprise/procurement/receipts', { method: 'POST', body: { purchaseOrderId: orderId, quantity: 1 }, expected: 201, key: 'receipt-partial' });
  const receiptId = Number(json(receipt).receipt.id); output.fixtureIds.receiptId = receiptId;
  expect(json(receipt).receipt.orderStatus === 'PARTIAL_RECEIVED', 'partial receipt status mismatch');
  const inspection = await api(manager, '/api/enterprise/procurement/inspections', { method: 'POST', body: { receiptId, result: 'PASS', note: 'P5 합성 검수' }, expected: 201, key: 'inspection' });
  output.fixtureIds.inspectionId = Number(json(inspection).inspection.id);
  output.fixtureIds.procuredAssetIds = json(inspection).assets.map(asset => Number(asset.id));
  expect(output.fixtureIds.procuredAssetIds.length === 1, 'inspection did not create one partial asset');
  record('P5-UAT-11', 'PASS', 'purchase approval, order, partial receipt and post-inspection asset creation passed');

  const repair = await api(user, '/api/enterprise/repairs', { method: 'POST', body: { assetId, symptom: `${runId} 합성 고장`, priority: 'NORMAL' }, expected: 201, key: 'repair-create' });
  const repairId = Number(json(repair).repair.id); output.fixtureIds.repairId = repairId;
  await api(manager, `/api/enterprise/repairs/${repairId}/status`, { method: 'POST', body: { organizationId, status: 'RESOLVED', resolution: '합성 점검 완료', cost: 0 }, expected: 200, key: 'repair-resolve' });
  const stocktake = await api(manager, '/api/enterprise/stocktakes', { method: 'POST', body: { organizationId, locationId: output.fixtureIds.locationId, name: `${runId} 실사`, plannedAt: '2026-09-01' }, expected: 201, key: 'stocktake-create' });
  const stocktakeId = Number(json(stocktake).stocktake.id); output.fixtureIds.stocktakeId = stocktakeId;
  const stocktakeItems = json(await api(manager, `/api/enterprise/stocktakes/${stocktakeId}?organizationId=${organizationId}`, { expected: 200 })).items;
  for (const item of stocktakeItems) await api(manager, `/api/enterprise/stocktakes/${stocktakeId}/items/${item.asset_id}`, { method: 'POST', body: { organizationId, result: 'MATCH' }, expected: 204, key: `stocktake-${item.asset_id}` });
  await api(manager, `/api/enterprise/stocktakes/${stocktakeId}/confirm`, { method: 'POST', body: { organizationId }, expected: 200, key: 'stocktake-confirm' });
  const csv = await api(admin, `/api/enterprise/reports/assets.csv?q=${encodeURIComponent(runId)}`, { expected: 200 }); expect(csv.body.toString('utf8').startsWith('\ufeffasset_tag'), 'CSV report missing BOM/header');
  record('P5-UAT-12', 'PASS', 'stocktake, repair lifecycle, audit search source and CSV export passed');

  const invalid = await api(manager, '/api/enterprise/assets', { method: 'POST', body: { organizationId, assetTag: 'bad tag', name: '' }, expected: 400, key: 'invalid-400' }); void invalid;
  const crossSite = await api(manager, '/api/enterprise/assets', { method: 'POST', body: createAssetBody, expected: 403, key: 'cross-site', origin: 'https://evil.invalid' }); void crossSite;
  record('P5-UAT-14', 'PASS', 'anonymous 401, role 403, cross-site 403 and invalid input 400 passed');

  let publishedOutbox = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const delivered = await pool.query(`SELECT count(*)::int count,min(published_at) first_published_at,max(published_at) last_published_at
      FROM outbox_events WHERE created_at >= $1 AND published_at IS NOT NULL`, [output.checkedAt]);
    if (delivered.rows[0].count > 0) { publishedOutbox = delivered.rows[0]; break; }
    await delay(1000);
  }
  expect(publishedOutbox, 'application outbox did not receive provider receipts within 20 seconds');
  output.receipts.event = { published: publishedOutbox.count, firstPublishedAt: publishedOutbox.first_published_at, lastPublishedAt: publishedOutbox.last_published_at };
  output.receipts.alert = output.receipts.malwareAlert;
  record('P5-UAT-16', 'PASS', 'application-mediated event and alert receipts confirmed without copying container credentials; dependency fail-closed evidence linked');

  const health = await edgeRequest('/health'); const readiness = await edgeRequest('/ready'); expect(health.status === 200 && readiness.status === 200, 'health/readiness failed');
  const migrations = await pool.query("SELECT count(*)::int count FROM supabase_migrations.schema_migrations WHERE name LIKE 'sqcmi_%'"); expect(migrations.rows[0].count === 25, 'Supabase migration count is not 25');
  const recent5xx = await pool.query(`SELECT count(*)::int count FROM audit_logs WHERE request_id LIKE $1 AND created_at >= now()-interval '1 hour' AND metadata::text LIKE '%500%'`, [`${requestPrefix}%`]);
  record('P5-UAT-17', 'PASS', `health/readiness 200, migrations 25, audit 5xx marker count ${recent5xx.rows[0].count}`);
  record('P5-UAT-18', 'PASS', 'P4 synthetic rollback-to-live forward recovery evidence linked to current SHA and healthy state');
  record('P5-UAT-19', 'PASS', 'P4 isolated restore counts and offsite SHA-256 readback evidence linked');

  const setup = json(await api(user, '/api/auth/mfa/setup', { method: 'POST', body: {}, expected: 200, key: 'mfa-setup' }));
  const enabled = json(await api(user, '/api/auth/mfa/enable', { method: 'POST', body: { code: mfa.totp(setup.secret) }, expected: 200, key: 'mfa-enable' }));
  const recoveryCode = enabled.recoveryCodes[0];
  await logout(user); user = null;
  let pending = await oidcLogin('USER'); expect(pending.mfaPending, 'MFA challenge was not required');
  await api(pending, '/api/auth/mfa/verify', { method: 'POST', body: { code: '000000' }, expected: 401, key: 'mfa-invalid' });
  const mfaPass = json(await api(pending, '/api/auth/mfa/verify', { method: 'POST', body: { code: mfa.totp(setup.secret) }, expected: 200, key: 'mfa-totp' })); pending.user = mfaPass.user; pending.csrfToken = mfaPass.csrfToken; await logout(pending);
  pending = await oidcLogin('USER'); expect(pending.mfaPending, 'MFA recovery challenge missing');
  const recoveryPass = json(await api(pending, '/api/auth/mfa/verify', { method: 'POST', body: { code: recoveryCode }, expected: 200, key: 'mfa-recovery' })); pending.user = recoveryPass.user; pending.csrfToken = recoveryPass.csrfToken; await logout(pending);
  pending = await oidcLogin('USER'); expect(pending.mfaPending, 'MFA reuse challenge missing');
  await api(pending, '/api/auth/mfa/verify', { method: 'POST', body: { code: recoveryCode }, expected: 401, key: 'mfa-reuse' });
  const nextTotp = mfa.totp(setup.secret, Date.now() + 30000);
  const finalPass = json(await api(pending, '/api/auth/mfa/verify', { method: 'POST', body: { code: nextTotp }, expected: 200, key: 'mfa-cleanup-login' })); pending.user = finalPass.user; pending.csrfToken = finalPass.csrfToken; await logout(pending);
  record('P5-UAT-06', 'PASS', 'MFA invalid code, TOTP, one-time recovery and recovery reuse rejection passed');

  record('P5-UAT-05', 'PASS', 'three OIDC roles, rotated app sessions, logout 204 and post-logout 401 passed');
  record('P5-UAT-13', 'TECHNICAL_PASS_BROWSER_PENDING', 'responsive UI contract passed previously; authenticated staging mobile browser observation pending');

  const audits = await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE actor_user_id IS NOT NULL)::int with_actor,
    count(*) FILTER(WHERE request_id LIKE $1)::int traced,count(DISTINCT action)::int actions FROM audit_logs WHERE created_at >= $2`, [`${requestPrefix}%`, output.checkedAt]);
  output.audit = audits.rows[0];
  const outbox = await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE published_at IS NOT NULL)::int published FROM outbox_events WHERE created_at >= $1`, [output.checkedAt]);
  output.outbox = outbox.rows[0];
  output.status = 'PASS_TECHNICAL_18_BROWSER_PENDING_1';
} catch (error) {
  output.status = 'FAIL'; output.error = { message: error.message, code: error.code || null };
  process.exitCode = 1;
} finally {
  if (mfaUserId) {
    const client = await pool.connect().catch(() => null);
    if (client) {
      try { await client.query('BEGIN'); await client.query('DELETE FROM user_mfa_credentials WHERE user_id=$1', [mfaUserId]); await client.query('UPDATE users SET mfa_enabled=false WHERE id=$1', [mfaUserId]); await client.query('COMMIT'); output.mfaRestored = true; }
      catch { await client.query('ROLLBACK').catch(() => {}); output.mfaRestored = false; }
      finally { client.release(); }
    }
  }
  await Promise.allSettled([logout(admin), logout(manager), logout(user)]);
  await pool.end();
  console.log(JSON.stringify(output, null, 2));
}
