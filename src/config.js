const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true });

function boundedInteger(value, fallback, name, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name}은(는) ${min}~${max} 범위의 정수여야 합니다.`);
  }
  return parsed;
}

function booleanValue(value, fallback, name) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name}은(는) true 또는 false여야 합니다.`);
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
  if (env.NODE_ENV === 'production' && Buffer.from(String(env.MFA_ENCRYPTION_KEY || ''), 'base64').length !== 32) {
    throw new Error('운영 환경의 MFA_ENCRYPTION_KEY는 base64 32-byte 값이어야 합니다.');
  }

  const fileStorageDriver = String(env.FILE_STORAGE_DRIVER || 'local').toLowerCase();
  if (env.NODE_ENV === 'production' && fileStorageDriver === 'local') throw new Error('Production requires an external file storage provider.');
  if (!['local', 'external'].includes(fileStorageDriver)) throw new Error('FILE_STORAGE_DRIVER must be local or external.');

  const authProvider = String(env.AUTH_PROVIDER || 'local').toLowerCase();
  const aiProviderDriver = String(env.AI_PROVIDER_DRIVER || 'rules').toLowerCase();
  const aiProviderUrl = String(env.AI_PROVIDER_URL || '').trim();
  const aiProviderOcrUrl = String(env.AI_PROVIDER_OCR_URL || '').trim();
  const aiProviderHealthUrl = String(env.AI_PROVIDER_HEALTH_URL || '').trim();
  const aiProviderApiKey = String(env.AI_PROVIDER_API_KEY || '').trim();
  const aiProviderModel = String(env.AI_PROVIDER_MODEL || 'cost-control-v1').trim();
  const aiProviderName = String(env.AI_PROVIDER_NAME || 'external-http').trim();
  const aiProviderTimeoutMs = boundedInteger(env.AI_PROVIDER_TIMEOUT_MS, 12000, 'AI_PROVIDER_TIMEOUT_MS', 1000, 120000);
  const malwareScanDriver = String(env.MALWARE_SCAN_DRIVER || 'mock').toLowerCase();
  const operationalAdapterModule = String(env.OPERATIONAL_ADAPTER_MODULE || '').trim();
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  const isProduction = env.NODE_ENV === 'production';
  const dbAutoMigrate = booleanValue(env.DB_AUTO_MIGRATE, !isProduction, 'DB_AUTO_MIGRATE');
  const dbRunSeeds = booleanValue(env.DB_RUN_SEEDS, !isProduction, 'DB_RUN_SEEDS');
  if (!['local', 'oidc'].includes(authProvider)) throw new Error('AUTH_PROVIDER must be local or oidc.');
  if (!['rules', 'external'].includes(aiProviderDriver)) throw new Error('AI_PROVIDER_DRIVER must be rules or external.');
  if (aiProviderDriver === 'external' && !operationalAdapterModule && (!aiProviderUrl || !aiProviderOcrUrl || !aiProviderHealthUrl)) {
    throw new Error('Built-in external AI requires AI_PROVIDER_URL, AI_PROVIDER_OCR_URL and AI_PROVIDER_HEALTH_URL.');
  }
  if (aiProviderDriver === 'external' && !operationalAdapterModule && env.NODE_ENV === 'production' && [aiProviderUrl, aiProviderOcrUrl, aiProviderHealthUrl].some(url => !/^https:\/\//i.test(url))) {
    throw new Error('Production external AI endpoints must use HTTPS.');
  }
  if (!['mock', 'external'].includes(malwareScanDriver)) throw new Error('MALWARE_SCAN_DRIVER must be mock or external.');
  if (env.NODE_ENV === 'production') {
    if (dbAutoMigrate) throw new Error('Production cannot auto-apply migrations at application startup.');
    if (dbRunSeeds) throw new Error('Production cannot create seed users or sample data.');
    if (authProvider !== 'oidc') throw new Error('Production requires AUTH_PROVIDER=oidc.');
    if (malwareScanDriver !== 'external') throw new Error('Production requires MALWARE_SCAN_DRIVER=external.');
    if (aiProviderDriver !== 'external') throw new Error('Production requires AI_PROVIDER_DRIVER=external.');
    if (!operationalAdapterModule) throw new Error('Production requires OPERATIONAL_ADAPTER_MODULE.');
    if (!/^https:\/\//i.test(String(env.OIDC_REDIRECT_URI || ''))) throw new Error('Production requires an HTTPS OIDC_REDIRECT_URI.');
    if (!/^https:\/\//i.test(publicBaseUrl)) throw new Error('Production requires an HTTPS PUBLIC_BASE_URL.');
    if (!String(env.OIDC_REDIRECT_URI || '').startsWith(`${publicBaseUrl}/`)) throw new Error('OIDC_REDIRECT_URI must belong to PUBLIC_BASE_URL.');
  }

  const mfaEncryptionKey = env.MFA_ENCRYPTION_KEY || require('node:crypto').createHash('sha256').update(`development-mfa:${sessionSecret}`).digest('base64');
  if (Buffer.from(mfaEncryptionKey, 'base64').length !== 32) throw new Error('MFA_ENCRYPTION_KEY는 base64 32-byte 값이어야 합니다.');

  return {
    env: env.NODE_ENV || 'development',
    port: boundedInteger(env.PORT, 3000, 'PORT', 1, 65535),
    databaseUrl: env.DATABASE_URL || 'postgres://seowon:change-me@localhost:5432/seowon_inventory',
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true',
    loginRateLimitMax: boundedInteger(env.LOGIN_RATE_LIMIT_MAX, 10, 'LOGIN_RATE_LIMIT_MAX', 1, 1000),
    loginRateLimitWindowMs: boundedInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 'LOGIN_RATE_LIMIT_WINDOW_MS', 1000, 86_400_000),
    fileStorageDriver,
    fileStorageRoot: env.FILE_STORAGE_ROOT || path.join(process.cwd(), 'artifacts', 'uploads'),
    fileMaxBytes: boundedInteger(env.FILE_MAX_BYTES, 5 * 1024 * 1024, 'FILE_MAX_BYTES', 1024, 5 * 1024 * 1024),
    authProvider,
    aiProviderDriver,
    aiProviderUrl,
    aiProviderOcrUrl,
    aiProviderHealthUrl,
    aiProviderApiKey,
    aiProviderModel,
    aiProviderName,
    aiProviderTimeoutMs,
    malwareScanDriver,
    operationalAdapterModule,
    publicBaseUrl,
    trustedProxyCount: boundedInteger(env.TRUSTED_PROXY_COUNT, 1, 'TRUSTED_PROXY_COUNT', 1, 10),
    oidcRedirectUri: String(env.OIDC_REDIRECT_URI || '').trim(),
    oidcAllowEmailLinking: env.OIDC_ALLOW_EMAIL_LINKING === 'true',
    mfaEncryptionKey,
    dbAutoMigrate,
    dbRunSeeds,
    outboxPublisherRequired: isProduction,
    outboxPollIntervalMs: boundedInteger(env.OUTBOX_POLL_INTERVAL_MS, 5000, 'OUTBOX_POLL_INTERVAL_MS', 1000, 300000),
    outboxBatchSize: boundedInteger(env.OUTBOX_BATCH_SIZE, 20, 'OUTBOX_BATCH_SIZE', 1, 100),
    seedAdminPassword: env.SEED_ADMIN_PASSWORD || 'Admin1234!',
    seedManagerPassword: env.SEED_MANAGER_PASSWORD || 'Manager1234!',
    seedUserPassword: env.SEED_USER_PASSWORD || 'Employee1234!'
  };
}

module.exports = { getConfig, boundedInteger, booleanValue };
