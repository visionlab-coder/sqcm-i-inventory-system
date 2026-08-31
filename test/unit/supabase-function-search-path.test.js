const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(process.cwd(), 'db', 'migrations', '024_function_search_path_hardening.sql'), 'utf8');

test('migration 024 pins all advisor-reported function search paths', () => {
  for (const signature of [
    'public.default_organization_id()',
    'public.set_audit_organization()',
    'public.ensure_asset_financial_profile()'
  ]) {
    assert.match(sql, new RegExp(`ALTER FUNCTION ${signature.replace(/[().]/g, '\\$&')}`));
  }
  assert.equal((sql.match(/SET search_path = pg_catalog, public/g) || []).length, 3);
});

test('migration 024 does not replace functions or elevate privileges', () => {
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION/i);
  assert.doesNotMatch(sql, /SECURITY DEFINER/i);
  assert.doesNotMatch(sql, /GRANT\s+/i);
});
