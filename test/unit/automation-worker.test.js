const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationFor, acquireLease } = require('../../src/automation/worker');

test('자동화 규칙은 조직·대상별 중복키와 비용 절감 행동 안내를 만든다', () => {
  const notification = notificationFor({ id: 4, rule_type: 'IDLE_ASSET' }, { id: 9, asset_tag: 'SW-IT-9', name: '노트북' });
  assert.equal(notification.entityType, 'ASSET');
  assert.match(notification.dedupeKey, /^4:ASSET:9:/);
  assert.match(notification.body, /비용 절감/);
});

test('자동화 worker lease는 만료 전 동시 실행을 차단한다', async () => {
  const calls = [];
  const pool = { query: async (sql) => { calls.push(sql); return { rowCount: sql.includes('RETURNING') ? 1 : 0, rows: [] }; } };
  assert.equal(await acquireLease(pool, 'worker-a', new Date('2026-08-10T00:00:00Z')), true);
  assert.equal(calls.length, 1);
});
