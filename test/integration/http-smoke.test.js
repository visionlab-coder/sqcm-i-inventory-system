const test = require('node:test');
const assert = require('node:assert/strict');

const baseUrl = process.env.INTEGRATION_BASE_URL;

test('3계층 Docker 앱 health와 API 로그인 세션 흐름이 동작한다', { skip: !baseUrl }, async () => {
  const frontendHealth = await fetch(`${baseUrl}/health`);
  assert.equal(frontendHealth.status, 200);
  assert.deepEqual(await frontendHealth.json(), { status: 'ok', service: 'frontend' });

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'backend', database: 'up' });

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: 'manual' });
  const token = (await csrfResponse.json()).csrfToken;
  const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(token && cookie);

  const body = JSON.stringify({ _csrf: token, email: 'manager@seowon.local', password: process.env.SEED_MANAGER_PASSWORD || 'Manager1234!' });
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body, redirect: 'manual' });
  assert.equal(login.status, 200);
  const authCookie = login.headers.get('set-cookie')?.split(';')[0];
  const dashboard = await fetch(`${baseUrl}/api/dashboard`, { headers: { cookie: authCookie }, redirect: 'manual' });
  assert.equal(dashboard.status, 200);
  const dashboardData = await dashboard.json();
  assert.equal(typeof dashboardData.stats.total_items, 'number');
  assert.ok(Array.isArray(dashboardData.items));
});
