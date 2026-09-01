import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const OPERATIONAL_HEALTH_PROCESS_TIMEOUT_MS = 10_000;
export const OPERATIONAL_HEALTH_PROCESS_DEFAULT_MAX_BUFFER = 1024 * 1024;
export const OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER = 4 * 1024 * 1024;

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
