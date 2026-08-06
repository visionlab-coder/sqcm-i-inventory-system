const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true });

function boundedInteger(value, fallback, name, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name}은(는) ${min}~${max} 범위의 정수여야 합니다.`);
  }
  return parsed;
}

function getConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const sessionSecret = env.SESSION_SECRET || 'development-only-change-this-secret-now';

  if (env.NODE_ENV === 'production' && (sessionSecret.startsWith('development-only') || sessionSecret.length < 32)) {
    throw new Error('운영 환경의 SESSION_SECRET은 32자 이상이어야 합니다.');
  }
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'true') {
    throw new Error('운영 환경에서는 COOKIE_SECURE=true가 필요합니다.');
  }

  return {
    env: env.NODE_ENV || 'development',
    port: boundedInteger(env.PORT, 3000, 'PORT', 1, 65535),
    databaseUrl: env.DATABASE_URL || 'postgres://seowon:change-me@localhost:5432/seowon_inventory',
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true',
    loginRateLimitMax: boundedInteger(env.LOGIN_RATE_LIMIT_MAX, 10, 'LOGIN_RATE_LIMIT_MAX', 1, 1000),
    loginRateLimitWindowMs: boundedInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'LOGIN_RATE_LIMIT_WINDOW_MS', 1000, 86_400_000),
    seedAdminPassword: env.SEED_ADMIN_PASSWORD || 'Admin1234!',
    seedManagerPassword: env.SEED_MANAGER_PASSWORD || 'Manager1234!',
    seedUserPassword: env.SEED_USER_PASSWORD || 'Employee1234!'
  };
}

module.exports = { getConfig, boundedInteger };
