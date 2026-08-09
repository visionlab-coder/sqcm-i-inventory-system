const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfToken, csrfProtection, sameOriginProtection, sanitizeUser } = require('../../src/security');

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

test('sameOriginProtection은 cross-site와 다른 Origin의 쓰기를 거부한다', () => {
  const middleware=sameOriginProtection({publicBaseUrl:'https://inventory.example',enforce:true});
  middleware({method:'POST',get:name=>name==='sec-fetch-site'?'cross-site':''},{},error=>{assert.equal(error.code,'CROSS_SITE_REQUEST');assert.equal(error.status,403);});
  middleware({method:'POST',get:name=>name==='origin'?'https://other.example':''},{},error=>assert.equal(error.code,'CROSS_SITE_REQUEST'));
});

test('sameOriginProtection은 같은 Origin과 비변경 요청을 허용한다', () => {
  const middleware=sameOriginProtection({publicBaseUrl:'https://inventory.example',enforce:true}); let allowed=0;
  middleware({method:'POST',get:name=>name==='sec-fetch-site'?'same-origin':name==='origin'?'https://inventory.example':''},{},error=>{assert.equal(error,undefined);allowed++;});
  middleware({method:'GET',get:()=>''},{},error=>{assert.equal(error,undefined);allowed++;}); assert.equal(allowed,2);
});

test('csrfProtection은 바이너리 업로드의 CSRF 헤더를 허용한다', () => {
  const token='b'.repeat(64); let passed=false;
  csrfProtection({method:'POST',session:{csrfToken:token},body:Buffer.from('x'),get:name=>name==='x-csrf-token'?token:''},{},error=>{assert.equal(error,undefined);passed=true;});
  assert.equal(passed,true);
});

test('csrfProtection은 누락 토큰을 전용 오류 코드와 403으로 거부한다', () => {
  csrfProtection({ method: 'POST', session: {}, body: {} }, {}, error => { assert.equal(error.status, 403); assert.equal(error.code, 'CSRF_INVALID'); });
});

test('sanitizeUser는 비밀번호 해시를 노출하지 않는다', () => {
  const user = sanitizeUser({ id: 1, email: 'a@b.c', display_name: 'A', role: 'USER', status: 'ACTIVE', password_hash: 'secret' });
  assert.equal(user.password_hash, undefined);
});
