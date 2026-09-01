const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PostgresFileStore } = require('../../src/storage/postgres-file-store');

test('PostgreSQL 파일 저장소는 쓰기, 읽기, 정리와 health 계약을 지킨다', async () => {
  const calls = [];
  const content = Buffer.from('evidence');
  const pool = { async query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT content')) return { rowCount: 1, rows: [{ content }] };
    if (sql.includes('to_regclass')) return { rowCount: 1, rows: [{ name: 'file_blobs' }] };
    return { rowCount: 1, rows: [] };
  } };
  const store = new PostgresFileStore(pool);
  const key = '1/2026/09/evidence.pdf';
  assert.equal(await store.write(key, content), key);
  assert.deepEqual(await store.read(key), content);
  await store.removeNew(key);
  assert.deepEqual(await store.healthCheck(), { status: 'ok', driver: 'POSTGRES' });
  assert.equal(calls[0].params[2], crypto.createHash('sha256').update(content).digest('hex'));
  assert.equal(calls[0].params[3], content.length);
});

test('PostgreSQL 파일 저장소는 위험 키, 빈 파일과 누락 파일을 거부한다', async () => {
  const pool = { async query(sql) {
    if (sql.startsWith('SELECT content')) return { rowCount: 0, rows: [] };
    if (sql.includes('to_regclass')) return { rowCount: 1, rows: [{ name: null }] };
    return { rowCount: 1, rows: [] };
  } };
  const store = new PostgresFileStore(pool);
  assert.throws(() => store.validateKey('../secret.txt'), /Invalid storage key/);
  await assert.rejects(store.write('1/x.pdf', Buffer.alloc(0)), /Invalid file content/);
  await assert.rejects(store.read('1/missing.pdf'), /not found/);
  await assert.rejects(store.healthCheck(), /file_blobs table is missing/);
});
