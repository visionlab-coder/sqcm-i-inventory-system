const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('AI PC Production은 별도 project와 loopback frontend만 사용한다', () => {
  const compose = fs.readFileSync(path.join(process.cwd(), 'compose.ai-production.yaml'), 'utf8');
  assert.match(compose, /^name:\s*seowon-inventory-production$/m);
  assert.match(compose, /127\.0\.0\.1:\$\{FRONTEND_PORT:-3300\}:80/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:|\[::\]:/);
  assert.equal((compose.match(/ports:\s*!override\s*\[\]/g) || []).length, 2);
  assert.equal((compose.match(/^\s{4}cpus:/gm) || []).length, 3);
  assert.equal((compose.match(/^\s{4}mem_limit:/gm) || []).length, 3);
  assert.match(compose, /ai-pc-production-operational-adapters\.js/);
  assert.match(compose, /sqcmi-inventory-production-ai-secret/);
  assert.match(compose, /host\.docker\.internal:18766\/security\/scan/);
  assert.match(compose, /EVENT_PUBLISHER_API_KEY_FILE:\s*\/run\/secrets\/ai_provider_api_key/);
});
