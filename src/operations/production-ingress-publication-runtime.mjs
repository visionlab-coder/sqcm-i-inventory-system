import { spawnSync } from 'node:child_process';
import { resolve4, resolveCname } from 'node:dns/promises';

export const INGRESS_COMMAND_TIMEOUT_MS = 10_000;
export const INGRESS_PROVIDER_HTTP_TIMEOUT_MS = 10_000;
export const INGRESS_DNS_TIMEOUT_MS = 5_000;

export function runIngressCommand(command, args, {
  timeoutMs = INGRESS_COMMAND_TIMEOUT_MS,
  execute = spawnSync
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('INGRESS_COMMAND_TIMEOUT_INVALID');
  if (typeof execute !== 'function') throw new Error('INGRESS_COMMAND_EXECUTOR_INVALID');
  try {
    const result = execute(command, args, {
      encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024
    });
    if (result?.error?.code === 'ETIMEDOUT' || result?.signal === 'SIGTERM') return { ok: false, stdout: '', failure: 'COMMAND_TIMEOUT' };
    if (result?.error || result?.status !== 0) return { ok: false, stdout: '', failure: 'COMMAND_FAILED' };
    return { ok: true, stdout: String(result.stdout ?? '').trim(), failure: null };
  } catch (error) {
    const timedOut = error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM';
    return { ok: false, stdout: '', failure: timedOut ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED' };
  }
}

export async function requestCloudflareJson({
  url, token, options = {}, timeoutMs = INGRESS_PROVIDER_HTTP_TIMEOUT_MS, fetchImpl = fetch
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('INGRESS_PROVIDER_HTTP_TIMEOUT_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('INGRESS_PROVIDER_HTTP_CLIENT_INVALID');
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) }
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new Error('INGRESS_PROVIDER_HTTP_TIMEOUT');
    throw new Error('INGRESS_PROVIDER_HTTP_FAILED');
  }
  let body;
  try { body = await response.json(); } catch { throw new Error('INGRESS_PROVIDER_HTTP_INVALID_JSON'); }
  if (!response.ok || body?.success !== true) throw new Error('INGRESS_PROVIDER_HTTP_REJECTED');
  return body.result;
}

export async function observeProductionIngressDns({
  hostname, resolveIpv4 = resolve4, resolveAlias = resolveCname, timeoutMs = INGRESS_DNS_TIMEOUT_MS
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('INGRESS_DNS_TIMEOUT_INVALID');
  let timer;
  const observation = Promise.allSettled([
    Promise.resolve().then(() => resolveIpv4(hostname)),
    Promise.resolve().then(() => resolveAlias(hostname))
  ]).then((results) => ({ timedOut: false, results }));
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true, results: [] }), timeoutMs); });
  const result = await Promise.race([observation, timeout]);
  clearTimeout(timer);
  if (result.timedOut) return { succeeded: false, published: false, status: 'INGRESS_DNS_OBSERVATION_TIMEOUT' };
  const published = result.results.some((item) => item.status === 'fulfilled' && Array.isArray(item.value) && item.value.length > 0);
  return { succeeded: true, published, status: 'PASS_INGRESS_DNS_OBSERVATION' };
}
