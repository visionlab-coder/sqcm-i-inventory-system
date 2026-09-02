const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-role-core-smoke-runtime.mjs');

test('Production role smoke JSON 응답은 bounded object reader를 사용한다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/operations/production-role-core-smoke-runtime.mjs'),
    'utf8'
  );
  assert.match(source, /readBoundedJsonObjectResponse/);
  assert.match(source, /await readBoundedJsonObjectResponse\(response\)/);
  assert.doesNotMatch(source, /response\.json\(\)/);
});

test('과대 role smoke 응답은 body read 전에 빈 객체로 fail-closed한다', async () => {
  const { readRoleSmokeJson } = await runtimeModule;
  let bodyRead = false;
  const result = await readRoleSmokeJson({
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(1024 * 1024 + 1) : null },
    body: { getReader: () => { bodyRead = true; throw new Error('sensitive body'); } }
  });
  assert.deepEqual(result, {});
  assert.equal(bodyRead, false);
});
