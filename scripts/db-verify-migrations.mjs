import process from 'node:process';
import dbModule from '../src/db.js';

const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('MIGRATION_DATABASE_URL이 필요합니다.');
  process.exit(2);
}

const pool = dbModule.createPool(databaseUrl);
try {
  const result = await dbModule.verifyMigrations(pool);
  console.log(`migration 일치: ${result.expected}/${result.applied}`);
} finally {
  await pool.end();
}
