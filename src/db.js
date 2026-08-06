const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

function createPool(connectionString) {
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  // DB 재시작으로 유휴 연결이 종료되더라도 Node의 unhandled error로 앱 전체가
  // 즉시 종료되지 않게 한다. 신규 요청은 pool의 새 연결을 사용하고 /health가 상태를 알린다.
  pool.on('error', error => console.error('PostgreSQL 유휴 연결 오류:', error.code || error.message));
  return pool;
}

async function runSqlFile(pool, relativePath) {
  const sql = await fs.readFile(path.join(process.cwd(), relativePath), 'utf8');
  await pool.query(sql);
}

async function ensureSeedUsers(pool, config) {
  const users = [
    ['admin@seowon.local', '관리자', 'ADMIN', config.seedAdminPassword],
    ['manager@seowon.local', '비품 담당자', 'MANAGER', config.seedManagerPassword]
  ];

  for (const [email, displayName, role, password] of users) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (email) DO NOTHING`,
      [email, displayName, hash, role]
    );
  }
}

async function initializeDatabase(pool, config) {
  await runSqlFile(pool, 'db/migrations/001_init.sql');
  await runSqlFile(pool, 'db/seeds/001_items.sql');
  await ensureSeedUsers(pool, config);
}

module.exports = { createPool, initializeDatabase };
