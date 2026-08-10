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
    aiProviderModel: 'pilot-v1',
    aiProviderTimeoutMs: 1000
  });
  assert.equal(adapters.aiProvider.driver, 'HTTP');
  assert.equal(typeof adapters.aiProvider.recommend, 'function');
  assert.equal(typeof adapters.aiProvider.ocr.extract, 'function');
});
