import process from 'node:process';
import dbModule from '../src/db.js';

const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('MIGRATION_DATABASE_URL이 필요합니다.');
  process.exit(2);
}
const target = String(process.env.DB_MIGRATION_TARGET || 'application').trim().toLowerCase();
if (target !== 'application') {
  console.error('db:migrate는 application target만 적용합니다. Supabase migration은 승인된 provider migration job을 사용해야 합니다.');
  process.exit(2);
}

const pool = dbModule.createPool(databaseUrl);
try {
  await dbModule.runMigrations(pool, target);
  const result = await dbModule.verifyMigrations(pool);
  console.log(`승인 migration 적용·검증 통과 (${target}): ${result.expected}/${result.applied}`);
} finally {
  await pool.end();
}
