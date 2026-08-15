const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationFor, acquireLease } = require('../../src/automation/worker');
const { createAutomationScheduler } = require('../../src/automation/scheduler');

test('자동화 규칙은 조직·대상별 중복키와 비용 절감 행동 안내를 만든다', () => {
  const notification = notificationFor({ id: 4, rule_type: 'IDLE_ASSET' }, { id: 9, asset_tag: 'SW-IT-9', name: '노트북' });
  assert.equal(notification.entityType, 'ASSET');
  assert.match(notification.dedupeKey, /^4:ASSET:9:/);
  assert.match(notification.body, /비용 절감/);
});

test('자동화 scheduler는 backend 내부에서 중복 실행을 막고 종료할 수 있다', async () => {
  let callback;
  let cleared = false;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const scheduler = createAutomationScheduler({
    pool: {}, intervalMs: 60000,
    runOnce: async () => { calls += 1; await pending; return { skipped: false, runs: [] }; },
    setIntervalFn: fn => { callback = fn; return { unref() {} }; },
    clearIntervalFn: () => { cleared = true; },
    logger: { log() {}, error() {} }
  });
  const first = callback();
  assert.deepEqual(await scheduler.tick(), { skipped: true, reason: 'already-running' });
  release();
  await first;
  assert.equal(calls, 1);
  scheduler.stop();
  assert.equal(cleared, true);
});

test('자동화 worker lease는 만료 전 동시 실행을 차단한다', async () => {
  const calls = [];
  const pool = { query: async (sql) => { calls.push(sql); return { rowCount: sql.includes('RETURNING') ? 1 : 0, rows: [] }; } };
  assert.equal(await acquireLease(pool, 'worker-a', new Date('2026-08-10T00:00:00Z')), true);
  assert.equal(calls.length, 1);
});
