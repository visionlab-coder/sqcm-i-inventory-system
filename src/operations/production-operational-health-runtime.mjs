import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

export const OPERATIONAL_HEALTH_PROCESS_TIMEOUT_MS = 10_000;
export const OPERATIONAL_HEALTH_PROCESS_DEFAULT_MAX_BUFFER = 1024 * 1024;
export const OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER = 4 * 1024 * 1024;
export const OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES = 64 * 1024;
export const OPERATIONAL_HEALTH_BACKUP_MANIFEST_NAME_PATTERN = /^seowon-inventory-\d{8}T\d{6}Z\.dump\.json$/;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionOperationalHealthRuntimeError';
  return error;
}

export function runOperationalHealthProcess(args, {
  spawnClient = spawnSync,
  timeoutMs = OPERATIONAL_HEALTH_PROCESS_TIMEOUT_MS,
  maxBuffer = OPERATIONAL_HEALTH_PROCESS_DEFAULT_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') throw boundedError('OPERATIONAL_HEALTH_PROCESS_INPUT_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > OPERATIONAL_HEALTH_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER) {
    throw boundedError('OPERATIONAL_HEALTH_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8', windowsHide: true, timeout: timeoutMs, maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('OPERATIONAL_HEALTH_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('OPERATIONAL_HEALTH_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

export function parseOperationalHealthContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw boundedError('OPERATIONAL_HEALTH_CONTAINER_RESULT_INVALID');
  return ids[0];
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/.test(value)) throw boundedError('OPERATIONAL_HEALTH_DB_RESULT_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw boundedError('OPERATIONAL_HEALTH_DB_RESULT_INVALID');
  return parsed;
}

export function parseOperationalHealthCounters(stdout) {
  const fields = String(stdout ?? '').trim().split(',');
  if (fields.length !== 3) throw boundedError('OPERATIONAL_HEALTH_DB_RESULT_INVALID');
  return fields.map(parseNonNegativeInteger);
}

export function countOperationalHealthRecent5xx({ stdout = '', stderr = '' } = {}) {
  let count = 0;
  for (const line of `${stdout}\n${stderr}`.split(/\r?\n/).filter(Boolean)) {
    let record;
    try { record = JSON.parse(line); } catch { throw boundedError('OPERATIONAL_HEALTH_LOG_RESULT_INVALID'); }
    if (!record || Array.isArray(record) || typeof record !== 'object') throw boundedError('OPERATIONAL_HEALTH_LOG_RESULT_INVALID');
    if (record.event === 'http_request' && Number(record.status) >= 500) count += 1;
  }
  return count;
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function physicalDirectory(root, io, errorCode) {
  const resolved = path.resolve(root);
  let stat;
  try { stat = io.lstatSync(resolved); } catch { throw boundedError(errorCode); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) {
    throw boundedError(errorCode);
  }
  let real;
  try { real = path.resolve(io.realpathSync(resolved)); } catch { throw boundedError(errorCode); }
  if (real.toLowerCase() !== resolved.toLowerCase()) throw boundedError(errorCode);
  return { resolved, real };
}

export function readOperationalHealthBackupManifest({
  backupRoot,
  manifestPath,
  io = fs,
  maxBytes = OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES
} = {}) {
  if (typeof backupRoot !== 'string' || !backupRoot || typeof manifestPath !== 'string' || !manifestPath) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_INPUT_INVALID');
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_LIMIT_INVALID');
  }
  const root = physicalDirectory(backupRoot, io, 'OPERATIONAL_HEALTH_BACKUP_ROOT_INVALID');
  const candidate = path.resolve(manifestPath);
  if (!candidate.endsWith('.dump.json') || !pathInside(root.resolved, candidate)) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID');
  }
  let stat;
  try { stat = io.lstatSync(candidate); } catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID'); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID');
  }
  let candidateReal;
  try { candidateReal = path.resolve(io.realpathSync(candidate)); } catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID'); }
  if (!pathInside(root.real, candidateReal)) throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID');
  if (stat.size < 1 || stat.size > maxBytes) throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_BYTES_INVALID');

  let raw;
  try { raw = io.readFileSync(candidateReal); } catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_READ_FAILED'); }
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);
  if (raw.length !== stat.size || raw.length < 1 || raw.length > maxBytes) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_BYTES_INVALID');
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_VALUE_INVALID'); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_JSON_INVALID');
  }
  return {
    value,
    path: candidateReal,
    bytes: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex')
  };
}

