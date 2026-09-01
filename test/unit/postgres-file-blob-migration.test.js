const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('026 migration은 파일 BLOB과 POSTGRES metadata driver를 추가한다', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'db', 'migrations', '026_postgres_file_blobs.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS file_blobs/i);
  assert.match(sql, /content BYTEA NOT NULL/i);
  assert.match(sql, /size_bytes INTEGER NOT NULL CHECK \(size_bytes BETWEEN 1 AND 5242880\)/i);
  assert.match(sql, /storage_driver IN \('LOCAL', 'EXTERNAL', 'SUPABASE_S3', 'POSTGRES'\)/i);
});
