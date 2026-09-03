const test = require('node:test');
const assert = require('node:assert/strict');
const targetModule = import('../../src/operations/production-operational-health-target.mjs');

const window = {
  windowStart: new Date('2026-09-03T20:00:00+09:00'),
  windowEnd: new Date('2026-09-03T23:00:00+09:00')
};

test('기본 운영 health는 loopback 기준선을 사용한다', async () => {
  const { selectProductionOperationalHealthTarget } = await targetModule;
  const result = selectProductionOperationalHealthTarget({ ...window, now: new Date('2026-09-01T18:00:00+09:00') });
  assert.equal(result.status, 'READY_LOOPBACK_OPERATIONAL_BASELINE');
  assert.equal(result.target, 'http://127.0.0.1:3300');
});

test('변경창 밖 공개 operational health를 차단한다', async () => {
  const { selectProductionOperationalHealthTarget, PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION } = await targetModule;
  const result = selectProductionOperationalHealthTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-01T18:00:00+09:00'),
    confirmation: PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION
  });
  assert.equal(result.status, 'FAIL_PUBLIC_OPERATIONAL_HEALTH_OUTSIDE_CHANGE_WINDOW');
});

test('변경창 안에서도 exact 확인 문자열 전에는 대기한다', async () => {
  const { selectProductionOperationalHealthTarget } = await targetModule;
  const result = selectProductionOperationalHealthTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-03T21:00:00+09:00'),
    confirmation: 'wrong'
  });
  assert.equal(result.status, 'READY_WAIT_PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION');
  assert.equal(result.target, null);
});

test('변경창과 확인 문자열이 맞을 때 공개 HTTPS와 내부 운영 증거 결합을 연다', async () => {
  const { selectProductionOperationalHealthTarget, PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION } = await targetModule;
  const result = selectProductionOperationalHealthTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-03T21:00:00+09:00'),
    confirmation: PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION
  });
  assert.equal(result.status, 'READY_PUBLIC_OPERATIONAL_HEALTH_EXECUTION');
  assert.equal(result.target, 'https://inventory.safe-link.co.kr');
  assert.equal(result.actualPostCutoverGate, true);
});
