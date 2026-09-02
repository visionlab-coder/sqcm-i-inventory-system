const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');

test('native DNS timeout은 authoritative DoH NXDOMAIN으로 안전하게 대체 관측한다', async () => {
  const { observeProductionIngressDnsResilient } = await runtimeModule;
  const result = await observeProductionIngressDnsResilient({
    hostname: 'inventory.safe-link.co.kr',
    nativeObserve: async () => ({ succeeded: false, published: false, status: 'INGRESS_DNS_OBSERVATION_TIMEOUT' }),
    fallbackObserve: async () => ({ succeeded: true, published: false, status: 'PASS_INGRESS_DNS_DOH_OBSERVATION' })
  });
  assert.deepEqual(result, {
    succeeded: true,
    published: false,
    status: 'PASS_INGRESS_DNS_OBSERVATION_FALLBACK'
  });
});

test('native DNS timeout 뒤 DoH published 응답은 published=true로 보존한다', async () => {
  const { observeProductionIngressDnsResilient } = await runtimeModule;
  const result = await observeProductionIngressDnsResilient({
    hostname: 'inventory.safe-link.co.kr',
    nativeObserve: async () => ({ succeeded: false, published: false, status: 'INGRESS_DNS_OBSERVATION_TIMEOUT' }),
    fallbackObserve: async () => ({ succeeded: true, published: true, status: 'PASS_INGRESS_DNS_DOH_OBSERVATION' })
  });
  assert.equal(result.succeeded, true);
  assert.equal(result.published, true);
  assert.equal(result.status, 'PASS_INGRESS_DNS_OBSERVATION_FALLBACK');
});

test('native와 DoH가 모두 실패하면 unpublished로 승격하지 않고 fail-closed한다', async () => {
  const { observeProductionIngressDnsResilient } = await runtimeModule;
  const result = await observeProductionIngressDnsResilient({
    hostname: 'inventory.safe-link.co.kr',
    nativeObserve: async () => ({ succeeded: false, published: false, status: 'INGRESS_DNS_OBSERVATION_TIMEOUT' }),
    fallbackObserve: async () => ({ succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' })
  });
  assert.deepEqual(result, {
    succeeded: false,
    published: false,
    status: 'INGRESS_DNS_PRIMARY_AND_FALLBACK_FAILED'
  });
});

test('DoH 관측은 A·CNAME authoritative 응답을 사용하고 provider 오류 원문을 숨긴다', async () => {
  const { observeProductionIngressDnsOverHttps } = await runtimeModule;
  const requests = [];
  const success = await observeProductionIngressDnsOverHttps({
    hostname: 'inventory.safe-link.co.kr',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ Status: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' }
      });
    }
  });
  assert.deepEqual(success, {
    succeeded: true,
    published: false,
    status: 'PASS_INGRESS_DNS_DOH_OBSERVATION'
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((entry) => entry.options.signal));
  assert.ok(requests.every((entry) => entry.options.headers.accept === 'application/dns-json'));

  const failed = await observeProductionIngressDnsOverHttps({
    hostname: 'inventory.safe-link.co.kr',
    fetchImpl: async () => { throw new Error('provider-response-sensitive'); }
  });
  assert.deepEqual(failed, { succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' });
  assert.equal(JSON.stringify(failed).includes('provider-response-sensitive'), false);
});
