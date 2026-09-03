const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createInventoryCostBridge, modelIdentity } = require('../../src/bridge/inventory-cost-bridge');

function fixture(overrides = {}) {
  const calls = [];
  const token = crypto.randomBytes(32).toString('hex');
  const runtime = {
    async ready(input) { calls.push(['ready', input]); return { ready: true }; },
    async recommend(input) { calls.push(['recommend', input]); return { recommendations: [{ assetId: 7, actionType: 'TRANSFER', confidence: 0.9 }, { assetId: 8, actionType: 'DELETE' }], usage: { total_tokens: 12 } }; },
    async ocr(input) { calls.push(['ocr', input]); return { fields: { assetTag: 'IT-007' }, confidence: { assetTag: 0.95 } }; },
    ...overrides
  };
  const config = { bearerToken: token, allowedOrganizationIds: [3], provider: 'inventory-cost-bridge', modelVersion: 'cost-pilot-v1', modelChecksum: `sha256:${'a'.repeat(64)}` };
  return { app: createInventoryCostBridge({ config, runtime }), token, calls };
}

test('bridge는 health만 공개하고 나머지 계약에는 bearer 인증을 요구한다', async () => {
  const { app, token } = fixture();
  await request(app).get('/health').expect(200, { status: 'ok', provider: 'inventory-cost-bridge' });
  await request(app).get('/ready').expect(401, { error: 'UNAUTHORIZED' });
  const ready = await request(app).get('/ready').set('authorization', `Bearer ${token}`).expect(200);
  assert.equal(ready.body.status, 'ready');
  assert.equal(ready.body.modelChecksum, `sha256:${'a'.repeat(64)}`);
});

test('bridge 추천·OCR 계약은 조직 입력과 허용 행동만 runtime에 전달한다', async () => {
  const { app, token, calls } = fixture();
  const authorization = { authorization: `Bearer ${token}` };
  const recommendation = await request(app).post('/recommend').set(authorization).send({ organizationId: 3, query: { q: 'idle' }, assets: [{ id: 7 }] }).expect(200);
  assert.equal(recommendation.body.recommendations.length, 1);
  assert.equal(recommendation.body.recommendations[0].actionType, 'TRANSFER');
  assert.equal(calls[0][1].organizationId, 3);
  const extraction = await request(app).post('/ocr').set(authorization).send({ organizationId: 3, assetId: 7, text: 'label' }).expect(200);
  assert.equal(extraction.body.fields.assetTag, 'IT-007');
  assert.equal(calls[1][1].organizationId, 3);
  await request(app).post('/recommend').set(authorization).send({ organizationId: 0, assets: [] }).expect(400, { error: 'INVALID_REQUEST' });
  await request(app).post('/recommend').set(authorization).send({ organizationId: 4, assets: [] }).expect(403, { error: 'ORGANIZATION_FORBIDDEN' });
});

test('bridge readiness는 runtime 미준비·오류 시 fail closed 한다', async () => {
  const notReady = fixture({ async ready() { return { ready: false }; } });
  await request(notReady.app).get('/ready').set('authorization', `Bearer ${notReady.token}`).expect(503, { status: 'not_ready', provider: 'inventory-cost-bridge', modelVersion: 'cost-pilot-v1' });
  const failed = fixture({ async ready() { throw new Error('runtime unavailable'); } });
  await request(failed.app).get('/ready').set('authorization', `Bearer ${failed.token}`).expect(503, { error: 'RUNTIME_NOT_READY' });
});

test('bridge는 고정 model version과 sha256 checksum 없이는 생성되지 않는다', () => {
  assert.throws(() => modelIdentity({ modelVersion: 'v1', modelChecksum: 'unknown' }), /sha256 digest/);
  assert.throws(() => fixture({ ready: null }), /must implement ready/);
  assert.throws(() => createInventoryCostBridge({ config: { bearerToken: 'token', modelVersion: 'v1', modelChecksum: `sha256:${'a'.repeat(64)}` }, runtime: { ready() {}, recommend() {}, ocr() {} } }), /organization IDs/);
});

test('bridge 보안 endpoint는 bearer 인증과 scanner·alert receipt를 강제한다', async () => {
  const base = fixture();
  const malwareScanner = {
    async scan(content) { return { status: content.toString() === 'infected' ? 'infected' : 'clean', engine: 'Microsoft Defender Antivirus' }; },
    async healthCheck() { return { status: 'ok', engineVersion: '4.18.test', signatureVersion: '1.2.3' }; }
  };
  const alertSink = {
    async send({ category }) { return { receiptId: 'receipt-1', category, delivered: true }; },
    async healthCheck() { return { status: 'ok', channel: 'interactive-user-session' }; }
  };
  const config = { bearerToken: base.token, allowedOrganizationIds: [3], provider: 'inventory-cost-bridge', modelVersion: 'cost-pilot-v1', modelChecksum: `sha256:${'a'.repeat(64)}` };
  const runtime = { async ready() { return { ready: true }; }, async recommend() { return { recommendations: [] }; }, async ocr() { return { fields: {}, confidence: {} }; } };
  const app = createInventoryCostBridge({ config, runtime, malwareScanner, alertSink });
  await request(app).post('/security/scan').set('content-type', 'application/octet-stream').send(Buffer.from('clean')).expect(401);
  const scan = await request(app).post('/security/scan').set('authorization', `Bearer ${base.token}`).set('content-type', 'application/octet-stream').send(Buffer.from('infected')).expect(200);
  assert.equal(scan.body.status, 'infected');
  const health = await request(app).get('/security/health').set('authorization', `Bearer ${base.token}`).expect(200);
  assert.equal(health.body.scanner.signatureVersion, '1.2.3');
  const alert = await request(app).post('/alerts').set('authorization', `Bearer ${base.token}`).send({ category: 'MALWARE_INFECTED' }).expect(202);
  assert.equal(alert.body.receiptId, 'receipt-1');
});

test('bridge event endpoint는 bearer와 멱등 receipt를 강제한다', async () => {
  const { app, token } = fixture();
  await request(app).post('/events/publish').send({ id: '1', type: 'ASSET_UPDATED' }).expect(401);
  const first = await request(app).post('/events/publish').set('authorization', `Bearer ${token}`).send({ id: '1', type: 'ASSET_UPDATED', idempotencyKey: 'outbox-1' }).expect(202);
  const duplicate = await request(app).post('/events/publish').set('authorization', `Bearer ${token}`).send({ id: '1', type: 'ASSET_UPDATED', idempotencyKey: 'outbox-1' }).expect(202);
  assert.match(first.body.receiptId, /^[a-f0-9]{32}$/);
  assert.equal(duplicate.body.receiptId, first.body.receiptId);
});
