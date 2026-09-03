import { observeProductionIngressDns, observeProductionIngressDnsOverHttps } from './production-ingress-publication-runtime.mjs';

export const PUBLIC_PROBE_DNS_TIMEOUT_MS = 5_000;
export const PUBLIC_PROBE_HTTP_TIMEOUT_MS = 10_000;

export async function observeProductionPublicDns({
  hostname,
  resolveIpv4,
  resolveAlias,
  fallbackObserve,
  timeoutMs = PUBLIC_PROBE_DNS_TIMEOUT_MS
} = {}) {
  const primary = await observeProductionIngressDns({ hostname, resolveIpv4, resolveAlias, timeoutMs });
  if (primary.succeeded) {
    return { succeeded: true, published: primary.published, status: 'PASS_PUBLIC_PROBE_DNS_OBSERVATION' };
  }
  const observeFallback = fallbackObserve ?? (({ hostname: value }) => observeProductionIngressDnsOverHttps({
    hostname: value,
    timeoutMs
  }));
  let fallback;
  try { fallback = await observeFallback({ hostname }); } catch { fallback = null; }
  if (fallback?.succeeded === true) {
    return {
      succeeded: true,
      published: fallback.published === true,
      status: 'PASS_PUBLIC_PROBE_DNS_OBSERVATION_FALLBACK'
    };
  }
  if (!primary.succeeded) {
    return {
      succeeded: false,
      published: false,
      status: primary.status === 'INGRESS_DNS_OBSERVATION_TIMEOUT'
        ? 'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT'
        : 'PUBLIC_PROBE_DNS_OBSERVATION_FAILED'
    };
  }
  return { succeeded: false, published: false, status: 'PUBLIC_PROBE_DNS_OBSERVATION_FAILED' };
}

export async function probeProductionPublicEndpoints({
  hostname,
  expectedResponses,
  timeoutMs = PUBLIC_PROBE_HTTP_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  if (!hostname || typeof hostname !== 'string') throw new Error('PUBLIC_PROBE_HOSTNAME_INVALID');
  if (!expectedResponses || typeof expectedResponses !== 'object') throw new Error('PUBLIC_PROBE_EXPECTED_RESPONSES_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('PUBLIC_PROBE_HTTP_TIMEOUT_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('PUBLIC_PROBE_HTTP_CLIENT_INVALID');

  const entries = Object.keys(expectedResponses).map(async (path) => {
    try {
      const response = await fetchImpl(`https://${hostname}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: path.endsWith('.png') ? 'image/png' : 'application/json' }
      });
      let finalHostname = null;
      try { finalHostname = new URL(response.url).hostname; } catch { /* fail closed below */ }
      return [path, { status: response.status, tlsVerified: true, finalHostname }];
    } catch {
      return [path, { status: null, tlsVerified: false, finalHostname: null }];
    }
  });
  const responses = Object.fromEntries(await Promise.all(entries));
  const succeeded = Object.values(responses).every((response) => response.status !== null && response.tlsVerified === true);
  return {
    succeeded,
    responses,
    status: succeeded ? 'PASS_PUBLIC_ENDPOINT_OBSERVATION' : 'FAIL_PUBLIC_ENDPOINT_OBSERVATION'
  };
}

export async function runProductionPublicProbeObservation({
  hostname,
  expectedResponses,
  insideWindow = true,
  observeDns = observeProductionPublicDns,
  fetchImpl = fetch,
  dnsAttempts = 150,
  endpointAttempts = 150,
  retryDelayMs = 2_000,
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
} = {}) {
  let dns;
  let dnsAttempt = 0;
  for (dnsAttempt = 1; dnsAttempt <= dnsAttempts; dnsAttempt += 1) {
    dns = await observeDns({ hostname });
    if ((dns?.succeeded && dns.published) || !insideWindow || dnsAttempt === dnsAttempts) break;
    await wait(retryDelayMs);
  }
  if (!dns?.succeeded) {
    return {
      status: 'FAIL_PUBLIC_PROBE_DNS_OBSERVATION',
      dnsObservationStatus: dns?.status ?? 'PUBLIC_PROBE_DNS_OBSERVATION_FAILED',
      dnsPublished: false,
      responses: {}
    };
  }
  if (!dns.published || !insideWindow) {
    return {
      status: 'PASS_PUBLIC_PROBE_OBSERVATION_READY',
      dnsObservationStatus: dns.status,
      endpointObservationStatus: 'NOT_RUN',
      dnsAttempts: dnsAttempt,
      dnsPublished: dns.published,
      responses: {}
    };
  }
  let endpoints;
  let attempt = 0;
  for (attempt = 1; attempt <= endpointAttempts; attempt += 1) {
    endpoints = await probeProductionPublicEndpoints({ hostname, expectedResponses, fetchImpl });
    const expectedResponsesReady = endpoints.succeeded && Object.entries(expectedResponses).every(([path, expectedStatus]) => {
      const response = endpoints.responses[path];
      return response?.status === expectedStatus && response.tlsVerified === true && response.finalHostname === hostname;
    });
    if (expectedResponsesReady || attempt === endpointAttempts) break;
    await wait(retryDelayMs);
  }
  return {
    status: endpoints.status,
    dnsObservationStatus: dns.status,
    dnsAttempts: dnsAttempt,
    endpointObservationStatus: endpoints.status,
    endpointAttempts: attempt,
    dnsPublished: true,
    responses: endpoints.responses
  };
}
