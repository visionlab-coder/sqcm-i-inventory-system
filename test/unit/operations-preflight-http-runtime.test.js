const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimePromise = import('../../src/operations/operations-preflight-http-runtime.mjs');

function mockResponse(chunks, { contentLength = null } = {}) {
  let index = 0;
  let cancelled = false;
  return {
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? contentLength : null },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          async cancel() { cancelled = true; }
        };
      }
    },
    get cancelled() { return cancelled; }
  };
}

test('declared Content-Length가 1MiB를 넘으면 body read 전에 차단한다', async () => {
  const { consumeBoundedResponseBody, OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES } = await runtimePromise;
  const response = mockResponse([], { contentLength: String(OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES + 1) });
  await assert.rejects(consumeBoundedResponseBody(response), /OPERATIONS_PREFLIGHT_RESPONSE_TOO_LARGE/);
});

test('chunked actual bytes가 1MiB를 넘으면 reader를 취소한다', async () => {
  const { consumeBoundedResponseBody, OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES } = await runtimePromise;
  const response = mockResponse([new Uint8Array(OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES + 1)]);
  await assert.rejects(consumeBoundedResponseBody(response), /OPERATIONS_PREFLIGHT_RESPONSE_TOO_LARGE/);
  assert.equal(response.cancelled, true);
});

test('OIDC discovery는 fatal UTF-8 JSON object만 허용한다', async () => {
  const { readBoundedJsonObjectResponse } = await runtimePromise;
  await assert.rejects(readBoundedJsonObjectResponse(mockResponse([Uint8Array.from([0xc3, 0x28])])), /OPERATIONS_PREFLIGHT_RESPONSE_INVALID_UTF8/);
  await assert.rejects(readBoundedJsonObjectResponse(mockResponse([Buffer.from('[]')])), /OPERATIONS_PREFLIGHT_RESPONSE_INVALID_JSON_OBJECT/);
  await assert.rejects(readBoundedJsonObjectResponse(mockResponse([Buffer.from('{invalid}')])), /OPERATIONS_PREFLIGHT_RESPONSE_INVALID_JSON_OBJECT/);
  assert.deepEqual(await readBoundedJsonObjectResponse(mockResponse([Buffer.from('{"issuer":"https://issuer.example"}')])), { issuer: 'https://issuer.example' });
});

test('malformed Content-Length는 fail-closed한다', async () => {
  const { consumeBoundedResponseBody } = await runtimePromise;
  await assert.rejects(consumeBoundedResponseBody(mockResponse([], { contentLength: 'not-a-number' })), /OPERATIONS_PREFLIGHT_RESPONSE_INVALID_CONTENT_LENGTH/);
});

test('operations preflight 진입점은 bounded reader를 사용하고 무제한 body helper를 제거한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/operations-preflight.mjs'), 'utf8');
  assert.match(source, /consumeBoundedResponseBody/);
  assert.match(source, /readBoundedJsonObjectResponse/);
  assert.doesNotMatch(source, /response\.arrayBuffer\(\)/);
  assert.doesNotMatch(source, /discoveryResponse\.json\(\)/);
});
