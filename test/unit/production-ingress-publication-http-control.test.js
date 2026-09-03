const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');

function oversizedResponse() {
  return {
    ok: true,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(1024 * 1024 + 1) : null },
    body: { getReader: () => { throw new Error('body must not be read'); } }
  };
}

test('Production ingress provider와 DoH 응답은 bounded JSON object reader를 공유한다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../src/operations/production-ingress-publication-runtime.mjs'),
    'utf8'
  );

  assert.match(source, /readBoundedJsonObjectResponse/);
  assert.equal((source.match(/await readBoundedJsonObjectResponse\(response\)/g) || []).length, 2);
  assert.doesNotMatch(source, /response\.json\(\)/);
});

test('과대 Cloudflare API 응답은 body read 전에 원문 없이 거부한다', async () => {
  const { requestCloudflareJson } = await runtimeModule;
  await assert.rejects(
    requestCloudflareJson({
      url: 'https://api.cloudflare.com/client/v4/zones',
      token: 'sensitive-token',
      fetchImpl: async () => oversizedResponse()
    }),
    (error) => error.message === 'INGRESS_PROVIDER_HTTP_INVALID_JSON'
  );
});

test('과대 DoH 응답은 unpublished 성공으로 승격하지 않는다', async () => {
  const { observeProductionIngressDnsOverHttps } = await runtimeModule;
  const result = await observeProductionIngressDnsOverHttps({
    hostname: 'inventory.safe-link.co.kr',
    fetchImpl: async () => oversizedResponse()
  });
  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'INGRESS_DNS_DOH_FAILED'
  });
});
