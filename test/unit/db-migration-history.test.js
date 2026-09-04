const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { verifySupabaseMigrations, verifyMigrationHistory, normalizedProviderSql, migrationFilesForTarget, validateMigrationTargetManifest } = require('../../src/db');

async function providerRows() {
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = await migrationFilesForTarget('supabase');
  return Promise.all(files.map(async file => ({
    name: `sqcmi_${file.replace(/\.sql$/, '')}`,
    statements: [(await fs.readFile(path.join(dir, file), 'utf8')).replace(/\n/g, '\r\n') + '\r\n']
  })));
}

test('migration target manifest is exhaustive and isolates Supabase-only migration 023', async () => {
  const application = await migrationFilesForTarget('application');
  const supabase = await migrationFilesForTarget('supabase');
  assert.equal(application.length, 30);
  assert.equal(supabase.length, 30);
  assert.equal(application.includes('023_supabase_data_api_lockdown.sql'), false);
  assert.equal(application.includes('024_function_search_path_hardening.sql'), true);
  assert.equal(application.includes('025_allow_supabase_s3_storage_driver.sql'), true);
  assert.equal(application.includes('026_postgres_file_blobs.sql'), true);
  assert.equal(supabase.includes('023_supabase_data_api_lockdown.sql'), true);
  assert.equal(supabase.includes('025_allow_supabase_s3_storage_driver.sql'), true);
  assert.equal(supabase.includes('026_postgres_file_blobs.sql'), false);
  assert.equal(application.includes('027_asset_qr_identity.sql'), true);
  assert.equal(supabase.includes('027_asset_qr_identity.sql'), true);
  assert.equal(application.includes('028_stocktake_offline_sync.sql'), true);
  assert.equal(supabase.includes('028_stocktake_offline_sync.sql'), true);
  assert.equal(application.includes('029_hr_integration_inbox.sql'), true);
  assert.equal(supabase.includes('029_hr_integration_inbox.sql'), true);
  assert.equal(application.includes('030_hr_lifecycle_mapping_exceptions.sql'), true);
  assert.equal(supabase.includes('030_hr_lifecycle_mapping_exceptions.sql'), true);
  assert.equal(application.includes('031_outbox_delivery_receipts.sql'), true);
  assert.equal(supabase.includes('031_outbox_delivery_receipts.sql'), true);
});

test('migration target manifest fails closed on missing, duplicate and unsupported targets', () => {
  const files = ['001_init.sql'];
  assert.throws(() => validateMigrationTargetManifest(files, { schemaVersion: 1, migrations: [] }), /enumerate every migration/);
  assert.throws(() => validateMigrationTargetManifest(files, { schemaVersion: 1, migrations: [{ file: '001_init.sql', targets: ['application', 'application'] }] }), /invalid targets/);
  assert.throws(() => validateMigrationTargetManifest(files, { schemaVersion: 1, migrations: [{ file: '001_init.sql', targets: ['unknown'] }] }), /unsupported target/);
});

function poolWith(rows, historyExists = true) {
  return {
    async query(sql) {
      if (sql.includes("to_regclass('supabase_migrations.schema_migrations')")) return { rows: [{ name: historyExists ? 'supabase_migrations.schema_migrations' : null }], rowCount: 1 };
      if (sql.includes('FROM supabase_migrations.schema_migrations')) return { rows, rowCount: rows.length };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

test('Supabase provider history verifies exact names, order and normalized SQL', async () => {
  const rows = await providerRows();
  const result = await verifySupabaseMigrations(poolWith(rows));
  assert.deepEqual(result, { expected: rows.length, applied: rows.length, history: 'supabase' });
  assert.equal(normalizedProviderSql('select 1;\r\n\r\n'), 'select 1;');
});

test('Supabase provider history fails closed on missing history, order and content drift', async () => {
  const rows = await providerRows();
  await assert.rejects(verifySupabaseMigrations(poolWith(rows, false)), /history is missing/);
  await assert.rejects(verifySupabaseMigrations(poolWith(rows.slice(1))), /count mismatch/);
  const reordered = rows.map(row => ({ ...row, statements: [...row.statements] }));
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await assert.rejects(verifySupabaseMigrations(poolWith(reordered)), /order mismatch/);
  const altered = rows.map(row => ({ ...row, statements: [...row.statements] }));
  altered[0].statements[0] += '\nselect 2;';
  await assert.rejects(verifySupabaseMigrations(poolWith(altered)), /content mismatch/);
});

test('migration history mode rejects unsupported values', async () => {
  await assert.rejects(verifyMigrationHistory({}, 'auto'), /Unsupported migration history mode/);
});
