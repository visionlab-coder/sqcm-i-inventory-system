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
    fallbackObserve: async () => ({ succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' }),
    timeoutMs: 20
  });

  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT'
  });
});

test('native DNS 실패는 authoritative DoH NXDOMAIN으로 미게시 상태를 대체 관측한다', async () => {
  const { observeProductionPublicDns } = await runtimeModule;
  const never = () => new Promise(() => {});
  const result = await observeProductionPublicDns({
    hostname: 'inventory.safe-link.co.kr',
    resolveIpv4: never,
    resolveAlias: never,
    fallbackObserve: async () => ({ succeeded: true, published: false, status: 'PASS_INGRESS_DNS_DOH_OBSERVATION' }),
    timeoutMs: 20
  });

  assert.deepEqual(result, {
    succeeded: true,
    published: false,
    status: 'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK'
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
    dnsAttempts: 1,
    fetchImpl: async () => { fetchCount += 1; throw new Error('must not run'); }
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.status, 'FAIL_PUBLIC_PROBE_DNS_OBSERVATION');
  assert.deepEqual(result.responses, {});
});

test('DNS 게시 직후 HTTPS 전파 지연은 bounded retry 뒤 PASS한다', async () => {
  const { runProductionPublicProbeObservation } = await runtimeModule;
  let requestCount = 0;
  let waitCount = 0;
  const result = await runProductionPublicProbeObservation({
    hostname: 'inventory.safe-link.co.kr',
    expectedResponses: { '/health': 200 },
    observeDns: async () => ({ succeeded:true,published:true,status:'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK' }),
    fetchImpl: async (url) => {
      requestCount += 1;
      if (requestCount === 1) throw new Error('propagation pending');
      return { status:200,url };
    },
    endpointAttempts: 3,
    retryDelayMs: 1,
    wait: async () => { waitCount += 1; }
  });
  assert.equal(result.status, 'PASS_PUBLIC_ENDPOINT_OBSERVATION');
  assert.equal(result.endpointAttempts, 2);
  assert.equal(waitCount, 1);
});

test('provider 게시 직후 NXDOMAIN cache는 bounded DNS retry 뒤 HTTPS로 진행한다', async () => {
  const { runProductionPublicProbeObservation } = await runtimeModule;
  let dnsCount = 0;
  let waitCount = 0;
  const result = await runProductionPublicProbeObservation({
    hostname:'inventory.safe-link.co.kr',
    expectedResponses:{ '/health':200 },
    observeDns:async()=>({ succeeded:true,published:++dnsCount >= 3,status:'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK' }),
    fetchImpl:async(url)=>({ status:200,url }),
    dnsAttempts:3,
    retryDelayMs:1,
    wait:async()=>{ waitCount += 1; }
  });
  assert.equal(result.status,'PASS_PUBLIC_ENDPOINT_OBSERVATION');
  assert.equal(result.dnsAttempts,3);
  assert.equal(waitCount,2);
});

test('일시적 DNS 관측 timeout도 bounded retry 뒤 게시 상태로 복구한다', async () => {
  const { runProductionPublicProbeObservation } = await runtimeModule;
  let dnsCount = 0;
  const result = await runProductionPublicProbeObservation({
    hostname:'inventory.safe-link.co.kr',
    expectedResponses:{ '/health':200 },
    observeDns:async()=>++dnsCount === 1
      ? { succeeded:false,published:false,status:'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT' }
      : { succeeded:true,published:true,status:'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK' },
    fetchImpl:async(url)=>({ status:200,url }),
    dnsAttempts:2,
    retryDelayMs:1,
    wait:async()=>{}
  });
  assert.equal(result.status,'PASS_PUBLIC_ENDPOINT_OBSERVATION');
  assert.equal(result.dnsAttempts,2);
});

test('Cloudflare 전파 중 530 응답은 성공으로 멈추지 않고 기대 상태까지 재검증한다', async () => {
  const { runProductionPublicProbeObservation } = await runtimeModule;
  let requestCount = 0;
  const result = await runProductionPublicProbeObservation({
    hostname:'inventory.safe-link.co.kr',
    expectedResponses:{ '/health':200 },
    observeDns:async()=>({ succeeded:true,published:true,status:'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK' }),
    fetchImpl:async(url)=>({ status:++requestCount === 1 ? 530 : 200,url }),
    endpointAttempts:2,
    retryDelayMs:1,
    wait:async()=>{}
  });
  assert.equal(result.responses['/health'].status,200);
  assert.equal(result.endpointAttempts,2);
});
