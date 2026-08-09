const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, organization } = require('../../src/services/ai-service');

test('자연어 자산 검색은 허용된 필터로만 정규화한다', () => {
  const intent = parseSearch({ q: '유휴 자산 SW-IT-0001 찾아줘; DROP TABLE assets' });
  assert.equal(intent.intent, 'asset_search');
  assert.equal(intent.filters.idle, true);
  assert.equal(intent.filters.q, 'sw-it-0001');
  assert.equal(intent.normalizedQuery.includes('drop table'), true);
});

test('AI 조직 계약은 타 조직을 차단한다', () => {
  assert.throws(() => organization({ organizationId: 1, isSystemAdmin: false }, 2), error => error.status === 403);
  assert.equal(organization({ organizationId: 1, isSystemAdmin: false }, 1), 1);
});
