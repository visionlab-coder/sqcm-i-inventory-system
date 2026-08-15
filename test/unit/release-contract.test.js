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
