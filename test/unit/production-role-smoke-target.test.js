const test = require('node:test');
const assert = require('node:assert/strict');
const targetModule = import('../../src/operations/production-role-smoke-target.mjs');

const window = {
  windowStart: new Date('2026-09-03T20:00:00+09:00'),
  windowEnd: new Date('2026-09-03T23:00:00+09:00')
};

test('기본 역할 smoke는 loopback 기준선만 사용한다', async () => {
  const { selectProductionRoleSmokeTarget } = await targetModule;
  const result = selectProductionRoleSmokeTarget({ ...window, now: new Date('2026-09-01T18:00:00+09:00') });
  assert.equal(result.target, 'http://127.0.0.1:3300');
  assert.equal(result.actualProductionGate, false);
});

test('변경창 밖 공개 역할 smoke를 차단한다', async () => {
  const { selectProductionRoleSmokeTarget, PUBLIC_ROLE_SMOKE_CONFIRMATION } = await targetModule;
  const result = selectProductionRoleSmokeTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-01T18:00:00+09:00'),
    confirmation: PUBLIC_ROLE_SMOKE_CONFIRMATION
  });
  assert.equal(result.status, 'FAIL_PUBLIC_ROLE_SMOKE_OUTSIDE_CHANGE_WINDOW');
});

test('변경창 안에서도 exact 확인 문자열 전에는 대기한다', async () => {
  const { selectProductionRoleSmokeTarget } = await targetModule;
  const result = selectProductionRoleSmokeTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-03T21:00:00+09:00'),
    confirmation: 'wrong'
  });
  assert.equal(result.status, 'READY_WAIT_PUBLIC_ROLE_SMOKE_CONFIRMATION');
});

test('변경창과 확인 문자열이 맞을 때 exact Production HTTPS를 연다', async () => {
  const { selectProductionRoleSmokeTarget, PUBLIC_ROLE_SMOKE_CONFIRMATION } = await targetModule;
  const result = selectProductionRoleSmokeTarget({
    ...window,
    publicMode: true,
    now: new Date('2026-09-03T21:00:00+09:00'),
    confirmation: PUBLIC_ROLE_SMOKE_CONFIRMATION
  });
  assert.equal(result.target, 'https://inventory.safe-link.co.kr');
  assert.equal(result.actualProductionGate, true);
});

test('loopback 성공을 실제 Production 역할 증거로 승격하지 않는다', async () => {
  const { classifyRoleSmokeEvidence } = await targetModule;
  const result = classifyRoleSmokeEvidence({ status: 'PASS_PRODUCTION_ROLE_CORE_SMOKE', failures: [], productionGo: false }, false);
  assert.equal(result.status, 'PASS_LOOPBACK_ROLE_CORE_SMOKE_BASELINE');
  assert.equal(result.actualRoleCoreSmoke, 'NOT_RUN');
});

test('공개 Production 성공만 실제 역할 증거가 된다', async () => {
  const { classifyRoleSmokeEvidence } = await targetModule;
  const result = classifyRoleSmokeEvidence({ status: 'PASS_PRODUCTION_ROLE_CORE_SMOKE', failures: [], productionGo: false }, true);
  assert.equal(result.status, 'PASS_PRODUCTION_ROLE_CORE_SMOKE');
  assert.equal(result.actualRoleCoreSmoke, 'PASS');
});
