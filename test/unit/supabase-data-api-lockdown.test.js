const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(process.cwd(), 'db', 'migrations', '023_supabase_data_api_lockdown.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

test('Supabase Data API lockdown enables RLS without forcing the backend owner through policies', () => {
  assert.match(sql, /ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /WHERE schemaname = 'public'/);
});

test('Supabase Data API roles are conditional and fail closed', () => {
  assert.match(sql, /ARRAY\['anon', 'authenticated', 'service_role'\]/);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = api_role\)/);
  assert.match(sql, /REVOKE USAGE ON SCHEMA public/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
});

test('public RPC and future object defaults remain closed', () => {
  assert.match(sql, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC/);
  assert.match(sql, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  assert.match(sql, /REVOKE USAGE ON SCHEMA public FROM PUBLIC/);
  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
});
