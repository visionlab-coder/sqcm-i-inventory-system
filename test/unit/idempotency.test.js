const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalize, requestHash, validIdempotencyKey } = require('../../src/idempotency');

test('idempotency key는 안전한 8~100자 형식만 허용한다', () => {
  assert.equal(validIdempotencyKey('12345678-abcd'), true);
  assert.equal(validIdempotencyKey('short'), false);
  assert.equal(validIdempotencyKey('invalid key value'), false);
});

test('요청 hash는 객체 키 순서와 무관하고 payload 변경을 구분한다', () => {
  const req = body => ({ method:'POST',originalUrl:'/api/enterprise/assets',body,get:()=> 'application/json' });
  assert.equal(requestHash(req({ b:2,a:1 })), requestHash(req({ a:1,b:2 })));
  assert.notEqual(requestHash(req({ a:1 })), requestHash(req({ a:2 })));
});

test('binary canonicalization은 원문 대신 길이와 SHA-256을 사용한다', () => {
  const result = canonicalize(Buffer.from('evidence'));
  assert.equal(result.bytes, 8); assert.match(result.bufferSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('evidence'), false);
});
