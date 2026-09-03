import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export const BACKUP_RESTORE_MAX_TIMEOUT_MS = 60 * 60 * 1000;
export const BACKUP_RESTORE_DEFAULT_STDERR_BYTES = 64 * 1024;

function boundedError(status) {
  const error = new Error(status);
  error.name = 'OperationsBackupRestoreRuntimeError';
  return error;
}

function validateProfile({ executable, args, timeoutMs, maxStderrBytes, failureStatus, timeoutStatus, outputLimitStatus }) {
  if (typeof executable !== 'string' || executable.length < 1 || !Array.isArray(args)
    || !args.every((value) => typeof value === 'string')
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BACKUP_RESTORE_MAX_TIMEOUT_MS
    || !Number.isInteger(maxStderrBytes) || maxStderrBytes < 1 || maxStderrBytes > 1024 * 1024
    || !failureStatus || !timeoutStatus || !outputLimitStatus) {
    throw boundedError('BACKUP_RESTORE_RUNTIME_PROFILE_INVALID');
  }
}

export async function runBoundedBackupRestoreProcess({
  executable,
  args = [],
  stdin = null,
  stdout = null,
  timeoutMs = BACKUP_RESTORE_MAX_TIMEOUT_MS,
  maxStderrBytes = BACKUP_RESTORE_DEFAULT_STDERR_BYTES,
  failureStatus,
  timeoutStatus,
  outputLimitStatus = 'BACKUP_RESTORE_STDERR_LIMIT',
  spawnClient = spawn
}) {
  validateProfile({ executable, args, timeoutMs, maxStderrBytes, failureStatus, timeoutStatus, outputLimitStatus });
  const child = spawnClient(executable, args, {
    stdio: [stdin ? 'pipe' : 'ignore', stdout ? 'pipe' : 'ignore', 'pipe'],
    windowsHide: true,
    shell: false
  });
  let stderrBytes = 0;
  let terminalStatus = null;
  child.stderr?.on('data', (chunk) => {
    stderrBytes += Buffer.byteLength(chunk);
    if (stderrBytes > maxStderrBytes && !terminalStatus) {
      terminalStatus = outputLimitStatus;
      child.kill('SIGKILL');
    }
  });
  const timer = setTimeout(() => {
    if (!terminalStatus) terminalStatus = timeoutStatus;
    child.kill('SIGKILL');
  }, timeoutMs);
  timer.unref?.();

  const exit = new Promise((resolve) => {
    child.once('error', () => resolve({ error: true }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const streams = [];
  const guardStream = (streamPromise) => streamPromise.catch(() => {
    if (!terminalStatus) terminalStatus = failureStatus;
    child.kill('SIGKILL');
    throw boundedError(failureStatus);
  });
  if (stdin) streams.push(guardStream(pipeline(stdin, child.stdin)));
  if (stdout) streams.push(guardStream(pipeline(child.stdout, stdout)));
  const settled = await Promise.allSettled([...streams, exit]);
  clearTimeout(timer);
  if (terminalStatus) throw boundedError(terminalStatus);
  const exitResult = settled.at(-1)?.value;
  if (!exitResult || exitResult.error || exitResult.code !== 0 || exitResult.signal) throw boundedError(failureStatus);
  if (settled.slice(0, -1).some((result) => result.status === 'rejected')) throw boundedError(failureStatus);
  return { exitCode: 0, stderrBytes, stderrTruncated: false };
}

export function runBoundedBackupRestoreCapture({
  executable,
  args = [],
  timeoutMs = 30_000,
  maxOutputBytes = 4 * 1024 * 1024,
  failureStatus,
  timeoutStatus,
  spawnSyncClient = spawnSync
}) {
  validateProfile({
    executable,
    args,
    timeoutMs,
    maxStderrBytes: Math.min(maxOutputBytes, 1024 * 1024),
    failureStatus,
    timeoutStatus,
    outputLimitStatus: 'BACKUP_RESTORE_CAPTURE_LIMIT'
  });
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 4 * 1024 * 1024) {
    throw boundedError('BACKUP_RESTORE_RUNTIME_PROFILE_INVALID');
  }
  const result = spawnSyncClient(executable, args, {
    encoding: 'utf8', windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: maxOutputBytes
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError(timeoutStatus);
  if (result?.error?.code === 'ENOBUFS') throw boundedError('BACKUP_RESTORE_CAPTURE_LIMIT');
  if (result?.error || result?.status !== 0 || result?.signal) throw boundedError(failureStatus);
  return String(result.stdout ?? '').trim();
}

export function startBoundedBackupRestoreInteractive({
  executable,
  args = [],
  timeoutMs = 30_000,
  maxStderrBytes = BACKUP_RESTORE_DEFAULT_STDERR_BYTES,
  failureStatus,
  timeoutStatus,
  outputLimitStatus = 'BACKUP_RESTORE_STDERR_LIMIT',
  spawnClient = spawn
}) {
  validateProfile({ executable, args, timeoutMs, maxStderrBytes, failureStatus, timeoutStatus, outputLimitStatus });
  const child = spawnClient(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
  let terminalStatus = null;
  let stderrBytes = 0;
  child.stderr.on('data', (chunk) => {
    stderrBytes += Buffer.byteLength(chunk);
    if (stderrBytes > maxStderrBytes && !terminalStatus) {
      terminalStatus = outputLimitStatus;
      child.kill('SIGKILL');
    }
  });
  const timer = setTimeout(() => {
    if (!terminalStatus) terminalStatus = timeoutStatus;
    child.kill('SIGKILL');
  }, timeoutMs);
  timer.unref?.();
  const completion = new Promise((resolve, reject) => {
    child.once('error', () => reject(boundedError(failureStatus)));
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (terminalStatus) reject(boundedError(terminalStatus));
      else if (code !== 0 || signal) reject(boundedError(failureStatus));
      else resolve({ exitCode: 0, stderrBytes, stderrTruncated: false });
    });
  });
  completion.catch(() => {});
  return { child, completion, abort() { child.kill('SIGKILL'); } };
}
