const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-csrf-idempotency-baseline-runtime.mjs');

test('CSRF/idempotency baseline JSON 응답은 bounded object reader를 사용한다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/operations/production-csrf-idempotency-baseline-runtime.mjs'),
    'utf8'
  );
  assert.match(source, /readBoundedJsonObjectResponse/);
  assert.match(source, /await readBoundedJsonObjectResponse\(response\)/);
  assert.doesNotMatch(source, /response\.json\(\)/);
});

test('과대 CSRF baseline 응답은 body read 전에 빈 객체로 fail-closed한다', async () => {
  const { readCsrfIdempotencyBaselineJson } = await runtimeModule;
  let bodyRead = false;
  const result = await readCsrfIdempotencyBaselineJson({
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(1024 * 1024 + 1) : null },
    body: { getReader: () => { bodyRead = true; throw new Error('csrf-response-raw'); } }
  });
  assert.deepEqual(result, {});
  assert.equal(bodyRead, false);
});
