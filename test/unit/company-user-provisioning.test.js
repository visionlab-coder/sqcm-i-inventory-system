const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCompanyUserManifest } = require('../../src/company-user-provisioning');

const valid = () => ({
  schemaVersion:1,
  organizationCode:'SEOWON',
  departmentCode:'HQ',
  initialPassword:'TemporaryOnly123!',
  users:[{ email:'employee@seowonenc.co.kr', displayName:'시험 직원' }]
});

test('승인된 회사 도메인 명단만 최초 변경 USER 계정 입력으로 허용한다', () => {
  const result=validateCompanyUserManifest(valid());
  assert.deepEqual(result.users,[{ email:'employee@seowonenc.co.kr', displayName:'시험 직원' }]);
});

test('외부 도메인, 중복 이메일, 빈 명단과 짧은 초기 비밀번호를 거부한다', () => {
  assert.throws(()=>validateCompanyUserManifest({...valid(),users:[{email:'outsider@example.com',displayName:'외부'}]}),/domain/);
  assert.throws(()=>validateCompanyUserManifest({...valid(),users:[...valid().users,...valid().users]}),/duplicate/);
  assert.throws(()=>validateCompanyUserManifest({...valid(),users:[]}),/1 to 500/);
  assert.throws(()=>validateCompanyUserManifest({...valid(),initialPassword:'short'}),/length/);
});

test('깨진 UTF-8 대체문자가 포함된 표시명을 거부한다', () => {
  assert.throws(
    () => validateCompanyUserManifest({...valid(),users:[{email:'employee@seowonenc.co.kr',displayName:'천�연'}]}),
    /encoding/
  );
});
