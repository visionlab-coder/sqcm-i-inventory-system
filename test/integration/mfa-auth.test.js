const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createPool } = require('../../src/db');
const { getConfig } = require('../../src/config');
const { totp } = require('../../src/services/mfa-service');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const config = getConfig();
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];

async function csrf() {
  const response = await fetch(`${baseUrl}/api/auth/csrf`);
  return { cookie: cookieFrom(response), token: (await response.json()).csrfToken };
}

async function post(path, session, body, requestId) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', redirect: 'manual', headers: { cookie: session.cookie, 'content-type': 'application/json', 'x-request-id': requestId }, body: JSON.stringify({ ...body, _csrf: session.token }) });
}

async function passwordLogin(email, password, requestId) {
  const anonymous = await csrf();
  const response = await post('/api/auth/login', anonymous, { email, password }, requestId);
  const data = await response.json();
  return { response, data, session: { cookie: cookieFrom(response), token: data.csrfToken } };
}

test('TOTP MFA는 pending challenge 뒤에만 세션을 발급하고 복구코드를 단회 사용한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl); const marker = `mfa-${Date.now()}`; const email = `${marker}@seowon.local`;
  const password = 'Phase24-Mfa-Test!'; let userId;
  try {
    const org = await pool.query("SELECT id FROM organizations WHERE code='SEOWON'");
    const dept = await pool.query("SELECT id FROM departments WHERE organization_id=$1 ORDER BY id LIMIT 1", [org.rows[0].id]);
    const created = await pool.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id,department_id)
      VALUES($1,'Phase24 MFA 사용자',$2,'USER','ACTIVE',$3,$4) RETURNING id`, [email, await bcrypt.hash(password, 12), org.rows[0].id, dept.rows[0].id]);
    userId = created.rows[0].id;

    const first = await passwordLogin(email, password, marker); assert.equal(first.response.status, 200);
    let response = await post('/api/auth/reauth', first.session, { password }, marker); assert.equal(response.status, 204);
    response = await post('/api/auth/mfa/setup', first.session, {}, marker); assert.equal(response.status, 200);
    const setup = await response.json(); assert.match(setup.secret, /^[A-Z2-7]+$/); assert.match(setup.otpauthUri, /^otpauth:\/\/totp\//);
    response = await post('/api/auth/mfa/enable', first.session, { code: totp(setup.secret) }, marker); assert.equal(response.status, 200);
    const enabled = await response.json(); assert.equal(enabled.recoveryCodes.length, 8);
    response = await post('/api/auth/logout', first.session, {}, marker); assert.equal(response.status, 204);

    const challenged = await passwordLogin(email, password, marker); assert.equal(challenged.response.status, 202); assert.equal(challenged.data.mfaRequired, true); assert.equal(challenged.data.user, undefined);
    response = await post('/api/auth/mfa/verify', challenged.session, { code: '000000' }, marker); assert.equal(response.status, 401);
    response = await post('/api/auth/mfa/verify', challenged.session, { code: totp(setup.secret) }, marker); assert.equal(response.status, 200);
    const verified = await response.json(); const authenticated = { cookie: cookieFrom(response), token: verified.csrfToken };
    response = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: authenticated.cookie } }); assert.equal(response.status, 200);
    response = await post('/api/auth/logout', authenticated, {}, marker); assert.equal(response.status, 204);

    const recoveryChallenge = await passwordLogin(email, password, marker); assert.equal(recoveryChallenge.response.status, 202);
    response = await post('/api/auth/mfa/verify', recoveryChallenge.session, { code: enabled.recoveryCodes[0] }, marker); assert.equal(response.status, 200);
    const recoveryVerified = await response.json(); const recoverySession = { cookie: cookieFrom(response), token: recoveryVerified.csrfToken };
    response = await post('/api/auth/logout', recoverySession, {}, marker); assert.equal(response.status, 204);
    const replayChallenge = await passwordLogin(email, password, marker); response = await post('/api/auth/mfa/verify', replayChallenge.session, { code: enabled.recoveryCodes[0] }, marker); assert.equal(response.status, 401);

    const audits = await pool.query("SELECT action FROM audit_logs WHERE actor_user_id=$1 AND request_id=$2", [userId, marker]);
    for (const action of ['MFA_SETUP_STARTED','MFA_ENABLED','MFA_CHALLENGE_ISSUED','MFA_VERIFICATION_SUCCEEDED','MFA_VERIFICATION_FAILED']) assert.ok(audits.rows.some(row => row.action === action));
    const stored = await pool.query('SELECT encrypted_secret,recovery_code_hashes FROM user_mfa_credentials WHERE user_id=$1', [userId]);
    assert.equal(stored.rows[0].encrypted_secret.includes(setup.secret), false); assert.equal(stored.rows[0].recovery_code_hashes.includes(enabled.recoveryCodes[0]), false);
  } finally {
    if (userId) {
      await pool.query("DELETE FROM user_sessions WHERE (sess->>'userId')::bigint=$1 OR (sess->>'pendingMfaUserId')::bigint=$1", [userId]);
      await pool.query('DELETE FROM audit_logs WHERE actor_user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    await pool.end();
  }
});
