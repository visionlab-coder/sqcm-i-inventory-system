import {
  INGRESS_COMMAND_TIMEOUT_MS,
  INGRESS_DNS_TIMEOUT_MS,
  INGRESS_PROVIDER_HTTP_TIMEOUT_MS,
  observeProductionIngressDns,
  observeProductionIngressDnsResilient,
  requestCloudflareJson,
  runIngressCommand
} from './production-ingress-publication-runtime.mjs';

export const ROUTE_DISABLE_COMMAND_TIMEOUT_MS = INGRESS_COMMAND_TIMEOUT_MS;
export const ROUTE_DISABLE_PROVIDER_HTTP_TIMEOUT_MS = INGRESS_PROVIDER_HTTP_TIMEOUT_MS;
export const ROUTE_DISABLE_DNS_TIMEOUT_MS = INGRESS_DNS_TIMEOUT_MS;

const PRODUCTION_TUNNEL_NAME = 'sqcm-i-inventory-production';
const TUNNEL_ID_PATTERN = /^[a-f0-9-]{36}$/i;

export function observeProductionRouteDisableTunnel({
  cloudflared,
  tunnelName = PRODUCTION_TUNNEL_NAME,
  runCommand = runIngressCommand
} = {}) {
  const result = runCommand(cloudflared, ['tunnel', 'list', '--output', 'json'], {
    timeoutMs: ROUTE_DISABLE_COMMAND_TIMEOUT_MS
  });
  if (!result?.ok) {
    return {
      succeeded: false,
      tunnelId: null,
      status: result?.failure === 'COMMAND_TIMEOUT'
        ? 'ROUTE_DISABLE_TUNNEL_OBSERVATION_TIMEOUT'
        : 'ROUTE_DISABLE_TUNNEL_OBSERVATION_FAILED'
    };
  }

  let tunnels;
  try { tunnels = JSON.parse(result.stdout); } catch {
    return { succeeded: false, tunnelId: null, status: 'ROUTE_DISABLE_TUNNEL_OBSERVATION_INVALID' };
  }
  if (!Array.isArray(tunnels)) {
    return { succeeded: false, tunnelId: null, status: 'ROUTE_DISABLE_TUNNEL_OBSERVATION_INVALID' };
  }
  const matches = tunnels.filter((item) => item?.name === tunnelName);
  if (matches.length === 0) {
    return { succeeded: true, tunnelId: null, status: 'PASS_ROUTE_DISABLE_TUNNEL_OBSERVATION' };
  }
  if (matches.length !== 1 || !TUNNEL_ID_PATTERN.test(matches[0]?.id ?? '')) {
    return { succeeded: false, tunnelId: null, status: 'ROUTE_DISABLE_TUNNEL_IDENTITY_AMBIGUOUS' };
  }
  return { succeeded: true, tunnelId: matches[0].id, status: 'PASS_ROUTE_DISABLE_TUNNEL_OBSERVATION' };
}

export async function requestRouteDisableCloudflareJson({
  url,
  token,
  options = {},
  timeoutMs = ROUTE_DISABLE_PROVIDER_HTTP_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  try {
    return await requestCloudflareJson({ url, token, options, timeoutMs, fetchImpl });
  } catch (error) {
    const mapped = {
      INGRESS_PROVIDER_HTTP_TIMEOUT: 'ROUTE_DISABLE_PROVIDER_HTTP_TIMEOUT',
      INGRESS_PROVIDER_HTTP_FAILED: 'ROUTE_DISABLE_PROVIDER_HTTP_FAILED',
      INGRESS_PROVIDER_HTTP_INVALID_JSON: 'ROUTE_DISABLE_PROVIDER_HTTP_INVALID_JSON',
      INGRESS_PROVIDER_HTTP_REJECTED: 'ROUTE_DISABLE_PROVIDER_HTTP_REJECTED',
      INGRESS_PROVIDER_HTTP_TIMEOUT_INVALID: 'ROUTE_DISABLE_PROVIDER_HTTP_TIMEOUT_INVALID',
      INGRESS_PROVIDER_HTTP_CLIENT_INVALID: 'ROUTE_DISABLE_PROVIDER_HTTP_CLIENT_INVALID'
    }[error?.message];
    throw new Error(mapped ?? 'ROUTE_DISABLE_PROVIDER_HTTP_FAILED');
  }
}

export async function observeProductionRouteDisableDns({
  hostname,
  resolveIpv4,
  resolveAlias,
  timeoutMs = ROUTE_DISABLE_DNS_TIMEOUT_MS
} = {}) {
  const result = resolveIpv4 || resolveAlias
    ? await observeProductionIngressDns({ hostname, resolveIpv4, resolveAlias, timeoutMs })
    : await observeProductionIngressDnsResilient({ hostname });
  if (!result.succeeded) {
    return {
      succeeded: false,
      published: false,
      status: result.status === 'INGRESS_DNS_OBSERVATION_TIMEOUT'
        ? 'ROUTE_DISABLE_DNS_OBSERVATION_TIMEOUT'
        : 'ROUTE_DISABLE_DNS_OBSERVATION_FAILED'
    };
  }
  return { succeeded: true, published: result.published, status: 'PASS_ROUTE_DISABLE_DNS_OBSERVATION' };
}
