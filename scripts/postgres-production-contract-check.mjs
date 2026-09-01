import crypto from 'node:crypto';
import process from 'node:process';
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';

dotenv.config({ quiet: true });
const require = createRequire(import.meta.url);
const { runMigrations, verifyMigrations } = require('../src/db');
const { PostgresFileStore } = require('../src/storage/postgres-file-store');

const { Pool } = pg;
const password = process.env.POSTGRES_PASSWORD || '';
if (!password && !process.env.POSTGRES_VERIFY_ADMIN_URL) throw new Error('POSTGRES_PASSWORD or POSTGRES_VERIFY_ADMIN_URL is required.');
const adminUrl = process.env.POSTGRES_VERIFY_ADMIN_URL || `postgres://seowon:${encodeURIComponent(password)}@127.0.0.1:55432/postgres`;
const databaseName = `seowon_inventory_pgstore_verify_${crypto.randomBytes(6).toString('hex')}`;
if (!/^seowon_inventory_pgstore_verify_[a-f0-9]{12}$/.test(databaseName)) throw new Error('Unsafe verification database name.');

const admin = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 5000 });
let database;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  const targetUrl = new URL(adminUrl);
  targetUrl.pathname = `/${databaseName}`;
  database = new Pool({ connectionString: targetUrl.toString(), max: 2, connectionTimeoutMillis: 5000 });
  await runMigrations(database, 'application');
  const migrations = await verifyMigrations(database);
  const store = new PostgresFileStore(database);
  const key = `1/2026/09/${crypto.randomBytes(20).toString('hex')}.pdf`;
  const content = Buffer.from('%PDF-1.7\nSQCM-i PostgreSQL storage verification\n');
  await store.write(key, content);
  const restored = await store.read(key);
  if (!restored.equals(content)) throw new Error('PostgreSQL file content mismatch.');
  await store.removeNew(key);
  const remaining = await database.query('SELECT count(*)::int count FROM file_blobs');
  if (remaining.rows[0].count !== 0) throw new Error('Verification file cleanup failed.');
  const health = await store.healthCheck();
  console.log(JSON.stringify({ status: 'passed', migrations, storage: health, cleanup: 'passed' }));
} finally {
  if (database) await database.end();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  await admin.end();
}
