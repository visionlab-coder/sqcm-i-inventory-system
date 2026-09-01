const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');

test('ingress command timeout을 오류 원문 없이 bounded 상태로 정규화한다', async () => {
  const { runIngressCommand } = await runtimeModule;
  const result = runIngressCommand('provider.exe', ['list'], {
    timeoutMs: 25,
    execute: () => ({
      status: null,
      signal: 'SIGTERM',
      stdout: 'secret-output',
      stderr: 'secret-error',
      error: Object.assign(new Error('secret-error'), { code: 'ETIMEDOUT' })
    })
  });

  assert.deepEqual(result, { ok: false, stdout: '', failure: 'COMMAND_TIMEOUT' });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('Cloudflare HTTP timeout을 token과 응답 원문 없이 거부한다', async () => {
  const { requestCloudflareJson } = await runtimeModule;
  await assert.rejects(
    requestCloudflareJson({
      url: 'https://api.cloudflare.com/client/v4/zones',
      token: 'sensitive-token-value',
      timeoutMs: 25,
      fetchImpl: async (_url, options) => {
        assert.ok(options.signal);
        const error = new Error('sensitive provider response');
        error.name = 'AbortError';
        throw error;
      }
    }),
    (error) => error.message === 'INGRESS_PROVIDER_HTTP_TIMEOUT'
  );
});

test('DNS resolver 무응답을 bounded 관측 실패로 반환한다', async () => {
  const { observeProductionIngressDns } = await runtimeModule;
  const never = () => new Promise(() => {});
  const result = await observeProductionIngressDns({
    hostname: 'inventory.safe-link.co.kr',
    resolveIpv4: never,
    resolveAlias: never,
    timeoutMs: 20
  });

  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'INGRESS_DNS_OBSERVATION_TIMEOUT'
  });
});
