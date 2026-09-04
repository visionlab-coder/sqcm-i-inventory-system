const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPool } = require('../../src/db');
const { getConfig } = require('../../src/config');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const integrationConfig = getConfig();

const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
const sessionIdFromCookie = cookie => decodeURIComponent(String(cookie || '').split('=', 2)[1] || '')
  .replace(/^s:/, '').split('.')[0] || null;

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: 'manual' });
  assert.equal(csrfResponse.status, 200);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  const anonymousCookie = cookieFrom(csrfResponse);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { cookie: anonymousCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ _csrf: csrfToken, email, password }),
    redirect: 'manual'
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const cookie = cookieFrom(response);
  return { cookie, sessionId: sessionIdFromCookie(cookie), csrfToken: data.csrfToken, user: data.user };
}

async function sync(stocktakeId, session, operations) {
  return fetch(`${baseUrl}/api/enterprise/stocktakes/${stocktakeId}/offline-sync`, {
    method: 'POST',
    headers: { cookie: session.cookie, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: session.user.organizationId, operations, _csrf: session.csrfToken }),
    redirect: 'manual'
  });
}

test('오프라인 실사 동기화는 적용·재전송·충돌을 구분하고 한 번만 기록한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  const marker = crypto.randomUUID();
  let manager;
  let assetId;
  let stocktakeId;
  try {
    manager = await login('manager@seowon.local', integrationConfig.seedManagerPassword);
    const actorId = Number(manager.user.id);
    const organizationId = Number(manager.user.organizationId);
    const department = await pool.query('SELECT id FROM departments WHERE organization_id=$1 AND status=$2 ORDER BY id LIMIT 1', [organizationId, 'ACTIVE']);
    const asset = await pool.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,created_by)
      VALUES($1,$2,$3,'AVAILABLE',$4,$5) RETURNING id`, [organizationId, `OFF-${marker}`, `오프라인 실사 ${marker}`, department.rows[0]?.id || null, actorId]);
    assetId = Number(asset.rows[0].id);
    const stocktake = await pool.query(`INSERT INTO stocktakes(organization_id,name,status,planned_at,created_by)
      VALUES($1,$2,'IN_PROGRESS',now(),$3) RETURNING id`, [organizationId, `오프라인 동기화 ${marker}`, actorId]);
    stocktakeId = Number(stocktake.rows[0].id);
    await pool.query('INSERT INTO stocktake_items(stocktake_id,asset_id) VALUES($1,$2)', [stocktakeId, assetId]);

    const operationId = crypto.randomUUID();
    const payload = { operationId, assetId, baseVersion: 0, result: 'MATCH', foundLocationId: null, reason: 'offline scan' };
    const concurrent = await Promise.all([sync(stocktakeId, manager, [payload]), sync(stocktakeId, manager, [payload])]);
    assert.ok(concurrent.every(response => response.status === 200));
    const concurrentBodies = await Promise.all(concurrent.map(response => response.json()));
    assert.deepEqual(concurrentBodies.map(body => body.results[0].status).sort(), ['APPLIED', 'DUPLICATE']);

    let response = await sync(stocktakeId, manager, [payload]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { results: [{ operationId, status: 'DUPLICATE', version: 1 }], applied: 0, duplicates: 1, conflicts: 0, rejected: 0 });

    response = await sync(stocktakeId, manager, [{ ...payload, result: 'DAMAGED' }]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].code, 'OPERATION_ID_REUSED');

    const staleOperationId = crypto.randomUUID();
    response = await sync(stocktakeId, manager, [{ ...payload, operationId: staleOperationId, result: 'MISSING' }]);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).results[0], { operationId: staleOperationId, status: 'CONFLICT', code: 'VERSION_CHANGED', serverVersion: 1, serverResult: 'MATCH' });

    await pool.query("UPDATE stocktakes SET status='CONFIRMED' WHERE id=$1", [stocktakeId]);
    const confirmedOperationId = crypto.randomUUID();
    response = await sync(stocktakeId, manager, [{ ...payload, operationId: confirmedOperationId, baseVersion: 1 }]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).results[0].code, 'STOCKTAKE_CONFIRMED');

    const state = await pool.query(`SELECT si.result,si.version,
      (SELECT count(*)::int FROM stocktake_offline_operations WHERE stocktake_id=$1) receipt_count,
      (SELECT count(*)::int FROM audit_logs WHERE entity_type='STOCKTAKE' AND entity_id=$1::text AND action='STOCKTAKE_OFFLINE_ITEM_SYNCED') audit_count
      FROM stocktake_items si WHERE si.stocktake_id=$1 AND si.asset_id=$2`, [stocktakeId, assetId]);
    assert.deepEqual(state.rows[0], { result: 'MATCH', version: 1, receipt_count: 1, audit_count: 1 });
  } finally {
    if (manager?.sessionId) await pool.query('DELETE FROM user_sessions WHERE sid=$1', [manager.sessionId]);
    if (stocktakeId) {
      await pool.query("DELETE FROM audit_logs WHERE entity_type='STOCKTAKE' AND entity_id=$1", [String(stocktakeId)]);
      await pool.query('DELETE FROM stocktakes WHERE id=$1', [stocktakeId]);
    }
    if (assetId) await pool.query('DELETE FROM assets WHERE id=$1', [assetId]);
    await pool.end();
  }
});
