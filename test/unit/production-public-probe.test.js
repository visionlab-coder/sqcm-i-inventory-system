const test = require('node:test');
const assert = require('node:assert/strict');

const publicProbeModule = import('../../src/operations/production-public-probe.mjs');

const passingResponses = () => ({
  '/health': { status: 200, tlsVerified: true, finalHostname: 'inventory.safe-link.co.kr' },
  '/api/health': { status: 200, tlsVerified: true, finalHostname: 'inventory.safe-link.co.kr' },
  '/api/readiness': { status: 200, tlsVerified: true, finalHostname: 'inventory.safe-link.co.kr' },
  '/api/items': { status: 401, tlsVerified: true, finalHostname: 'inventory.safe-link.co.kr' },
  '/assets/seowon-official-logo-reversed.png': { status: 200, tlsVerified: true, finalHostname: 'inventory.safe-link.co.kr' }
});

test('DNS 미게시 상태는 실패가 아니라 변경창 대기로 판정한다', async () => {
  const { evaluateProductionPublicProbe } = await publicProbeModule;
  const result = evaluateProductionPublicProbe({ dnsPublished: false, insideWindow: false, responses: {} });
  assert.equal(result.status, 'READY_WAIT_DNS_TLS_PUBLICATION');
  assert.deepEqual(result.failures, []);
  assert.equal(result.productionGo, false);
});

test('변경창 밖 DNS 게시를 fail closed 한다', async () => {
  const { evaluateProductionPublicProbe } = await publicProbeModule;
  const result = evaluateProductionPublicProbe({ dnsPublished: true, insideWindow: false, responses: passingResponses() });
  assert.equal(result.status, 'FAIL_PUBLICATION_OUTSIDE_CHANGE_WINDOW');
});

test('변경창 안 exact TLS·상태·hostname만 health readiness PASS다', async () => {
  const { evaluateProductionPublicProbe } = await publicProbeModule;
  const result = evaluateProductionPublicProbe({ dnsPublished: true, insideWindow: true, responses: passingResponses() });
  assert.equal(result.status, 'PASS_PUBLIC_HEALTH_READINESS');
  assert.deepEqual(result.failures, []);
  assert.equal(result.productionGo, false);
});

test('TLS·상태 또는 hostname 하나라도 다르면 실패한다', async () => {
  const { evaluateProductionPublicProbe } = await publicProbeModule;
  const responses = passingResponses();
  responses['/api/readiness'] = { status: 503, tlsVerified: false, finalHostname: 'example.com' };
  const result = evaluateProductionPublicProbe({ dnsPublished: true, insideWindow: true, responses });
  assert.equal(result.status, 'FAIL_PUBLIC_HEALTH_READINESS');
  assert.equal(result.failures.length, 3);
});
