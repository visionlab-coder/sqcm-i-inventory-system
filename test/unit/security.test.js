const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfToken, csrfProtection, sanitizeUser } = require('../../src/security');

test('csrfToken은 세션별 토큰을 생성하고 재사용한다', () => {
  const req = { session: {} };
  const first = csrfToken(req);
  assert.equal(first.length, 64);
  assert.equal(csrfToken(req), first);
});

test('csrfProtection은 일치하는 토큰만 허용한다', () => {
  const token = 'a'.repeat(64);
  let passed = false;
  csrfProtection({ method: 'POST', session: { csrfToken: token }, body: { _csrf: token } }, {}, error => {
    assert.equal(error, undefined);
    passed = true;
  });
  assert.equal(passed, true);
});

test('csrfProtection은 바이너리 업로드의 CSRF 헤더를 허용한다', () => {
  const token='b'.repeat(64); let passed=false;
  csrfProtection({method:'POST',session:{csrfToken:token},body:Buffer.from('x'),get:name=>name==='x-csrf-token'?token:''},{},error=>{assert.equal(error,undefined);passed=true;});
  assert.equal(passed,true);
});

test('csrfProtection은 누락 토큰을 403으로 거부한다', () => {
  csrfProtection({ method: 'POST', session: {}, body: {} }, {}, error => assert.equal(error.status, 403));
});

test('sanitizeUser는 비밀번호 해시를 노출하지 않는다', () => {
  const user = sanitizeUser({ id: 1, email: 'a@b.c', display_name: 'A', role: 'USER', status: 'ACTIVE', password_hash: 'secret' });
  assert.equal(user.password_hash, undefined);
});
