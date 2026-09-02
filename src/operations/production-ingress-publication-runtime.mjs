import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve4, resolveCname } from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';
import { readBoundedJsonObjectResponse } from './operations-preflight-http-runtime.mjs';

export const INGRESS_COMMAND_TIMEOUT_MS = 10_000;
export const INGRESS_PROVIDER_HTTP_TIMEOUT_MS = 10_000;
export const INGRESS_DNS_TIMEOUT_MS = 5_000;
export const INGRESS_DNS_DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
export const INGRESS_CONFIG_MAX_BYTES = 16 * 1024;
export const INGRESS_CREDENTIAL_MAX_BYTES = 64 * 1024;
export const INGRESS_PUBLICATION_LEASE_MAX_BYTES = 4 * 1024;
export const INGRESS_PUBLICATION_LEASE_BASENAME = '.production-ingress-publication.lock';

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

function exactPhysicalDirectory(directory, io) {
  let stat;
  let real;
  try {
    stat = io.lstatSync(directory);
    real = path.resolve(io.realpathSync(directory));
  } catch {
    return false;
  }
  return physicalDirectory(stat) && real.toLowerCase() === path.resolve(directory).toLowerCase();
}

function exactPhysicalFile(filePath, io, maxBytes) {
  let stat;
  let real;
  try {
    stat = io.lstatSync(filePath);
    real = path.resolve(io.realpathSync(filePath));
  } catch {
    return false;
  }
  return physicalFile(stat)
    && real.toLowerCase() === path.resolve(filePath).toLowerCase()
    && stat.size > 0
    && stat.size <= maxBytes;
}

export function writeProductionIngressConfigCreateOnly({
  runtimeDirectory,
  configPath,
  content,
  processId = process.pid,
  io = fs
} = {}) {
  const root = typeof runtimeDirectory === 'string' && runtimeDirectory ? path.resolve(runtimeDirectory) : null;
  const output = typeof configPath === 'string' && configPath ? path.resolve(configPath) : null;
  const bytes = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0;
  if (!root || !output || output.toLowerCase() !== path.join(root, 'cloudflared.yml').toLowerCase()
    || !exactPhysicalDirectory(root, io)) throw new Error('INGRESS_CONFIG_OUTPUT_PATH_INVALID');
  if (bytes < 1 || bytes > INGRESS_CONFIG_MAX_BYTES) throw new Error('INGRESS_CONFIG_BYTES_INVALID');
  if (io.existsSync(output)) throw new Error('INGRESS_CONFIG_ALREADY_EXISTS');

  const temporary = path.join(root, `.${path.basename(output)}.${processId}.tmp`);
  let handle;
  try {
    handle = io.openSync(temporary, 'wx', 0o600);
    io.writeFileSync(handle, content, 'utf8');
    io.fsyncSync(handle);
    io.closeSync(handle);
    handle = undefined;
    io.linkSync(temporary, output);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('INGRESS_CONFIG_ALREADY_EXISTS');
    throw error;
  } finally {
    if (handle !== undefined) {
      try { io.closeSync(handle); } catch { /* best effort */ }
    }
    try { if (io.existsSync(temporary)) io.unlinkSync(temporary); } catch { /* best effort */ }
  }
  return output;
}

export function publishProductionTunnelCredential({
  credentialDirectory,
  temporaryPath,
  finalPath,
  io = fs
} = {}) {
  const root = typeof credentialDirectory === 'string' && credentialDirectory ? path.resolve(credentialDirectory) : null;
  const temporary = typeof temporaryPath === 'string' && temporaryPath ? path.resolve(temporaryPath) : null;
  const output = typeof finalPath === 'string' && finalPath ? path.resolve(finalPath) : null;
  if (!root || !temporary || !output || !exactPhysicalDirectory(root, io)
    || path.dirname(temporary).toLowerCase() !== root.toLowerCase()
    || path.basename(temporary) !== 'sqcm-i-inventory-production.json.tmp'
    || path.dirname(output).toLowerCase() !== root.toLowerCase()
    || !/^[a-f0-9-]{36}\.json$/i.test(path.basename(output))
    || !exactPhysicalFile(temporary, io, INGRESS_CREDENTIAL_MAX_BYTES)) {
    throw new Error('INGRESS_CREDENTIAL_OUTPUT_PATH_INVALID');
  }
  if (io.existsSync(output)) throw new Error('INGRESS_CREDENTIAL_ALREADY_EXISTS');

  let handle;
  let published = false;
  try {
    handle = io.openSync(temporary, 'r+');
    io.fsyncSync(handle);
    io.closeSync(handle);
    handle = undefined;
    io.linkSync(temporary, output);
    published = true;
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('INGRESS_CREDENTIAL_ALREADY_EXISTS');
    throw error;
  } finally {
    if (handle !== undefined) {
      try { io.closeSync(handle); } catch { /* best effort */ }
    }
    if (published) io.unlinkSync(temporary);
  }
  return output;
}

