const test = require('node:test');
const assert = require('node:assert/strict');
const { createPool } = require('../../src/db');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
const sessionIdFromCookie = cookie => {
  const encoded = String(cookie || '').split('=', 2)[1] || '';
  const value = decodeURIComponent(encoded).replace(/^s:/, '');
  return value.split('.')[0] || null;
};

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: 'manual' });
  assert.equal(csrfResponse.status, 200);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  const anonymousCookie = cookieFrom(csrfResponse);
  assert.ok(csrfToken && anonymousCookie);

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

async function removeTestSessions(pool, sessions) {
  const ids = sessions.map(session => session?.sessionId).filter(Boolean);
  if (ids.length) await pool.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [ids]);
}

async function api(path, session, { method = 'GET', body, includeCsrf = true } = {}) {
  const headers = { cookie: session.cookie, accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(includeCsrf ? { ...body, _csrf: session.csrfToken } : body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload, redirect: 'manual' });
}

test('3계층 Docker 앱 health와 API 로그인 세션 흐름이 동작한다', { skip: !baseUrl }, async () => {
  const pool = createPool(databaseUrl);
  let manager;
  try {
  const frontendHealth = await fetch(`${baseUrl}/health`);
  assert.equal(frontendHealth.status, 200);
  assert.deepEqual(await frontendHealth.json(), { status: 'ok', service: 'frontend' });

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.ok(health.headers.get('x-request-id'));
  assert.deepEqual(await health.json(), { status: 'ok', service: 'backend', database: 'up' });

  const anonymousItems = await fetch(`${baseUrl}/api/items`);
  assert.equal(anonymousItems.status, 401);
  const anonymousError = await anonymousItems.json();
  assert.equal(anonymousError.code, 'AUTH_REQUIRED');
  assert.ok(anonymousError.requestId);
  assert.deepEqual(anonymousError.fieldErrors, []);

  manager = await login('manager@seowon.local', process.env.SEED_MANAGER_PASSWORD || 'Manager1234!');
  assert.equal(manager.user.role, 'MANAGER');
  const dashboard = await api('/api/dashboard', manager);
  assert.equal(dashboard.status, 200);
  const dashboardData = await dashboard.json();
  assert.equal(typeof dashboardData.stats.total_items, 'number');
  assert.ok(Array.isArray(dashboardData.items));
  } finally {
    await removeTestSessions(pool, [manager]);
    await pool.end();
  }
});

test('Docker HTTP에서 CSRF·RBAC·비품 CRUD·대여·반납·감사 로그가 연결된다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  const marker = Date.now().toString().slice(-9);
  const code = `HT-${marker}`;
  let itemId;
  let loanId;
  let manager;
  let admin;

  try {
    manager = await login('manager@seowon.local', process.env.SEED_MANAGER_PASSWORD || 'Manager1234!');

    const noCsrf = await api('/api/items', manager, {
      method: 'POST', includeCsrf: false,
      body: { code, name: 'HTTP 통합 비품', category: '통합시험', totalQuantity: 5, minQuantity: 1 }
    });
    assert.equal(noCsrf.status, 403);

    const created = await api('/api/items', manager, {
      method: 'POST',
      body: { code, name: 'HTTP 통합 비품', category: '통합시험', location: '시험창고 A', totalQuantity: 5, minQuantity: 1 }
    });
    assert.equal(created.status, 201);
    const createdData = await created.json();
    itemId = createdData.item.id;
    assert.equal(createdData.item.location, '시험창고 A');

    const detail = await api(`/api/items/${itemId}`, manager);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).item.code, code);

    const loan = await api('/api/loans', manager, {
      method: 'POST',
      body: {
        itemId,
        borrowerEmail: 'manager@seowon.local',
        quantity: 2,
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    });
    assert.equal(loan.status, 201);
    loanId = (await loan.json()).loan.id;

    const shrink = await api(`/api/items/${itemId}`, manager, {
      method: 'PATCH',
      body: { name: 'HTTP 통합 비품', category: '통합시험', location: '시험창고 A', totalQuantity: 1, minQuantity: 1 }
    });
    assert.equal(shrink.status, 409);

    const activeDelete = await api(`/api/items/${itemId}`, manager, { method: 'DELETE', body: {} });
    assert.equal(activeDelete.status, 409);

    const returned = await api(`/api/loans/${loanId}/return`, manager, { method: 'POST', body: { condition: 'GOOD', note: 'HTTP 통합 반납' } });
    assert.equal(returned.status, 204);

    const updated = await api(`/api/items/${itemId}`, manager, {
      method: 'PATCH',
      body: { name: 'HTTP 통합 수정 비품', category: '통합장비', location: '시험창고 B', totalQuantity: 8, minQuantity: 2 }
    });
    assert.equal(updated.status, 200);
    const updatedData = await updated.json();
    assert.equal(updatedData.item.available_quantity, 8);
    assert.equal(updatedData.item.location, '시험창고 B');

    const managerAudit = await api('/api/audit', manager);
    assert.equal(managerAudit.status, 403);

    const deactivated = await api(`/api/items/${itemId}`, manager, { method: 'DELETE', body: {} });
    assert.equal(deactivated.status, 204);

    const list = await api(`/api/items?q=${encodeURIComponent(code)}`, manager);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).items.length, 0);

    admin = await login('admin@seowon.local', process.env.SEED_ADMIN_PASSWORD || 'Admin1234!');
    const audit = await api('/api/audit', admin);
    assert.equal(audit.status, 200);
    const itemLogs = (await audit.json()).logs.filter(log => String(log.entity_id) === String(itemId));
    const actions = itemLogs.map(log => log.action);
    assert.ok(actions.includes('ITEM_CREATED'));
    assert.ok(actions.includes('ITEM_UPDATED'));
    assert.ok(actions.includes('ITEM_DEACTIVATED'));
    assert.ok(itemLogs.every(log => log.request_id && log.ip_address));
  } finally {
    if (loanId || itemId) {
      await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::text[])', [[String(itemId || ''), String(loanId || '')]]);
      if (loanId) await pool.query('DELETE FROM loans WHERE id=$1', [loanId]);
      if (itemId) await pool.query('DELETE FROM items WHERE id=$1', [itemId]);
    }
    await removeTestSessions(pool, [manager, admin]);
    await pool.end();
  }
});
