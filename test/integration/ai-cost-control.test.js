const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig } = require('../../src/config');
const { createPool } = require('../../src/db');
const { getCostCommandCenter } = require('../../src/services/cost-service');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const integrationConfig = getConfig();

const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrfResponse.status, 200);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  const anonymousCookie = cookieFrom(csrfResponse);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { cookie: anonymousCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ _csrf: csrfToken, email, password })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  return { cookie: cookieFrom(response), csrfToken: data.csrfToken, user: data.user };
}

test('cost command center and AI read contracts are org-scoped and operational', { skip: !baseUrl }, async () => {
  const session = await login('manager@seowon.local', integrationConfig.seedManagerPassword);
  const headers = { cookie: session.cookie, accept: 'application/json' };
  const organizationId = session.user.organizationId;

  const costResponse = await fetch(`${baseUrl}/api/enterprise/cost/command-center?organizationId=${organizationId}`, { headers });
  assert.equal(costResponse.status, 200);
  const cost = await costResponse.json();
  assert.ok(cost.summary);
  assert.ok(Array.isArray(cost.idleAssets));
  assert.ok(Array.isArray(cost.upcomingRenewals));

  const recommendationsResponse = await fetch(`${baseUrl}/api/enterprise/ai/recommendations?organizationId=${organizationId}`, { headers });
  assert.equal(recommendationsResponse.status, 200);
  const recommendations = await recommendationsResponse.json();
  assert.ok(Array.isArray(recommendations.recommendations));

  const searchResponse = await fetch(`${baseUrl}/api/enterprise/ai/search?q=자산&organizationId=${organizationId}`, { headers });
  assert.equal(searchResponse.status, 200);
  const search = await searchResponse.json();
  assert.ok(Array.isArray(search.results));

  const ocrResponse = await fetch(`${baseUrl}/api/enterprise/ai/ocr`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
    body: JSON.stringify({ organizationId })
  });
  assert.equal(ocrResponse.status, 501);
  assert.equal((await ocrResponse.json()).extraction.status, 'NOT_CONFIGURED');
});

test('department-scoped cost reads execute with scoped events and hide org budgets', { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  try {
    const department = await pool.query("SELECT id FROM departments WHERE organization_id=1 AND status='ACTIVE' ORDER BY id LIMIT 1");
    assert.equal(department.rowCount, 1);
    const result = await getCostCommandCenter(pool, { organizationId: 1, isSystemAdmin: false }, 1, { departmentIds: [department.rows[0].id] });
    assert.ok(result.summary);
    assert.ok(Array.isArray(result.monthly));
    assert.deepEqual(result.budgets, []);
  } finally {
    await pool.end();
  }
});
