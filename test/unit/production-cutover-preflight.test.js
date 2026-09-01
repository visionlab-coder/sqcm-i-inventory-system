const test = require('node:test');
const assert = require('node:assert/strict');

const preflightModule = import('../../src/operations/production-cutover-preflight.mjs');

const readyObservation = (overrides = {}) => ({
  now: '2026-09-01T05:30:00.000Z',
  remoteShaMatched: true,
  services: [
    { name: 'backend', health: 'healthy' },
    { name: 'database', health: 'healthy' },
    { name: 'frontend', health: 'healthy' }
  ],
  frontendBinding: '127.0.0.1:3300',
  backendHostPortCount: 0,
  databaseHostPortCount: 0,
  smokePassed: true,
  applicationMigrations: 25,
  productionUsers: 0,
  backupRestoreVerified: true,
  protectedServicesPreserved: true,
  tunnels: [
    { name: 'sqcm-i', connections: 4 },
    { name: 'sqcm-i-inventory-staging', connections: 4 }
  ],
  productionTunnelExists: false,
  dnsPublished: false,
  actualCutoverEvidenceExists: false,
  ...overrides
});

test('변경창 전 정상 내부 Production은 READY_WAIT_CHANGE_WINDOW다', async () => {
  const { evaluateProductionCutoverPreflight } = await preflightModule;
  const result = evaluateProductionCutoverPreflight(readyObservation());
  assert.equal(result.status, 'READY_WAIT_CHANGE_WINDOW');
  assert.deepEqual(result.localBlockers, []);
  assert.equal(result.productionGo, false);
});

test('변경창 안에서는 미게시 외부 항목을 실행 가능한 READY로 분리한다', async () => {
  const { evaluateProductionCutoverPreflight } = await preflightModule;
  const result = evaluateProductionCutoverPreflight(readyObservation({ now: '2026-09-11T11:30:00.000Z' }));
  assert.equal(result.status, 'READY_FOR_CHANGE_WINDOW_EXECUTION');
  assert.equal(result.insideWindow, true);
  assert.ok(result.externalPending.includes('PRODUCTION_TUNNEL_MISSING'));
});

test('모든 실제 외부 증거가 있으면 최종 서명 READY다', async () => {
  const { evaluateProductionCutoverPreflight } = await preflightModule;
  const result = evaluateProductionCutoverPreflight(readyObservation({
    now: '2026-09-11T12:00:00.000Z',
    productionUsers: 3,
    productionTunnelExists: true,
    dnsPublished: true,
    actualCutoverEvidenceExists: true
  }));
  assert.equal(result.status, 'READY_FOR_CUTOVER_SIGNOFF');
  assert.equal(result.productionGo, true);
});

test('로컬 불변식 손상은 변경창과 무관하게 fail closed 한다', async () => {
  const { evaluateProductionCutoverPreflight } = await preflightModule;
  const result = evaluateProductionCutoverPreflight(readyObservation({
    services: [{ name: 'frontend', health: 'healthy' }],
    protectedServicesPreserved: false
  }));
  assert.equal(result.status, 'BLOCKED_LOCAL_PREFLIGHT');
  assert.ok(result.localBlockers.includes('PRODUCTION_THREE_SERVICES_NOT_HEALTHY'));
  assert.ok(result.localBlockers.includes('PROTECTED_SERVICE_CHANGED'));
});
