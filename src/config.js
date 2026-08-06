const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

function getConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const sessionSecret = env.SESSION_SECRET || 'development-only-change-this-secret-now';

  if (env.NODE_ENV === 'production' && sessionSecret.startsWith('development-only')) {
    throw new Error('운영 환경에서는 SESSION_SECRET을 설정해야 합니다.');
  }

  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || 'postgres://seowon:change-me@localhost:5432/seowon_inventory',
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true',
    seedAdminPassword: env.SEED_ADMIN_PASSWORD || 'Admin1234!',
    seedManagerPassword: env.SEED_MANAGER_PASSWORD || 'Manager1234!'
  };
}

module.exports = { getConfig };
