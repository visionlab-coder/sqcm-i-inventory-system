const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(process.cwd(), 'db', 'migrations', '025_allow_supabase_s3_storage_driver.sql');

test('migration 025 keeps existing drivers and allows the Supabase S3 adapter', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /DROP CONSTRAINT IF EXISTS ck_file_records_storage_driver/i);
  assert.match(sql, /ADD CONSTRAINT ck_file_records_storage_driver/i);
  assert.match(sql, /storage_driver IN \('LOCAL', 'EXTERNAL', 'SUPABASE_S3'\)/i);
  assert.doesNotMatch(sql, /DISABLE TRIGGER|ROW LEVEL SECURITY|GRANT\s+ALL/i);
});
