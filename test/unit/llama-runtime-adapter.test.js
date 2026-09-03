const test = require('node:test');
const assert = require('node:assert/strict');
const { createLlamaRuntimeAdapter, jsonObject, loopbackUrl, validateOcrResult } = require('../../src/bridge/llama-runtime-adapter');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('llama runtime adapter는 loopback health와 JSON 추천·OCR만 사용한다', async () => {
  const calls = [];
  const adapter = createLlamaRuntimeAdapter({ runtimeUrl: 'http://127.0.0.1:18767', timeoutMs: 1000, apiKey: 'runtime-test-key' }, async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/health')) return response({ status: 'ok' });
    const body = JSON.parse(options.body);
    if (body.messages[0].content.includes('cost-control')) return response({ choices: [{ message: { content: '```json\n{"recommendations":[{"assetId":7,"actionType":"HOLD"}]}\n```' } }], usage: { total_tokens: 10 } });
    return response({ choices: [{ message: { content: '{"fields":{"assetTag":"IT-007"},"confidence":{"assetTag":0.9}}' } }] });
  });
  assert.equal((await adapter.ready({ modelVersion: 'v1' })).ready, true);
  assert.equal((await adapter.recommend({ organizationId: 3, query: {}, assets: [{ id: 7 }] })).recommendations[0].assetId, 7);
  const extraction = await adapter.ocr({ organizationId: 3, text: 'tag' });
  assert.equal(extraction.fields.assetTag, 'IT-007');
  assert.equal(extraction.confidence.assetTag, 0.9);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers.authorization, 'Bearer runtime-test-key');
  assert.equal(JSON.parse(calls[1].options.body).temperature, 0);
  const ocrRequest = JSON.parse(calls[2].options.body);
  assert.equal(ocrRequest.response_format.type, 'json_object');
  assert.equal(ocrRequest.response_format.schema.additionalProperties, false);
  assert.deepEqual(ocrRequest.response_format.schema.required, ['fields', 'confidence']);
});

test('llama runtime adapter는 비-loopback URL과 HTTP 실패를 차단한다', async () => {
  assert.throws(() => loopbackUrl('http://172.30.1.85:18767'), /loopback/);
  assert.throws(() => createLlamaRuntimeAdapter({ runtimeUrl: 'http://localhost:18767' }), /API key/);
  const adapter = createLlamaRuntimeAdapter({ runtimeUrl: 'http://localhost:18767', timeoutMs: 1000, apiKey: 'runtime-test-key' }, async () => response({ error: 'down' }, 503));
  await assert.rejects(() => adapter.ready({}), /HTTP 503/);
});

test('llama runtime JSON 파서는 첫 번째 균형 객체 뒤 설명을 무시한다', () => {
  assert.deepEqual(jsonObject('{"fields":{"note":"brace } text"},"confidence":{}}\nadditional {"ignored":true}', 'ocr'), { fields: { note: 'brace } text' }, confidence: {} });
  assert.throws(() => jsonObject('{"fields":', 'ocr'), /complete JSON/);
});

test('llama runtime OCR 검증은 완화 변환 없이 schema 위반을 fail-closed 한다', () => {
  assert.throws(() => validateOcrResult({ assetTag: 'IT-007', confidence: 0.9 }), /structured schema/);
  assert.throws(() => validateOcrResult({ fields: { assetTag: 'IT-007' }, confidence: { assetTag: 1.1 } }), /structured schema/);
  assert.throws(() => validateOcrResult({ fields: { assetTag: 'IT-007' }, confidence: {} }), /structured schema/);
  assert.deepEqual(validateOcrResult({ fields: { assetTag: 'IT-007' }, confidence: { assetTag: 0.9 } }), { fields: { assetTag: 'IT-007' }, confidence: { assetTag: 0.9 } });
});
