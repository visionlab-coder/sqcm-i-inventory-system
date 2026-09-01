const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig, boundedInteger } = require('../../src/config');
const { createApp } = require('../../src/app');

test('운영 설정은 안전한 세션 비밀과 secure cookie를 강제한다', () => {
  const mfaKey = Buffer.alloc(32, 7).toString('base64');
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'short', COOKIE_SECURE: 'true' }), /32자/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: '' }), /MFA_ENCRYPTION_KEY/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey }), /external or PostgreSQL file storage/);
  assert.throws(() => getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey, FILE_STORAGE_DRIVER: 'external', DB_AUTO_MIGRATE: 'false', DB_RUN_SEEDS: 'false' }), /PRODUCTION_LOCAL_AUTH_MFA_REQUIRED/);
  const config = getConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'true', MFA_ENCRYPTION_KEY: mfaKey, FILE_STORAGE_DRIVER: 'external', AUTH_PROVIDER:'oidc', MALWARE_SCAN_DRIVER:'external', AI_PROVIDER_DRIVER:'external', OPERATIONAL_ADAPTER_MODULE:'C:/runtime/adapters.js', PUBLIC_BASE_URL:'https://inventory.example', OIDC_REDIRECT_URI:'https://inventory.example/api/auth/oidc/callback', SUPABASE_URL:'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test', DB_AUTO_MIGRATE:'false', DB_RUN_SEEDS:'false' });
  assert.equal(config.cookieSecure, true);
  assert.equal(config.publicBaseUrl, 'https://inventory.example');
  assert.equal(config.trustedProxyCount, 1);
  assert.equal(config.dbAutoMigrate, false);
  assert.equal(config.dbRunSeeds, false);
  assert.equal(config.dbMigrationHistoryMode, 'application');
  assert.equal(config.automationWorkerEnabled, true);
  assert.equal(getConfig({ AUTOMATION_WORKER_ENABLED: 'false' }).automationWorkerEnabled, false);
  assert.throws(()=>createApp({pool:{},config}),/fileStore cannot use the LOCAL driver/);
});
test('Production 무료 PostgreSQL 구성은 로컬 인증 MFA와 DB 파일 저장을 강제한다', () => {
  const base={NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),COOKIE_SECURE:'true',MFA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),FILE_STORAGE_DRIVER:'postgres',AUTH_PROVIDER:'local',MALWARE_SCAN_DRIVER:'external',AI_PROVIDER_DRIVER:'external',OPERATIONAL_ADAPTER_MODULE:'adapter.js',PUBLIC_BASE_URL:'https://inventory.safe-link.co.kr',DB_AUTO_MIGRATE:'false',DB_RUN_SEEDS:'false'};
  assert.throws(() => getConfig(base), /PRODUCTION_LOCAL_AUTH_MFA_REQUIRED/);
  const config = getConfig({...base,PRODUCTION_LOCAL_AUTH_MFA_REQUIRED:'true'});
  assert.equal(config.fileStorageDriver, 'postgres');
  assert.equal(config.authProvider, 'local');
  assert.equal(config.localAuthMfaRequired, true);
  assert.equal(config.oidcRedirectUri, '');
  const pool={on(){},query(){return Promise.resolve({rows:[]});}};
  const fileStore={driver:'POSTGRES',async write(){},async read(){},async removeNew(){},async healthCheck(){return{status:'ok'};}};
  const malwareScanner={driver:'MICROSOFT_DEFENDER_BRIDGE',async scan(){return{status:'clean'};},async healthCheck(){return{status:'ok'};}};
  const aiProvider={async recommend(){return{recommendations:[]};},async healthCheck(){return{status:'ok'};},async readinessCheck(){return{status:'ready'};},ocr:{async extract(){return{fields:{},confidence:{}};}}};
  const eventPublisher={async publish(){return{id:'receipt'};},async healthCheck(){return{status:'ok'};}};
  assert.doesNotThrow(()=>createApp({pool,config,fileStore,malwareScanner,aiProvider,eventPublisher}));
});
test('migration history mode is explicit and fail-closed', () => {
  assert.equal(getConfig({ DB_MIGRATION_HISTORY_MODE: 'supabase' }).dbMigrationHistoryMode, 'supabase');
  assert.throws(() => getConfig({ DB_MIGRATION_HISTORY_MODE: 'auto' }), /application or supabase/);
});

