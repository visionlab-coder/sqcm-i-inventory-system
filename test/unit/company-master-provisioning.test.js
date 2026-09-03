const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCompanyMasterManifest, provisionCompanyMasters } = require('../../src/company-master-provisioning');

const valid = {
  schemaVersion:1,
  organizationCode:'SEOWON',
  departmentCode:'HQ',
  approvalId:'USER_APPROVAL_20260903_MASTERS',
  initialPassword:'Initial123!',
  accounts:[
    { email:'owner@seowonenc.co.kr', displayName:'운영자' },
    { email:'team@seowonenc.co.kr', displayName:'운영팀' }
  ]
};

test('명시 승인된 회사 도메인 계정만 마스터 입력으로 허용한다', () => {
  const result = validateCompanyMasterManifest(valid);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.accounts[0].email, 'owner@seowonenc.co.kr');
});

test('외부 도메인, 중복, 승인 참조 누락과 짧은 초기 비밀번호를 거부한다', () => {
  assert.throws(() => validateCompanyMasterManifest({ ...valid, approvalId:'' }), /approval/);
  assert.throws(() => validateCompanyMasterManifest({ ...valid, initialPassword:'short' }), /password/);
  assert.throws(() => validateCompanyMasterManifest({ ...valid, accounts:[{ email:'x@example.com', displayName:'x' }] }), /domain/);
  assert.throws(() => validateCompanyMasterManifest({ ...valid, accounts:[valid.accounts[0], valid.accounts[0]] }), /duplicate/);
});

test('마스터 전환은 JSON 세션 소유자를 폐기하고 ADMIN ALL 범위를 검증한다', async () => {
  const queries = [];
  let nextId = 100;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT o.id organization_id')) {
        return { rowCount:1, rows:[{ organization_id:1, department_id:1 }] };
      }
      if (sql.includes('SELECT id FROM users')) return { rowCount:0, rows:[] };
      if (sql.includes('INSERT INTO users')) return { rowCount:1, rows:[{ id:nextId++ }] };
      if (sql.includes('SELECT count(*)::int total')) return { rowCount:1, rows:[{ total:2 }] };
      return { rowCount:1, rows:[] };
    },
    release() {}
  };
  const result = await provisionCompanyMasters({ connect:async () => client }, valid);
  assert.equal(result.status, 'PASS');
  assert.equal(result.inserted, 2);
  assert.ok(queries.some(sql => sql.includes("sess->>'userId'")));
  assert.ok(queries.every(sql => !sql.includes('user_sessions WHERE user_id')));
  assert.ok(queries.some(sql => sql.includes("VALUES($1,'ADMIN',$2,NULL,'ALL')")));
});