export function acquireProductionIngressPublicationLease({
  runtimeDirectory,
  processId = process.pid,
  leaseId = randomUUID(),
  checkedAt = new Date().toISOString(),
  io = fs
} = {}) {
  const root = typeof runtimeDirectory === 'string' && runtimeDirectory ? path.resolve(runtimeDirectory) : null;
  if (!root || !exactPhysicalDirectory(root, io)
    || !Number.isSafeInteger(processId) || processId < 1
    || !/^[a-f0-9-]{36}$/i.test(leaseId)
    || Number.isNaN(Date.parse(checkedAt))) {
    throw new Error('INGRESS_PUBLICATION_LEASE_INPUT_INVALID');
  }
  const leasePath = path.join(root, INGRESS_PUBLICATION_LEASE_BASENAME);
  const document = {
    schemaVersion: 1,
    leaseId,
    processId,
    acquiredAt: new Date(checkedAt).toISOString(),
    secretValuesRecorded: false
  };
  writeCreateOnlyJsonOutput(leasePath, document, {
    processId,
    io,
    alreadyExistsCode: 'INGRESS_PUBLICATION_LEASE_HELD'
  });
  return { path: leasePath, root, leaseId, processId, acquiredAt: document.acquiredAt };
}

export function releaseProductionIngressPublicationLease(lease, { io = fs } = {}) {
  const root = typeof lease?.root === 'string' && lease.root ? path.resolve(lease.root) : null;
  const leasePath = typeof lease?.path === 'string' && lease.path ? path.resolve(lease.path) : null;
  if (!root || !leasePath || leasePath.toLowerCase() !== path.join(root, INGRESS_PUBLICATION_LEASE_BASENAME).toLowerCase()
    || !exactPhysicalDirectory(root, io)) throw new Error('INGRESS_PUBLICATION_LEASE_INPUT_INVALID');

  let before;
  let real;
  let handle;
  let raw;
  let after;
  try {
    before = io.lstatSync(leasePath);
    real = path.resolve(io.realpathSync(leasePath));
    if (!physicalFile(before) || real.toLowerCase() !== leasePath.toLowerCase()
      || before.size < 1 || before.size > INGRESS_PUBLICATION_LEASE_MAX_BYTES) {
      throw new Error('INGRESS_PUBLICATION_LEASE_STATE_INVALID');
    }
    handle = io.openSync(leasePath, 'r');
    const opened = io.fstatSync(handle);
    if (!sameIdentity(before, opened)) throw new Error('INGRESS_PUBLICATION_LEASE_STATE_UNSTABLE');
    raw = io.readFileSync(handle);
    after = io.fstatSync(handle);
    if (!sameIdentity(opened, after) || raw.length !== opened.size) {
      throw new Error('INGRESS_PUBLICATION_LEASE_STATE_UNSTABLE');
    }
  } catch (error) {
    if (/^INGRESS_PUBLICATION_LEASE_/.test(error?.message || '')) throw error;
    throw new Error('INGRESS_PUBLICATION_LEASE_STATE_INVALID');
  } finally {
    if (handle !== undefined) {
      try { io.closeSync(handle); } catch { /* best effort */ }
    }
  }

  let document;
  try {
    document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new Error('INGRESS_PUBLICATION_LEASE_STATE_INVALID');
  }
  if (!document || Array.isArray(document) || document.schemaVersion !== 1
    || document.leaseId !== lease.leaseId || document.processId !== lease.processId
    || document.acquiredAt !== lease.acquiredAt || document.secretValuesRecorded !== false) {
    throw new Error('INGRESS_PUBLICATION_LEASE_OWNERSHIP_MISMATCH');
  }
  let current;
  try { current = io.lstatSync(leasePath); } catch { throw new Error('INGRESS_PUBLICATION_LEASE_STATE_UNSTABLE'); }
  if (!sameIdentity(before, current)) throw new Error('INGRESS_PUBLICATION_LEASE_STATE_UNSTABLE');
  io.unlinkSync(leasePath);
  return true;
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