test('production은 앱 시작 migration과 seed를 거부한다', () => {
  const base={NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),COOKIE_SECURE:'true',MFA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),FILE_STORAGE_DRIVER:'external',AUTH_PROVIDER:'oidc',MALWARE_SCAN_DRIVER:'external',AI_PROVIDER_DRIVER:'external',OPERATIONAL_ADAPTER_MODULE:'adapter.js',PUBLIC_BASE_URL:'https://inventory.example',OIDC_REDIRECT_URI:'https://inventory.example/api/auth/oidc/callback',SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',DB_AUTO_MIGRATE:'false',DB_RUN_SEEDS:'false'};
  assert.throws(()=>getConfig({...base,DB_AUTO_MIGRATE:'true'}),/cannot auto-apply/);
  assert.throws(()=>getConfig({...base,DB_RUN_SEEDS:'true',SEED_ADMIN_PASSWORD:'a',SEED_MANAGER_PASSWORD:'b',SEED_USER_PASSWORD:'c'}),/cannot create seed/);
});
test('운영 공개 URL은 HTTPS이고 OIDC callback의 기준 origin이어야 한다', () => {
  const base={NODE_ENV:'production',SESSION_SECRET:'x'.repeat(32),COOKIE_SECURE:'true',MFA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),FILE_STORAGE_DRIVER:'external',AUTH_PROVIDER:'oidc',MALWARE_SCAN_DRIVER:'external',AI_PROVIDER_DRIVER:'external',OPERATIONAL_ADAPTER_MODULE:'adapter.js',SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',DB_AUTO_MIGRATE:'false',DB_RUN_SEEDS:'false'};
  assert.throws(()=>getConfig({...base,PUBLIC_BASE_URL:'http://inventory.example',OIDC_REDIRECT_URI:'https://inventory.example/callback'}),/PUBLIC_BASE_URL/);
  assert.throws(()=>getConfig({...base,PUBLIC_BASE_URL:'https://inventory.example',OIDC_REDIRECT_URI:'https://other.example/callback'}),/belong/);
});
test('포트와 레이트리밋 설정은 허용 범위의 정수만 받는다', () => {
  assert.equal(boundedInteger('10', 5, 'VALUE', 1, 20), 10);
  assert.throws(() => boundedInteger('NaN', 5, 'VALUE', 1, 20), /범위/);
  assert.throws(() => getConfig({ PORT: '70000' }), /PORT/);
});
test('seed creation requires runtime-provided passwords', () => {
  assert.throws(() => getConfig({ DB_RUN_SEEDS: 'true', SEED_ADMIN_PASSWORD: '', SEED_MANAGER_PASSWORD: '', SEED_USER_PASSWORD: '' }), /SEED_\*_PASSWORD/);
  const config = getConfig({ DB_RUN_SEEDS: 'true', SEED_ADMIN_PASSWORD: 'runtime-a', SEED_MANAGER_PASSWORD: 'runtime-b', SEED_USER_PASSWORD: 'runtime-c' });
  assert.equal(config.seedAdminPassword, 'runtime-a');
});
test('built-in external AI endpoint and timeout configuration', () => {
  assert.throws(() => getConfig({ AI_PROVIDER_DRIVER: 'external' }), /AI_PROVIDER_URL/);
  const config = getConfig({ AI_PROVIDER_DRIVER: 'external', AI_PROVIDER_URL: 'https://ai.example/recommend', AI_PROVIDER_OCR_URL: 'https://ai.example/ocr', AI_PROVIDER_HEALTH_URL: 'https://ai.example/health', AI_PROVIDER_READY_URL: 'https://ai.example/ready', AI_PROVIDER_MODEL: 'pilot-v1', AI_PROVIDER_TIMEOUT_MS: '5000' });
  assert.equal(config.aiProviderModel, 'pilot-v1');
  assert.equal(config.aiProviderReadyUrl, 'https://ai.example/ready');
  assert.equal(config.aiProviderTimeoutMs, 5000);
});
