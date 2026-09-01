const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-route-disable-runtime.mjs');

test('route-disable tunnel 관측 timeout을 출력 원문 없이 bounded 상태로 닫는다', async () => {
  const { observeProductionRouteDisableTunnel } = await runtimeModule;
  const result = observeProductionRouteDisableTunnel({
    cloudflared: 'provider.exe',
    runCommand: () => ({ ok: false, stdout: 'secret-output', failure: 'COMMAND_TIMEOUT' })
  });

  assert.deepEqual(result, {
    succeeded: false,
    tunnelId: null,
    status: 'ROUTE_DISABLE_TUNNEL_OBSERVATION_TIMEOUT'
  });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('route-disable tunnel 비정상 JSON과 중복 identity를 fail-closed 한다', async () => {
  const { observeProductionRouteDisableTunnel } = await runtimeModule;
  const malformed = observeProductionRouteDisableTunnel({
    cloudflared: 'provider.exe',
    runCommand: () => ({ ok: true, stdout: 'not-json', failure: null })
  });
  const duplicate = observeProductionRouteDisableTunnel({
    cloudflared: 'provider.exe',
    runCommand: () => ({
      ok: true,
      stdout: JSON.stringify([
        { name: 'sqcm-i-inventory-production', id: '994b5a27-cba4-4958-aecf-ed43db8730ef' },
        { name: 'sqcm-i-inventory-production', id: 'a94b5a27-cba4-4958-aecf-ed43db8730ef' }
      ]),
      failure: null
    })
  });

  assert.equal(malformed.status, 'ROUTE_DISABLE_TUNNEL_OBSERVATION_INVALID');
  assert.equal(duplicate.status, 'ROUTE_DISABLE_TUNNEL_IDENTITY_AMBIGUOUS');
});

test('route-disable Cloudflare API timeout은 token과 응답 원문 없이 거부한다', async () => {
  const { requestRouteDisableCloudflareJson } = await runtimeModule;
  await assert.rejects(
    requestRouteDisableCloudflareJson({
      url: 'https://api.cloudflare.com/client/v4/zones',
      token: 'sensitive-token-value',
      timeoutMs: 25,
      fetchImpl: async () => {
        const error = new Error('sensitive provider response');
        error.name = 'AbortError';
        throw error;
      }
    }),
    (error) => error.message === 'ROUTE_DISABLE_PROVIDER_HTTP_TIMEOUT'
  );
});

test('route-disable DNS resolver 무응답을 bounded 관측 실패로 반환한다', async () => {
  const { observeProductionRouteDisableDns } = await runtimeModule;
  const never = () => new Promise(() => {});
  const result = await observeProductionRouteDisableDns({
    hostname: 'inventory.safe-link.co.kr',
    resolveIpv4: never,
    resolveAlias: never,
    timeoutMs: 20
  });

  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'ROUTE_DISABLE_DNS_OBSERVATION_TIMEOUT'
  });
});