export async function verifyOperationalHealthBackupFile({ backupRoot, manifest, io = fs } = {}) {
  if (typeof backupRoot !== 'string' || !backupRoot || !manifest || typeof manifest !== 'object') {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_INPUT_INVALID');
  }
  const root = path.resolve(backupRoot);
  const rootStat = io.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.isReparsePoint?.() ?? false)) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_ROOT_INVALID');
  }
  const rootReal = path.resolve(io.realpathSync(root));
  const candidate = path.resolve(String(manifest.backupPath ?? ''));
  if (!pathInside(root, candidate)) throw boundedError('OPERATIONAL_HEALTH_BACKUP_PATH_INVALID');
  const fileStat = io.lstatSync(candidate);
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || (fileStat.isReparsePoint?.() ?? false)) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_PATH_INVALID');
  }
  const candidateReal = path.resolve(io.realpathSync(candidate));
  if (!pathInside(rootReal, candidateReal)) throw boundedError('OPERATIONAL_HEALTH_BACKUP_PATH_INVALID');
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || fileStat.size !== manifest.bytes) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_BYTES_INVALID');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 ?? ''))) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_CHECKSUM_INVALID');
  }
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of io.createReadStream(candidateReal)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  if (bytes !== fileStat.size) throw boundedError('OPERATIONAL_HEALTH_BACKUP_BYTES_INVALID');
  const digest = hash.digest('hex');
  if (digest.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_CHECKSUM_INVALID');
  }
  return { backupVerified: true, bytes, sha256: digest };
}

export async function selectLatestVerifiedOperationalHealthBackup({
  backupRoot,
  requireRestoreVerified = false,
  io = fs
} = {}) {
  if (typeof requireRestoreVerified !== 'boolean') {
    throw boundedError('OPERATIONAL_HEALTH_BACKUP_SELECTION_INPUT_INVALID');
  }
  const root = physicalDirectory(backupRoot, io, 'OPERATIONAL_HEALTH_BACKUP_ROOT_INVALID');
  let names;
  try { names = io.readdirSync(root.resolved).filter((name) => OPERATIONAL_HEALTH_BACKUP_MANIFEST_NAME_PATTERN.test(name)).sort(); }
  catch { throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_READ_FAILED'); }
  const candidates = names.map((name) => {
    const loaded = readOperationalHealthBackupManifest({ backupRoot: root.resolved, manifestPath: path.join(root.resolved, name), io });
    const manifest = loaded.value;
    const createdAtMs = Date.parse(manifest.createdAt);
    if (manifest.schemaVersion !== 1 || !Number.isFinite(createdAtMs)
      || typeof manifest.backupPath !== 'string' || !manifest.backupPath
      || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1
      || !/^[a-f0-9]{64}$/i.test(String(manifest.sha256 ?? ''))
      || (requireRestoreVerified && manifest.restoreVerified !== true)) {
      throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_CONTRACT_INVALID');
    }
    return { manifest, loaded, createdAtMs };
  }).sort((left, right) => right.createdAtMs - left.createdAtMs);
  if (candidates.length === 0) throw boundedError('OPERATIONAL_HEALTH_BACKUP_MANIFEST_MISSING');
  const selected = candidates[0];
  const verified = await verifyOperationalHealthBackupFile({ backupRoot: root.resolved, manifest: selected.manifest, io });
  return {
    ...selected.manifest,
    manifestPath: selected.loaded.path,
    manifestBytes: selected.loaded.bytes,
    manifestSha256: selected.loaded.sha256,
    backupVerified: verified.backupVerified,
    bytes: verified.bytes,
    sha256: verified.sha256
  };
}
