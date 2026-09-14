const test = require('node:test');
const assert = require('node:assert/strict');
const { validateImmutableImageConfig } = require('../../src/operations/release-contract');

test('production deployment requires distinct immutable GHCR images for an exact SHA', () => {
  const valid = validateImmutableImageConfig({
    target: 'production',
    releaseTag: `sha-${'a'.repeat(40)}`,
    backendImage: 'ghcr.io/visionlab-coder/sqcm-i-inventory-backend',
    frontendImage: 'ghcr.io/visionlab-coder/sqcm-i-inventory-frontend'
  });
  assert.deepEqual(valid, []);
  const invalid = validateImmutableImageConfig({ target: 'production', releaseTag: 'latest', backendImage: 'local/backend', frontendImage: 'local/backend' });
  assert.equal(invalid.length, 4);
});

test('local deployment keeps a safe development tag without requiring GHCR', () => {
  assert.deepEqual(validateImmutableImageConfig({ target: 'local', releaseTag: 'local-test' }), []);
});

test('AI PC Production은 명시 허용된 exact local repository와 SHA tag만 사용한다', () => {
  const valid = validateImmutableImageConfig({
    target: 'production',
    releaseTag: `sha-${'b'.repeat(40)}`,
    backendImage: 'sqcm-r5-backend',
    frontendImage: 'sqcm-r5-frontend',
    allowVerifiedLocalProductionImages: true
  });
  assert.deepEqual(valid, []);
  assert.ok(validateImmutableImageConfig({
    target: 'production', releaseTag: 'latest', backendImage: 'sqcm-r5-backend', frontendImage: 'sqcm-r5-frontend', allowVerifiedLocalProductionImages: true
  }).length > 0);
  assert.ok(validateImmutableImageConfig({
    target: 'production', releaseTag: `sha-${'b'.repeat(40)}`, backendImage: 'other-backend', frontendImage: 'sqcm-r5-frontend', allowVerifiedLocalProductionImages: true
  }).length > 0);
});
