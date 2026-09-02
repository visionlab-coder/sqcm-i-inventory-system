import { spawnSync } from 'node:child_process';
import { resolve4, resolveCname } from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { readBoundedJsonObjectResponse } from './operations-preflight-http-runtime.mjs';

export const INGRESS_COMMAND_TIMEOUT_MS = 10_000;
export const INGRESS_PROVIDER_HTTP_TIMEOUT_MS = 10_000;
export const INGRESS_DNS_TIMEOUT_MS = 5_000;
export const INGRESS_DNS_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
export const INGRESS_CONFIG_MAX_BYTES = 16 * 1024;

function physicalDirectory(stat) {
  return stat?.isDirectory?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function physicalFile(stat) {
  return stat?.isFile?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function sameIdentity(left, right) {
  return left?.size === right?.size
    && left?.dev === right?.dev
    && left?.ino === right?.ino
    && left?.mtimeMs === right?.mtimeMs;
}

export function readProductionIngressConfig({
  runtimeDirectory,
  configPath,
  io = fs,
  maxBytes = INGRESS_CONFIG_MAX_BYTES
} = {}) {
  if (typeof runtimeDirectory !== 'string' || !runtimeDirectory
    || typeof configPath !== 'string' || !configPath) {
    throw new Error('INGRESS_CONFIG_INPUT_INVALID');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > INGRESS_CONFIG_MAX_BYTES) {
    throw new Error('INGRESS_CONFIG_LIMIT_INVALID');
  }
  const root = path.resolve(runtimeDirectory);
  const candidate = path.resolve(configPath);
  if (candidate.toLowerCase() !== path.join(root, 'cloudflared.yml').toLowerCase()) {
    throw new Error('INGRESS_CONFIG_PATH_INVALID');
  }
  let rootBefore;
  let fileBefore;
  let rootRealBefore;
  let fileRealBefore;
  try {
    rootBefore = io.lstatSync(root);
    fileBefore = io.lstatSync(candidate);
    rootRealBefore = path.resolve(io.realpathSync(root));
    fileRealBefore = path.resolve(io.realpathSync(candidate));
  } catch {
    throw new Error('INGRESS_CONFIG_PATH_INVALID');
  }
  if (!physicalDirectory(rootBefore) || !physicalFile(fileBefore)
    || rootRealBefore.toLowerCase() !== root.toLowerCase()
    || fileRealBefore.toLowerCase() !== candidate.toLowerCase()) {
    throw new Error('INGRESS_CONFIG_PATH_INVALID');
  }
  if (fileBefore.size < 1 || fileBefore.size > maxBytes) {
    throw new Error('INGRESS_CONFIG_BYTES_INVALID');
  }
  let raw;
  try { raw = io.readFileSync(fileRealBefore); }
  catch { throw new Error('INGRESS_CONFIG_READ_FAILED'); }
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);

  let rootAfter;
  let fileAfter;
  let rootRealAfter;
  let fileRealAfter;
  try {
    rootAfter = io.lstatSync(root);
    fileAfter = io.lstatSync(candidate);
    rootRealAfter = path.resolve(io.realpathSync(root));
    fileRealAfter = path.resolve(io.realpathSync(candidate));
  } catch {
    throw new Error('INGRESS_CONFIG_UNSTABLE');
  }
  if (!sameIdentity(rootBefore, rootAfter) || !sameIdentity(fileBefore, fileAfter)
    || rootRealAfter.toLowerCase() !== rootRealBefore.toLowerCase()
    || fileRealAfter.toLowerCase() !== fileRealBefore.toLowerCase()
    || raw.length !== fileBefore.size || raw.length < 1 || raw.length > maxBytes) {
    throw new Error('INGRESS_CONFIG_UNSTABLE');
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(raw),
      bytes: raw.length
    };
  } catch {
    throw new Error('INGRESS_CONFIG_UTF8_INVALID');
  }
}

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
  try { body = await readBoundedJsonObjectResponse(response); } catch { throw new Error('INGRESS_PROVIDER_HTTP_INVALID_JSON'); }
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

export async function observeProductionIngressDnsOverHttps({
  hostname,
  fetchImpl = fetch,
  timeoutMs = INGRESS_DNS_TIMEOUT_MS
} = {}) {
  if (typeof hostname !== 'string' || !hostname || typeof fetchImpl !== 'function') {
    return { succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' };
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    return { succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' };
  }
  const query = async (type) => {
    try {
      const url = `${INGRESS_DNS_DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
      const response = await fetchImpl(url, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response?.ok) return null;
      const body = await readBoundedJsonObjectResponse(response);
      if (body?.Status !== 0 && body?.Status !== 3) return null;
      return {
        nxdomain: body.Status === 3,
        published: body.Status === 0 && Array.isArray(body.Answer) && body.Answer.length > 0
      };
    } catch {
      return null;
    }
  };
  const results = await Promise.all(['A', 'CNAME'].map(query));
  const valid = results.filter(Boolean);
  const published = valid.some((item) => item.published);
  const nxdomain = valid.some((item) => item.nxdomain);
  if (published && nxdomain) {
    return { succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' };
  }
  if (published) return { succeeded: true, published: true, status: 'PASS_INGRESS_DNS_DOH_OBSERVATION' };
  if (nxdomain || valid.length === 2) {
    return { succeeded: true, published: false, status: 'PASS_INGRESS_DNS_DOH_OBSERVATION' };
  }
  return { succeeded: false, published: false, status: 'INGRESS_DNS_DOH_FAILED' };
}

export async function observeProductionIngressDnsResilient({
  hostname,
  nativeObserve = ({ hostname: value }) => observeProductionIngressDns({ hostname: value }),
  fallbackObserve = ({ hostname: value }) => observeProductionIngressDnsOverHttps({ hostname: value })
} = {}) {
  let primary;
  try { primary = await nativeObserve({ hostname }); } catch { primary = null; }
  if (primary?.succeeded === true) return primary;
  let fallback;
  try { fallback = await fallbackObserve({ hostname }); } catch { fallback = null; }
  if (fallback?.succeeded === true) {
    return {
      succeeded: true,
      published: fallback.published === true,
      status: 'PASS_INGRESS_DNS_OBSERVATION_FALLBACK'
    };
  }
  return {
    succeeded: false,
    published: false,
    status: 'INGRESS_DNS_PRIMARY_AND_FALLBACK_FAILED'
  };
}
