const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicationModule = import('../../src/operations/production-ingress-publication.mjs');
const tunnelName = 'sqcm-i-inventory-production';
const tunnelId = '994b5a27-cba4-4958-aecf-ed43db8730ef';

function observedTunnel(overrides = {}) {
  return {
    id: tunnelId,
    name: tunnelName,
    created_at: '2026-09-02T11:00:00Z',
    deleted_at: '0001-01-01T00:00:00Z',
    connections: [],
    ...overrides
  };
}

const safeOutput = `Tunnel credentials written to C:\\runtime\\credential.tmp. Keep this file secret.\r\n\r\nCreated tunnel ${tunnelName} with id ${tunnelId}\r\n`;

test('Secret 없는 default create acknowledgement와 원격 exact tunnel ID가 일치해야 한다', async () => {
  const { acknowledgeProductionIngressTunnelCreation } = await publicationModule;
  const result = acknowledgeProductionIngressTunnelCreation({ output: safeOutput, observedTunnel: observedTunnel() });
  assert.equal(result.id, tunnelId);
  assert.equal(result.name, tunnelName);
});

test('token을 포함한 JSON create output은 acknowledgement로 읽지 않는다', async () => {
  const { acknowledgeProductionIngressTunnelCreation } = await publicationModule;
  assert.throws(() => acknowledgeProductionIngressTunnelCreation({
    output: JSON.stringify({ id: tunnelId, name: tunnelName, token: 'sensitive' }),
    observedTunnel: observedTunnel()
  }), /INGRESS_TUNNEL_CREATE_OUTPUT_UNSAFE/);
});

test('생성 확인문 누락·중복·name 변조를 차단한다', async () => {
  const { acknowledgeProductionIngressTunnelCreation } = await publicationModule;
  for (const output of [
    'created',
    `${safeOutput}${safeOutput}`,
    safeOutput.replace(tunnelName, 'other-tunnel')
  ]) {
    assert.throws(() => acknowledgeProductionIngressTunnelCreation({ output, observedTunnel: observedTunnel() }), /INGRESS_TUNNEL_CREATE_ACK_INVALID/);
  }
});

test('원격 재관측 누락 또는 다른 UUID는 credential/config 게시 전에 차단한다', async () => {
  const { acknowledgeProductionIngressTunnelCreation } = await publicationModule;
  assert.throws(() => acknowledgeProductionIngressTunnelCreation({ output: safeOutput, observedTunnel: null }), /INGRESS_TUNNEL_CREATE_NOT_OBSERVED/);
  assert.throws(() => acknowledgeProductionIngressTunnelCreation({
    output: safeOutput,
    observedTunnel: observedTunnel({ id: '11111111-1111-4111-8111-111111111111' })
  }), /INGRESS_TUNNEL_CREATE_ID_MISMATCH/);
});

test('진입점은 JSON/token 출력을 요청하지 않고 재관측 뒤에만 credential을 게시한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-publication.mjs'), 'utf8');
  const createIndex = source.indexOf("'tunnel', 'create'");
  const acknowledgeIndex = source.indexOf('acknowledgeProductionIngressTunnelCreation', createIndex);
  const publishIndex = source.indexOf('publishProductionTunnelCredential({', acknowledgeIndex);
  assert.ok(createIndex >= 0 && acknowledgeIndex > createIndex && publishIndex > acknowledgeIndex);
  assert.doesNotMatch(source.slice(createIndex, publishIndex), /'--output',\s*'json'/);
  assert.doesNotMatch(source.slice(createIndex, publishIndex), /JSON\.parse\(createOutput\)/);
});
