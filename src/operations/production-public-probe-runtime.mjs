import { observeProductionIngressDns } from './production-ingress-publication-runtime.mjs';

export const PUBLIC_PROBE_DNS_TIMEOUT_MS = 5_000;
export const PUBLIC_PROBE_HTTP_TIMEOUT_MS = 10_000;

export async function observeProductionPublicDns({
  hostname,
  resolveIpv4,
  resolveAlias,
  timeoutMs = PUBLIC_PROBE_DNS_TIMEOUT_MS
} = {}) {
  const result = await observeProductionIngressDns({ hostname, resolveIpv4, resolveAlias, timeoutMs });
  if (!result.succeeded) {
    return {
      succeeded: false,
      published: false,
      status: result.status === 'INGRESS_DNS_OBSERVATION_TIMEOUT'
        ? 'PUBLIC_PROBE_DNS_OBSERVATION_TIMEOUT'
        : 'PUBLIC_PROBE_DNS_OBSERVATION_FAILED'
    };
  }
  return { succeeded: true, published: result.published, status: 'PASS_PUBLIC_PROBE_DNS_OBSERVATION' };
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
  fetchImpl = fetch
} = {}) {
  const dns = await observeDns({ hostname });
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
      dnsPublished: dns.published,
      responses: {}
    };
  }
  const endpoints = await probeProductionPublicEndpoints({ hostname, expectedResponses, fetchImpl });
  return {
    status: endpoints.status,
    dnsObservationStatus: dns.status,
    endpointObservationStatus: endpoints.status,
    dnsPublished: true,
    responses: endpoints.responses
  };
}
