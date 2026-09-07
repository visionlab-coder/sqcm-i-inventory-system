const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyMigrations, migrationFilesForTarget } = require('../../src/db');

test('rollback cannot silently accept a database with newer migration history', async () => {
  const files = await migrationFilesForTarget('application');
  const pool = { query: async sql => {
    if (sql.includes('to_regclass')) return { rows: [{ name: 'schema_migrations' }] };
    assert.equal(sql, 'SELECT version,checksum FROM schema_migrations ORDER BY version');
    return { rowCount: files.length + 1, rows: [...files, '999_future.sql'].map(version => ({ version, checksum: 'synthetic' })) };
  } };
  await assert.rejects(verifyMigrations(pool), /application migration target mismatch/);
});
