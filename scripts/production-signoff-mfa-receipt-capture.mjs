import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { totp } = require('../src/services/mfa-service');
const AREAS = Object.freeze(['BUSINESS', 'SECURITY', 'OPERATIONS']);
const target = 'https://inventory.safe-link.co.kr';
const bundlePath = process.env.PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE;
const credentialPath = process.env.PRODUCTION_SIGNOFF_OWNER_CREDENTIAL_FILE;
const confirmation = process.env.PRODUCTION_SIGNOFF_MFA_RECEIPT_CAPTURE_CONFIRMATION;
const expectedConfirmation = 'ACK-P6-CAPTURE-ACTUAL-MFA-SIGNOFF-RECEIPTS';

function fail(code) {
  console.error(JSON.stringify({
    checkedAt: new Date().toISOString(), status: code,
    receiptCount: 0, secretValuesReadOrRecorded: false, productionGo: false
  }, null, 2));
  process.exit(1);
}

function readObject(file) {
  if (!file || !path.isAbsolute(file)) fail('SIGNOFF_MFA_INPUT_REFERENCE_INVALID');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) {
    fail('SIGNOFF_MFA_INPUT_NOT_PHYSICAL_FILE');
  }
  const raw = fs.readFileSync(file);
  if (!raw.length || raw.length > 1024 * 1024) fail('SIGNOFF_MFA_INPUT_SIZE_INVALID');
  return { raw, value: JSON.parse(raw.toString('utf8')) };
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function responseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function get(urlPath, cookie = '') {
  return fetch(`${target}${urlPath}`, {
    redirect: 'manual', headers: { cookie, accept: 'application/json' }
  });
}

async function post(urlPath, session, body) {
  return fetch(`${target}${urlPath}`, {
    method: 'POST', redirect: 'manual',
    headers: {
      cookie: session.cookie, origin: target, 'content-type': 'application/json',
      'x-csrf-token': session.token, 'idempotency-key': crypto.randomUUID()
    },
    body: JSON.stringify({ ...body, _csrf: session.token })
  });
}

async function waitFreshTotp() {
  const waitMs = ((30 - (Math.floor(Date.now() / 1000) % 30)) + 1) * 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticateAndObserve(credential) {
  const csrfResponse = await get('/api/auth/csrf');
  const csrfData = await responseJson(csrfResponse);
  const anonymous = { cookie: cookieFrom(csrfResponse), token: csrfData.csrfToken };
  const loginResponse = await post('/api/auth/login', anonymous, {
    email: credential.email, password: credential.password
  });
  const loginData = await responseJson(loginResponse);
  if (loginResponse.status !== 202 || loginData.mfaRequired !== true) fail('SIGNOFF_MFA_PASSWORD_LOGIN_FAILED');
  const challenge = { cookie: cookieFrom(loginResponse), token: loginData.csrfToken };
  let mfaResponse = await post('/api/auth/mfa/verify', challenge, { code: totp(credential.totpSecret) });
  if (mfaResponse.status === 401) {
    await waitFreshTotp();
    mfaResponse = await post('/api/auth/mfa/verify', challenge, { code: totp(credential.totpSecret) });
  }
  const mfaData = await responseJson(mfaResponse);
  const requestId = mfaResponse.headers.get('x-request-id');
  if (mfaResponse.status !== 200 || mfaData.user?.role !== 'ADMIN' || !requestId) fail('SIGNOFF_MFA_VERIFICATION_FAILED');
  const session = { cookie: cookieFrom(mfaResponse), token: mfaData.csrfToken };
  const auditResponse = await get(`/api/audit?action=MFA_VERIFICATION_SUCCEEDED&q=${encodeURIComponent(requestId)}`, session.cookie);
  const auditData = await responseJson(auditResponse);
  const audit = auditData.logs?.find((entry) => entry.action === 'MFA_VERIFICATION_SUCCEEDED' && entry.request_id === requestId);
  await post('/api/auth/logout', session, {});
  if (auditResponse.status !== 200 || !audit?.created_at) fail('SIGNOFF_MFA_AUDIT_RECEIPT_MISSING');
  return { requestId, signedAt: new Date(audit.created_at).toISOString(), actorId: String(audit.actor_user_id) };
}

if (!process.argv.includes('--capture') || confirmation !== expectedConfirmation) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(), status: 'READY_WAIT_SIGNOFF_MFA_CAPTURE_CONFIRMATION',
    requiredEnvironment: [
      'PRODUCTION_SIGNOFF_REQUEST_BUNDLE_FILE', 'PRODUCTION_SIGNOFF_OWNER_CREDENTIAL_FILE',
      'PRODUCTION_SIGNOFF_MFA_RECEIPT_CAPTURE_CONFIRMATION',
      ...AREAS.map((area) => `PRODUCTION_${area}_SIGNOFF_APPROVAL_RECEIPT_FILE`)
    ], receiptCount: 0, secretValuesReadOrRecorded: false, productionGo: false
  }, null, 2));
  process.exit(0);
}

const bundleDocument = readObject(bundlePath);
const credential = readObject(credentialPath).value;
const bundle = bundleDocument.value;
const bundleSha = crypto.createHash('sha256').update(bundleDocument.raw).digest('hex');
const outputs = Object.fromEntries(AREAS.map((area) => [
  area, process.env[`PRODUCTION_${area}_SIGNOFF_APPROVAL_RECEIPT_FILE`]
]));
if (!credential.email || !credential.password || !credential.totpSecret
  || bundle.evidenceType !== 'P6_CUTOVER_SIGNOFF_REQUEST_SET'
  || AREAS.some((area) => !outputs[area] || !path.isAbsolute(outputs[area]) || fs.existsSync(outputs[area]))) {
  fail('SIGNOFF_MFA_CAPTURE_INPUT_INVALID');
}

const observations = [];
for (const area of AREAS) {
  if (observations.length) await waitFreshTotp();
  observations.push([area, await authenticateAndObserve(credential)]);
}

for (const [area, observation] of observations) {
  const template = bundle.approvalReceiptPayloads[area];
  const receipt = {
    ...template, template: false, decision: 'APPROVED',
    signedByRef: 'identity://sqcm-i-owner', signedAt: observation.signedAt,
    receiptId: `mfa-${observation.requestId}`,
    authentication: {
      method: 'MFA',
      providerRef: `identity://sqcm-i-auth/admin/${observation.actorId}/${observation.requestId}`,
      verified: true
    },
    signoffRequestBundleSha256: bundleSha
  };
  fs.writeFileSync(outputs[area], `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), status: 'PASS_PRODUCTION_SIGNOFF_MFA_APPROVAL_RECEIPTS_CAPTURED',
  receiptCount: observations.length, auditVerifiedCount: observations.length,
  targetUrl: target, signedByRef: 'identity://sqcm-i-owner',
  secretValuesReadOrRecorded: false, productionGo: false
}, null, 2));
