const test = require('node:test');
const assert = require('node:assert/strict');
const { createHttpAiProvider, jsonContent } = require('../../src/adapters/http-ai-provider');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}

test('HTTP AI provider는 추천·OCR·health 계약과 인증 헤더를 지킨다', async () => {
  const calls = [];
  const provider = createHttpAiProvider({
    aiProviderUrl: 'https://ai.example/recommend',
    aiProviderOcrUrl: 'https://ai.example/ocr',
    aiProviderHealthUrl: 'https://ai.example/health',
    aiProviderApiKey: 'secret-not-logged',
    aiProviderModel: 'pilot-v1',
    aiProviderName: 'pilot-ai',
    aiProviderTimeoutMs: 1000
  }, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return response({ status: 'ok' });
    if (url.endsWith('/ocr')) return response({ fields: { assetTag: 'IT-001' }, confidence: { assetTag: 0.94 }, usage: { total_tokens: 11 } });
    return response({ choices: [{ message: { content: '```json\n{"recommendations":[{"assetId":7,"actionType":"TRANSFER","estimatedCost":10,"avoidedCost":100,"confidence":0.91,"evidence":["idle"]}]}\n```' } }], usage: { total_tokens: 22 } });
  });
  const recommendation = await provider.recommend({ organizationId: 3, assets: [{ id: 7 }] });
  const extraction = await provider.ocr.extract({ organizationId: 3, assetId: 7, text: 'asset' });
  const health = await provider.healthCheck();
  assert.equal(recommendation.recommendations[0].assetId, 7);
  assert.equal(extraction.fields.assetTag, 'IT-001');
  assert.equal(health.status, 'ok');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-not-logged');
  assert.equal(calls[0].options.body.includes('secret-not-logged'), false);
  assert.equal(calls.length, 3);
});

test('HTTP AI provider JSON 파서는 코드 펜스와 잘못된 응답을 구분한다', () => {
  assert.deepEqual(jsonContent('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => jsonContent('not-json'), /no JSON object/);
});
