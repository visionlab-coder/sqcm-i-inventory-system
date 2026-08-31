const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPool } = require('../../src/db');
const { getConfig } = require('../../src/config');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = process.env.RUN_P3_SECURITY_UAT === 'true';
const config = getConfig();
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];

function embeddedEicarPdf() {
  const fixture = Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=', 'base64');
  const parts = [
    '%PDF-1.4\n',
    '1 0 obj<</Type/Catalog/Names<</EmbeddedFiles 2 0 R>>>>endobj\n',
    '2 0 obj<</Names[(eicar.com) 3 0 R]>>endobj\n',
    '3 0 obj<</Type/Filespec/F(eicar.com)/EF<</F 4 0 R>>>>endobj\n',
    `4 0 obj<</Type/EmbeddedFile/Length ${fixture.length}>>stream\n`,
    fixture,
    '\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF'
  ];
  return Buffer.concat(parts.map(value => Buffer.isBuffer(value) ? value : Buffer.from(value)));
}

test('P3 실제 Defender는 EICAR PDF를 저장 전에 차단한다', { skip: !enabled || !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  let sessionId = null;
  const marker = `p3-eicar-${crypto.randomUUID()}.pdf`;
  try {
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
    const csrfToken = (await csrfResponse.json()).csrfToken;
    const anonymousCookie = cookieFrom(csrfResponse);
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { cookie: anonymousCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ _csrf: csrfToken, email: 'admin@seowon.local', password: config.seedAdminPassword })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    const cookie = cookieFrom(loginResponse);
    sessionId = decodeURIComponent(cookie.split('=', 2)[1]).replace(/^s:/, '').split('.')[0];
    const assetsResponse = await fetch(`${baseUrl}/api/enterprise/assets?organizationId=${login.user.organizationId}&size=1`, { headers: { cookie } });
    assert.equal(assetsResponse.status, 200);
    const assetId = (await assetsResponse.json()).assets[0]?.id;
    assert.ok(assetId);
    const before = Number((await pool.query('SELECT count(*) count FROM file_records WHERE original_name=$1', [marker])).rows[0].count);
    const response = await fetch(`${baseUrl}/api/enterprise/assets/${assetId}/files`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(marker),
        'x-file-type': 'PHOTO',
        'x-csrf-token': login.csrfToken,
        'idempotency-key': crypto.randomUUID()
      },
      body: embeddedEicarPdf()
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'DOMAIN_ERROR');
    const after = Number((await pool.query('SELECT count(*) count FROM file_records WHERE original_name=$1', [marker])).rows[0].count);
    assert.equal(after, before);
  } finally {
    if (sessionId) await pool.query('DELETE FROM user_sessions WHERE sid=$1', [sessionId]);
    await pool.end();
  }
});
