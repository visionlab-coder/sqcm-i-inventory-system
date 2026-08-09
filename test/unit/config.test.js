const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig, boundedInteger } = require('../../src/config');
const { createApp } = require('../../src/app');

test('운영 설정은 안전한 세션 비밀과 secure cookie를 강제한다', () => {
  const mfaKey = Buffer.alloc(32, 7).toString('base64');
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short', COOKIE_SECURE: 'true' }), /32자/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true' }), /MFA_ENCRYPTION_KEY/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey }), /external file storage/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey, FILE_STORAGE_DRIVER: 'external' }), /AUTH_PROVIDER/);
  const config = getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey, FILE_STORAGE_DRIVER: 'external', AUTH_PROVIDER:'oidc', MALWARE_SCAN_DRIVER:'external', OPERATIONAL_ADAPTER_MODULE:'C:/runtime/adapters.js', PUBLIC_BASE_URL:'https://inventory.example', OIDC_REDIRECT_URI:'https://inventory.example/api/auth/oidc/callback' });
  assert.equal(config.cookieSecure, true);
  assert.equal(config.publicBaseUrl, 'https://inventory.example');
  assert.equal(config.trustedProxyCount, 1);
  assert.throws(()=>createApp({pool:{},config}),/external fileStore/);
});
test('운영 공개 URL은 HTTPS이고 OIDC callback의 기준 origin이어야 한다', () => {
  const base={NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),COOKIE_SECURE:'true',MFA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),FILE_STORAGE_DRIVER:'external',AUTH_PROVIDER:'oidc',MALWARE_SCAN_DRIVER:'external',OPERATIONAL_ADAPTER_MODULE:'adapter.js'};
  assert.throws(()=>getConfig({...base,PUBLIC_BASE_URL:'http://inventory.example',OIDC_REDIRECT_URI:'https://inventory.example/callback'}),/PUBLIC_BASE_URL/);
  assert.throws(()=>getConfig({...base,PUBLIC_BASE_URL:'https://inventory.example',OIDC_REDIRECT_URI:'https://other.example/callback'}),/belong/);
});
test('포트와 레이트리밋 설정은 허용 범위의 정수만 받는다', () => {
  assert.equal(boundedInteger('10', 5, 'VALUE', 1, 20), 10);
  assert.throws(() => boundedInteger('NaN', 5, 'VALUE', 1, 20), /범위/);
  assert.throws(() => getConfig({ PORT: '70000' }), /PORT/);
});
