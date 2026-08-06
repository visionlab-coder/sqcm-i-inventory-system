const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig, boundedInteger } = require('../../src/config');

test('운영 설정은 안전한 세션 비밀과 secure cookie를 강제한다', () => {
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short', COOKIE_SECURE: 'true' }), /32자/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  const config = getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true' });
  assert.equal(config.cookieSecure, true);
});
test('포트와 레이트리밋 설정은 허용 범위의 정수만 받는다', () => {
  assert.equal(boundedInteger('10', 5, 'VALUE', 1, 20), 10);
  assert.throws(() => boundedInteger('NaN', 5, 'VALUE', 1, 20), /범위/);
  assert.throws(() => getConfig({ PORT: '70000' }), /PORT/);
});
