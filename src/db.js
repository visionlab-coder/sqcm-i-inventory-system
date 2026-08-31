const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { migrationChecksum, migrationChecksumCandidates } = require('./migration-checksum');

function createPool(connectionString) {
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, query_timeout: 6_000, statement_timeout: 5_000 });
  // DB 재시작으로 유휴 연결이 종료되더라도 Node의 unhandled error로 앱 전체가
  // 즉시 종료되지 않게 한다. 신규 요청은 pool의 새 연결을 사용하고 /health가 상태를 알린다.
  pool.on('error', error => console.error(JSON.stringify({ event: 'database_pool_error', code: error.code || null, message: error.message })));
  return pool;
}

const MIGRATION_TARGETS = new Set(['application', 'supabase']);

function validateMigrationTargetManifest(files, manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.migrations)) {
    throw new Error('migration target manifest schema is invalid.');
  }
  const entries = manifest.migrations;
  const manifestFiles = entries.map(entry => entry?.file);
  if (new Set(manifestFiles).size !== manifestFiles.length) {
    throw new Error('migration target manifest contains duplicate files.');
  }
  if (files.length !== manifestFiles.length || files.some((file, index) => manifestFiles[index] !== file)) {
    throw new Error('migration target manifest must enumerate every migration in filename order.');
  }
  for (const entry of entries) {
    if (!Array.isArray(entry.targets) || entry.targets.length === 0 || new Set(entry.targets).size !== entry.targets.length) {
      throw new Error(`migration target manifest has invalid targets: ${entry.file || 'unknown'}.`);
    }
    if (entry.targets.some(target => !MIGRATION_TARGETS.has(target))) {
      throw new Error(`migration target manifest has unsupported target: ${entry.file}.`);
    }
  }
  return entries;
}

async function migrationFilesForTarget(target) {
  if (!MIGRATION_TARGETS.has(target)) throw new Error(`Unsupported migration target: ${target}.`);
  const migrationDir = path.join(process.cwd(), 'db', 'migrations');
  const files = (await fs.readdir(migrationDir)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  const manifestPath = path.join(process.cwd(), 'db', 'migration-targets.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entries = validateMigrationTargetManifest(files, manifest);
  return entries.filter(entry => entry.targets.includes(target)).map(entry => entry.file);
}

async function runMigrations(pool, target = 'application') {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [9142026]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const migrationDir = path.join(process.cwd(), 'db', 'migrations');
    const files = await migrationFilesForTarget(target);
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
      const checksum = migrationChecksum(sql);
      const applied = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [file]);
      if (applied.rowCount) {
        if (!migrationChecksumCandidates(sql).has(applied.rows[0].checksum)) throw new Error(`적용된 migration이 변경되었습니다: ${file}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [9142026]).catch(() => {});
    client.release();
  }
}

async function verifyMigrations(pool) {
  const migrationDir = path.join(process.cwd(), 'db', 'migrations');
  const files = await migrationFilesForTarget('application');
  const exists = await pool.query("SELECT to_regclass('public.schema_migrations') name");
  if (!exists.rows[0]?.name) throw new Error('schema_migrations table is missing. Run the approved migration job first.');
  const applied = await pool.query('SELECT version,checksum FROM schema_migrations ORDER BY version');
  if (applied.rowCount !== files.length || applied.rows.some((row, index) => row.version !== files[index])) {
    throw new Error(`application migration target mismatch: expected ${files.length}, applied ${applied.rowCount}.`);
  }
  const byVersion = new Map(applied.rows.map(row => [row.version, row.checksum]));
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    if (!byVersion.has(file)) throw new Error(`적용되지 않은 migration입니다: ${file}`);
    if (!migrationChecksumCandidates(sql).has(byVersion.get(file))) throw new Error(`적용된 migration이 변경되었습니다: ${file}`);
  }
  return { expected: files.length, applied: applied.rowCount };
}

function normalizedProviderSql(sql) {
  return String(sql || '').replace(/\r\n?/g, '\n').trimEnd();
}

async function verifySupabaseMigrations(pool) {
  const migrationDir = path.join(process.cwd(), 'db', 'migrations');
  const files = await migrationFilesForTarget('supabase');
  const exists = await pool.query("SELECT to_regclass('supabase_migrations.schema_migrations') name");
  if (!exists.rows[0]?.name) throw new Error('Supabase migration history is missing. Run the approved provider migration job first.');
  const applied = await pool.query("SELECT name,statements FROM supabase_migrations.schema_migrations WHERE name LIKE 'sqcmi_%' ORDER BY version");
  if (applied.rowCount !== files.length) {
    throw new Error(`Supabase migration count mismatch: expected ${files.length}, applied ${applied.rowCount}.`);
  }
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const expectedName = `sqcmi_${file.replace(/\.sql$/, '')}`;
    const row = applied.rows[index];
    if (row.name !== expectedName) throw new Error(`Supabase migration order mismatch: expected ${expectedName}, applied ${row.name || 'missing'}.`);
    if (!Array.isArray(row.statements) || row.statements.length !== 1) throw new Error(`Supabase migration statement contract mismatch: ${expectedName}.`);
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    if (normalizedProviderSql(row.statements[0]) !== normalizedProviderSql(sql)) {
      throw new Error(`Supabase migration content mismatch: ${expectedName}.`);
    }
  }
  return { expected: files.length, applied: applied.rowCount, history: 'supabase' };
}

async function verifyMigrationHistory(pool, mode = 'application') {
  if (mode === 'application') return verifyMigrations(pool);
  if (mode === 'supabase') return verifySupabaseMigrations(pool);
  throw new Error(`Unsupported migration history mode: ${mode}.`);
}

async function ensureSeedUsers(pool, config) {
  const users = [
    ['admin@seowon.local', '관리자', 'ADMIN', config.seedAdminPassword],
    ['manager@seowon.local', '비품 담당자', 'MANAGER', config.seedManagerPassword],
    ['employee@seowon.local', '현장 직원', 'USER', config.seedUserPassword]
  ];

  for (const [email, displayName, role, password] of users) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, status, organization_id, department_id)
       VALUES ($1, $2, $3, $4, 'ACTIVE', (SELECT id FROM organizations WHERE code='SEOWON'), (SELECT id FROM departments WHERE code='HQ' LIMIT 1))
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,failed_login_count=0,locked_until=NULL,organization_id=COALESCE(users.organization_id,EXCLUDED.organization_id),department_id=COALESCE(users.department_id,EXCLUDED.department_id)`,
      [email, displayName, hash, role]
    );
  }
}

async function initializeDatabase(pool, config) {
  if (config.dbAutoMigrate) await runMigrations(pool);
  else await verifyMigrationHistory(pool, config.dbMigrationHistoryMode);
  if (!config.dbRunSeeds) return;
  await ensureSeedUsers(pool, config);
  const seedDir = path.join(process.cwd(), 'db', 'seeds');
  const seedFiles = (await fs.readdir(seedDir)).filter(file => /^\d+.*\.sql$/.test(file)).sort();
  for (const file of seedFiles) await runSqlFile(pool, path.join('db', 'seeds', file));
}

async function runSqlFile(pool, relativePath) {
  const sql = await fs.readFile(path.join(process.cwd(), relativePath), 'utf8');
  await pool.query(sql);
}

module.exports = { createPool, initializeDatabase, runMigrations, verifyMigrations, verifySupabaseMigrations, verifyMigrationHistory, normalizedProviderSql, migrationFilesForTarget, validateMigrationTargetManifest };
