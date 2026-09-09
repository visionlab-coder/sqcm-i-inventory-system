const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const { createEnterpriseRouter } = require('../../src/enterprise-routes');

function database() {
  return {
    async query(sql) {
      if (sql.includes('FROM departments WHERE')) return { rows: [{ id: 11, code: 'HQ' }] };
      if (sql.includes('FROM locations WHERE')) return { rows: [{ id: 21, code: 'SEOUL-HQ' }] };
      if (sql.includes('FROM item_categories WHERE')) return { rows: [{ id: 31, code: 'IT' }] };
      if (sql.includes('FROM user_role_scopes')) return { rows: [{ scope_type: 'ORGANIZATION', organization_id: 7 }] };
      if (sql.includes('SELECT upper(asset_tag)')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    }
  };
}

function appFor(role) {
  const app = express(); const pool = database();
  app.use((req, _res, next) => {
    req.id = 'route-test'; req.user = { id: 1, role, organizationId: 7, departmentId: 11, isSystemAdmin: false };
    req.get ||= name => req.headers[String(name).toLowerCase()]; next();
  });
  app.use(createEnterpriseRouter({ pool, apiAuth: (_req, _res, next) => next(), requireRecentReauth: (_req, _res, next) => next(), malwareScanner:{ async scan(){return{status:'clean'};} } }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.code || 'ERROR', message: error.message }));
  return app;
}

test('담당자는 한국어 Excel CSV 템플릿을 no-store로 다운로드한다', async () => {
  const response = await supertest(appFor('MANAGER')).get('/assets/import/template.csv');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/csv/);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.text, /"자산번호","자산명"/);
});

test('담당자 미리보기 HTTP는 DB를 변경하지 않고 행별 결과와 checksum을 반환한다', async () => {
  const response = await supertest(appFor('MANAGER'))
    .post('/assets/import/preview')
    .set('content-type', 'text/csv; charset=utf-8')
    .send('자산번호,자산명,상태,부서코드,위치코드,분류코드\nSW-IT-9201,현장 태블릿,AVAILABLE,HQ,SEOUL-HQ,IT');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.preview.summary, { total: 1, valid: 1, invalid: 0 });
  assert.match(response.body.preview.checksum, /^[a-f0-9]{64}$/);
});

test('일반 사용자는 템플릿과 미리보기 모두 403으로 차단된다', async () => {
  assert.equal((await supertest(appFor('USER')).get('/assets/import/template.csv')).status, 403);
  const preview = await supertest(appFor('USER')).post('/assets/import/preview').set('content-type', 'text/csv').send('자산번호,자산명\nSW-IT-9202,차단 자산');
  assert.equal(preview.status, 403);
});

test('담당자는 TXT 문서를 악성코드 검사 후 자산 미리보기로 변환한다', async () => {
  const response = await supertest(appFor('MANAGER'))
    .post('/assets/import/document/preview')
    .set('content-type', 'text/plain; charset=utf-8')
    .set('x-file-name', encodeURIComponent('자산목록.txt'))
    .send(Buffer.from('자산번호\t자산명\t상태\t부서코드\t위치코드\t분류코드\nSW-TXT-1\t문서 노트북\tAVAILABLE\tHQ\tSEOUL-HQ\tIT'));
  assert.equal(response.status, 200);
  assert.equal(response.body.document.extension, 'txt');
  assert.equal(response.body.preview.summary.valid, 1);
  assert.match(response.body.sourceChecksum, /^[a-f0-9]{64}$/);
});

test('보고서 Excel·Word·PPT·JPEG·PNG route가 다운로드 파일을 생성한다', async () => {
  for (const [format, expected] of [['xlsx','spreadsheetml'],['docx','wordprocessingml'],['pptx','presentationml'],['jpeg','image/jpeg'],['png','image/png']]) {
    const response = await supertest(appFor('MANAGER')).get(`/reports/assets.${format}`);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], new RegExp(expected));
    assert.match(response.headers['content-disposition'], new RegExp(`sqcm-i-assets\\.${format === 'jpeg' ? 'jpg' : format}`));
  }
});
