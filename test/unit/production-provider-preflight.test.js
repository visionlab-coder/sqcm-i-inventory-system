const test = require('node:test');
const assert = require('node:assert/strict');

const providerModule = import('../../src/operations/production-provider-preflight.mjs');

const healthy = () => ({
  fileStorage: { status: 'ok', driver: 'POSTGRES' },
  malware: { status: 'ok', driver: 'MICROSOFT_DEFENDER_BRIDGE' },
  aiHealth: { status: 'ok' },
  aiReadiness: { status: 'ready' },
  eventPublisher: { status: 'ok', driver: 'HTTP_LOOPBACK' },
  secretMaterialPrinted: false
});

test('AI PC Production 공급자 5종의 읽기 전용 상태만 PASS한다', async () => {
  const { evaluateProductionProviderPreflight } = await providerModule;
  const result = evaluateProductionProviderPreflight(healthy());
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.failures, []);
  assert.equal(result.readOnly, true);
  assert.equal(result.productionGo, false);
});

test('공급자 하나라도 미준비이면 fail closed 한다', async () => {
  const { evaluateProductionProviderPreflight } = await providerModule;
  const observation = healthy();
  observation.aiReadiness.status = 'starting';
  const result = evaluateProductionProviderPreflight(observation);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.includes('AIREADINESS_NOT_READY'));
});

test('Secret 출력 표시는 공급자가 정상이어도 차단한다', async () => {
  const { evaluateProductionProviderPreflight } = await providerModule;
  const result = evaluateProductionProviderPreflight({ ...healthy(), secretMaterialPrinted: true });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.failures.includes('SECRET_MATERIAL_EXPOSED'));
});
