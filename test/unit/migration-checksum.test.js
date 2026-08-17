const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { migrationChecksum, migrationChecksumCandidates, normalizeMigrationSql } = require('../../src/migration-checksum');

test('migration checksum is independent of platform line endings', () => {
  const lf = 'CREATE TABLE example (\n  id INTEGER PRIMARY KEY\n);\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  const cr = lf.replace(/\n/g, '\r');

  assert.equal(normalizeMigrationSql(crlf), lf);
  assert.equal(normalizeMigrationSql(cr), lf);
  assert.equal(migrationChecksum(crlf), migrationChecksum(lf));
  assert.equal(migrationChecksum(cr), migrationChecksum(lf));
  const legacyCrLfChecksum = crypto.createHash('sha256').update(crlf).digest('hex');
  assert.equal(migrationChecksumCandidates(lf).has(legacyCrLfChecksum), true);
});

test('migration checksum still detects semantic SQL changes', () => {
  const original = 'CREATE TABLE example (id INTEGER PRIMARY KEY);\n';
  const changed = 'CREATE TABLE example (id BIGINT PRIMARY KEY);\n';

  assert.notEqual(migrationChecksum(changed), migrationChecksum(original));
  for (const candidate of migrationChecksumCandidates(original)) {
    assert.equal(migrationChecksumCandidates(changed).has(candidate), false);
  }
});
