const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('production cutover preflight HTTP 응답은 bounded JSON object reader로 fail-closed한다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../scripts/production-cutover-preflight.mjs'),
    'utf8'
  );

  assert.match(source, /readBoundedJsonObjectResponse/);
  assert.match(source, /await readBoundedJsonObjectResponse\(response\)/);
  assert.doesNotMatch(source, /response\.arrayBuffer\(\)/);
  assert.match(source, /AbortSignal\.timeout\(5000\)/);
});
