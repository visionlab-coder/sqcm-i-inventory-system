const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeBase32, decodeBase32, encryptSecret, decryptSecret, hotp, totp, verifyTotp, hashRecoveryCode } = require('../../src/services/mfa-service');

test('Base32와 AES-256-GCM은 MFA 비밀을 왕복하고 원문을 노출하지 않는다', () => {
  const source = Buffer.from('12345678901234567890');
  const secret = encodeBase32(source);
  assert.deepEqual(decodeBase32(secret), source);
  const key = Buffer.alloc(32, 9);
  const encrypted = encryptSecret(secret, key);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptSecret(encrypted, key), secret);
  assert.throws(() => decryptSecret(encrypted, Buffer.alloc(32, 8)));
});

test('HOTP/TOTP는 표준 코드와 허용 시간 구간을 검증한다', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(hotp(secret, 0), '755224');
  const now = 1_700_000_000_000;
  const code = totp(secret, now);
  const counter = verifyTotp(secret, code, { now, window: 1 });
  assert.equal(counter, Math.floor(now / 30_000));
  assert.equal(verifyTotp(secret, code, { now, lastUsedCounter: counter }), null);
  assert.equal(verifyTotp(secret, '000000', { now }), null);
});

test('복구코드는 표기 구분자를 제거해 동일하게 해시한다', () => {
  assert.equal(hashRecoveryCode('ABCD-EF12-3456'), hashRecoveryCode('abcdef123456'));
});
