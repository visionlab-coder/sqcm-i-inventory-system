const test = require('node:test');
const assert = require('node:assert/strict');
const { loadOperationalAdapters } = require('../../src/adapters/loader');

test('external driver는 adapter module 없이 built-in HTTP provider를 로드한다', async () => {
  const adapters = await loadOperationalAdapters({
    operationalAdapterModule: '',
    aiProviderDriver: 'external',
    aiProviderUrl: 'https://ai.example/recommend',
    aiProviderOcrUrl: 'https://ai.example/ocr',
    aiProviderHealthUrl: 'https://ai.example/health',
    aiProviderReadyUrl: 'https://ai.example/ready',
    aiProviderModel: 'pilot-v1',
    aiProviderTimeoutMs: 1000
  });
  assert.equal(adapters.aiProvider.driver, 'HTTP');
  assert.equal(typeof adapters.aiProvider.recommend, 'function');
  assert.equal(typeof adapters.aiProvider.readinessCheck, 'function');
  assert.equal(typeof adapters.aiProvider.ocr.extract, 'function');
});

test('postgres storage driver는 애플리케이션 DB pool에 결합된다', async () => {
  const pool = { query: async () => ({ rows: [{ name: 'file_blobs' }], rowCount: 1 }) };
  const adapters = await loadOperationalAdapters({
    operationalAdapterModule: '',
    aiProviderDriver: 'rules',
    fileStorageDriver: 'postgres'
  }, { pool });
  assert.equal(adapters.fileStore.driver, 'POSTGRES');
  assert.deepEqual(await adapters.fileStore.healthCheck(), { status: 'ok', driver: 'POSTGRES' });
});
