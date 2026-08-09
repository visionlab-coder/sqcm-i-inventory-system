const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoginRateLimiter } = require('../../src/login-rate-limit');

function invoke(limiter, { ip = '127.0.0.1', email = 'user@example.com' } = {}) {
  const headers = {};
  const req = { ip, body: { email } };
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  let error;
  limiter(req, res, value => { error = value; });
  return { req, headers, error };
}

test('로그인 레이트리밋은 IP와 이메일 조합별 허용 횟수를 제한한다', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60_000, now: () => 1_000 });
  assert.equal(invoke(limiter).error, undefined);
  assert.equal(invoke(limiter).error, undefined);
  const blocked = invoke(limiter);
  assert.equal(blocked.error.status, 429);
  assert.equal(blocked.error.code, 'LOGIN_RATE_LIMITED');
  assert.equal(blocked.headers['retry-after'], '60');
  assert.equal(invoke(limiter, { email: 'other@example.com' }).error, undefined);
});
test('성공한 로그인 키를 지우면 다시 시도할 수 있다', () => {
  const limiter = createLoginRateLimiter({ maxAttempts: 1, now: () => 1_000 });
  const first = invoke(limiter);
  limiter.clear(first.req);
  assert.equal(invoke(limiter).error, undefined);
});
