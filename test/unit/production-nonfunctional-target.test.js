const test = require('node:test');
const assert = require('node:assert/strict');
const targetModule = import('../../src/operations/production-nonfunctional-target.mjs');

const window = {
  windowStart: new Date('2026-09-11T20:00:00+09:00'),
  windowEnd: new Date('2026-09-11T23:00:00+09:00')
};

test('기본 실행은 loopback 기준선만 허용한다', async () => {
  const { selectProductionNonfunctionalTarget } = await targetModule;
  const result = selectProductionNonfunctionalTarget({ ...window, now: new Date('2026-09-01T18:00:00+09:00') });
  assert.equal(result.target, 'http://127.0.0.1:3300');
  assert.equal(result.allowRemote, false);
});

test('변경창 밖 공개 부하 시험을 차단한다', async () => {
  const { selectProductionNonfunctionalTarget, PUBLIC_NONFUNCTIONAL_CONFIRMATION } = await targetModule;
  const result = selectProductionNonfunctionalTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-01T18:00:00+09:00'),
    confirmation: PUBLIC_NONFUNCTIONAL_CONFIRMATION
  });
  assert.equal(result.status, 'FAIL_PUBLIC_NONFUNCTIONAL_OUTSIDE_CHANGE_WINDOW');
});

test('변경창 안에서도 정확한 확인 문자열 전에는 대기한다', async () => {
  const { selectProductionNonfunctionalTarget } = await targetModule;
  const result = selectProductionNonfunctionalTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-11T21:00:00+09:00'),
    confirmation: 'wrong'
  });
  assert.equal(result.status, 'READY_WAIT_PUBLIC_NONFUNCTIONAL_CONFIRMATION');
  assert.equal(result.target, null);
});

test('변경창과 확인 문자열이 맞을 때만 exact Production HTTPS를 연다', async () => {
  const { selectProductionNonfunctionalTarget, PUBLIC_NONFUNCTIONAL_CONFIRMATION } = await targetModule;
  const result = selectProductionNonfunctionalTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-11T21:00:00+09:00'),
    confirmation: PUBLIC_NONFUNCTIONAL_CONFIRMATION
  });
  assert.equal(result.status, 'READY_PUBLIC_NONFUNCTIONAL_EXECUTION');
  assert.equal(result.target, 'https://inventory.safe-link.co.kr');
  assert.equal(result.allowRemote, true);
  assert.equal(result.actualPublicGate, true);
});
