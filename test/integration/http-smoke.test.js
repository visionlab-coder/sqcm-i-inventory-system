const test = require('node:test');
const assert = require('node:assert/strict');

const baseUrl = process.env.INTEGRATION_BASE_URL;

test('Docker 앱 health와 로그인 세션 흐름이 동작한다', { skip: !baseUrl }, async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'up' });

  const page = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
  const html = await page.text();
  const token = html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1];
  const cookie = page.headers.get('set-cookie')?.split(';')[0];
  assert.ok(token && cookie);

  const body = new URLSearchParams({ _csrf: token, email: 'manager@seowon.local', password: process.env.SEED_MANAGER_PASSWORD || 'Manager1234!', returnTo: '/' });
  const login = await fetch(`${baseUrl}/login`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/');
  const authCookie = login.headers.get('set-cookie')?.split(';')[0];
  const dashboard = await fetch(`${baseUrl}/`, { headers: { cookie: authCookie }, redirect: 'manual' });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /대시보드/);
});
