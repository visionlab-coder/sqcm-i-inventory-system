const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-public-probe-runtime.mjs');

const expectedResponses = Object.freeze({
  '/health': 200,
  '/api/health': 200,
  '/api/readiness': 200,
  '/api/items': 401,
  '/assets/seowon-official-logo-reversed.png': 200
});

test('public probe DNS 무응답을 5초 이하 설정의 bounded 실패로 반환한다', async () => {
  const { observeProductionPublicDns } = await runtimeModule;
  const never = () => new Promise(() => {});
  const result = await observeProductionPublicDns({
    hostname: 'inventory.safe-link.co.kr',
    resolveIpv4: never,
    resolveAlias: never,
    timeoutMs: 20
  });

  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT'
  });
});

test('public HTTPS 5경로는 첫 응답 대기 전에 모두 시작한다', async () => {
  const { probeProductionPublicEndpoints } = await runtimeModule;
  const pending = [];
  const calls = [];
  const fetchImpl = (url, options) => {
    calls.push({ url, options });
    return new Promise((resolve) => pending.push(() => resolve({
      status: expectedResponses[new URL(url).pathname],
      url
    })));
  };

  const probe = probeProductionPublicEndpoints({
    hostname: 'inventory.safe-link.co.kr', expectedResponses, fetchImpl, timeoutMs: 25
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 5);
  assert.equal(calls.every((call) => call.options.signal), true);
  pending.forEach((resolve) => resolve());
  const result = await probe;
  assert.equal(Object.keys(result.responses).length, 5);
  assert.equal(result.status, 'PASS_PUBLIC_ENDPOINT_OBSERVATION');
});

test('public HTTPS timeout은 응답·오류 원문 없이 경로별 실패로 정규화한다', async () => {
  const { probeProductionPublicEndpoints } = await runtimeModule;
  const result = await probeProductionPublicEndpoints({
    hostname: 'inventory.safe-link.co.kr',
    expectedResponses: { '/health': 200 },
    timeoutMs: 25,
    fetchImpl: async () => {
      const error = new Error('sensitive provider response');
      error.name = 'AbortError';
      throw error;
    }
  });

  assert.deepEqual(result.responses['/health'], {
    status: null,
    tlsVerified: false,
    finalHostname: null
  });
  assert.equal(result.status, 'FAIL_PUBLIC_ENDPOINT_OBSERVATION');
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
});

test('DNS 관측 실패는 공개 HTTPS 요청을 열지 않는다', async () => {
  const { runProductionPublicProbeObservation } = await runtimeModule;
  let fetchCount = 0;
  const result = await runProductionPublicProbeObservation({
    hostname: 'inventory.safe-link.co.kr',
    expectedResponses,
    observeDns: async () => ({
      succeeded: false, published: false, status: 'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT'
    }),
    fetchImpl: async () => { fetchCount += 1; throw new Error('must not run'); }
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.status, 'FAIL_PUBLIC_PROBE_DNS_OBSERVATION');
  assert.deepEqual(result.responses, {});
});
