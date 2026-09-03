import { spawnSync } from 'node:child_process';

export const UAT_ACTOR_PROCESS_DEFAULT_TIMEOUT_MS = 10_000;
export const UAT_ACTOR_PROCESS_MAX_TIMEOUT_MS = 60_000;
export const UAT_ACTOR_PROCESS_MAX_BUFFER = 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionUatActorRuntimeError';
  return error;
}

export function runProductionUatActorProcess(args, {
  input,
  timeoutMs = UAT_ACTOR_PROCESS_DEFAULT_TIMEOUT_MS,
  maxBuffer = UAT_ACTOR_PROCESS_MAX_BUFFER,
  spawnClient = spawnSync
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') throw boundedError('UAT_ACTOR_PROCESS_INPUT_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > UAT_ACTOR_PROCESS_MAX_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > UAT_ACTOR_PROCESS_MAX_BUFFER) {
    throw boundedError('UAT_ACTOR_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer,
    ...(input === undefined ? {} : { input })
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('UAT_ACTOR_PROCESS_TIMEOUT');
  if (result?.error || !Number.isInteger(result?.status)) throw boundedError('UAT_ACTOR_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

export function parseProductionUatActorWorkerResult(stdout) {
  try {
    const value = JSON.parse(stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw boundedError('UAT_ACTOR_WORKER_RESULT_INVALID');
  }
}

export async function cleanupProductionUatActorWorker({ removeWorker }) {
  const result = { attempted: typeof removeWorker === 'function', succeeded: false };
  if (!result.attempted) return result;
  try {
    await removeWorker();
    result.succeeded = true;
  } catch {}
  return result;
}
