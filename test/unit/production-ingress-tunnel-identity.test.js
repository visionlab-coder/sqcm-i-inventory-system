const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicationModule = import('../../src/operations/production-ingress-publication.mjs');
const tunnelName = 'sqcm-i-inventory-production';
const tunnelId = '994b5a27-cba4-4958-aecf-ed43db8730ef';

function exactConnection(overrides = {}) {
  return {
    id: '995b5a27-cba4-4958-aecf-ed43db8730ef',
    colo_name: 'ICN',
    origin_ip: '203.0.113.10',
    opened_at: '2026-09-02T12:00:00Z',
    is_pending_reconnect: false,
    ...overrides
  };
}

function exactTunnel(overrides = {}) {
  return {
    id: tunnelId,
    name: tunnelName,
    created_at: '2026-09-02T11:00:00Z',
    deleted_at: '0001-01-01T00:00:00Z',
    connections: [exactConnection()],
    ...overrides
  };
}

test('exact Production tunnel 하나와 active connection만 선택한다', async () => {
  const { selectProductionIngressTunnel, productionIngressTunnelConnected } = await publicationModule;
  const selected = selectProductionIngressTunnel({
    tunnels: [{ ...exactTunnel(), name: 'sqcm-i' }, exactTunnel()], expectedName: tunnelName
  });
  assert.deepEqual(selected, exactTunnel());
  assert.equal(productionIngressTunnelConnected(selected), true);
  assert.equal(selectProductionIngressTunnel({ tunnels: [], expectedName: tunnelName }), null);
});

test('malformed tunnel list와 exact name 중복은 mutation 전에 차단한다', async () => {
  const { selectProductionIngressTunnel } = await publicationModule;
  assert.throws(() => selectProductionIngressTunnel({ tunnels: {}, expectedName: tunnelName }), /INGRESS_TUNNEL_RESPONSE_INVALID/);
  assert.throws(() => selectProductionIngressTunnel({ tunnels: [exactTunnel(), exactTunnel({ id: '11111111-1111-4111-8111-111111111111' })], expectedName: tunnelName }), /INGRESS_TUNNEL_IDENTITY_AMBIGUOUS/);
});

test('tunnel identity 필드가 틀리면 existing tunnel로 재사용하지 않는다', async () => {
  const { selectProductionIngressTunnel } = await publicationModule;
  for (const mutation of [
    { id: '------------------------------------' },
    { created_at: 'not-a-time' },
    { deleted_at: '2026-09-02T13:00:00Z' },
    { connections: {} }
  ]) {
    assert.throws(() => selectProductionIngressTunnel({ tunnels: [exactTunnel(mutation)], expectedName: tunnelName }), /INGRESS_TUNNEL_IDENTITY_INVALID/);
  }
});

test('connection identity 필드가 틀리면 connected 성공 근거로 사용하지 않는다', async () => {
  const { selectProductionIngressTunnel } = await publicationModule;
  for (const mutation of [
    { id: 'connection' },
    { colo_name: '../ICN' },
    { origin_ip: 'not-an-ip' },
    { opened_at: 'not-a-time' },
    { is_pending_reconnect: 'false' }
  ]) {
    assert.throws(() => selectProductionIngressTunnel({ tunnels: [exactTunnel({ connections: [exactConnection(mutation)] })], expectedName: tunnelName }), /INGRESS_TUNNEL_CONNECTION_IDENTITY_INVALID/);
  }
});

test('pending reconnect 또는 빈 connection은 tunnel connected가 아니다', async () => {
  const { selectProductionIngressTunnel, productionIngressTunnelConnected } = await publicationModule;
  const pending = selectProductionIngressTunnel({ tunnels: [exactTunnel({ connections: [exactConnection({ is_pending_reconnect: true })] })], expectedName: tunnelName });
  const empty = selectProductionIngressTunnel({ tunnels: [exactTunnel({ connections: [] })], expectedName: tunnelName });
  assert.equal(productionIngressTunnelConnected(pending), false);
  assert.equal(productionIngressTunnelConnected(empty), false);
});

test('진입점은 조회마다 exact tunnel selector와 connection 판정을 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-publication.mjs'), 'utf8');
  assert.match(source, /selectProductionIngressTunnel/);
  assert.match(source, /productionIngressTunnelConnected/);
  assert.doesNotMatch(source, /exactTunnels/);
  assert.doesNotMatch(source, /connections\s*\|\|\s*\[\]/);
});
