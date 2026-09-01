import { spawnSync } from 'node:child_process';

export const PROVIDER_PREFLIGHT_PROCESS_DEFAULT_TIMEOUT_MS = 10_000;
export const PROVIDER_PREFLIGHT_PROCESS_MAX_TIMEOUT_MS = 150_000;
export const PROVIDER_PREFLIGHT_PROCESS_MAX_BUFFER = 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionProviderPreflightRuntimeError';
  return error;
}

export function runProductionProviderPreflightProcess(args, {
  spawnClient = spawnSync,
  timeoutMs = PROVIDER_PREFLIGHT_PROCESS_DEFAULT_TIMEOUT_MS,
  maxBuffer = PROVIDER_PREFLIGHT_PROCESS_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') {
    throw boundedError('PROVIDER_PREFLIGHT_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PROVIDER_PREFLIGHT_PROCESS_MAX_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > PROVIDER_PREFLIGHT_PROCESS_MAX_BUFFER) {
    throw boundedError('PROVIDER_PREFLIGHT_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('PROVIDER_PREFLIGHT_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('PROVIDER_PREFLIGHT_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

export function parseProductionProviderContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw boundedError('PROVIDER_PREFLIGHT_CONTAINER_RESULT_INVALID');
  }
  return ids[0];
}

export function parseProductionProviderObservation(stdout) {
  const lines = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  try {
    const value = JSON.parse(lines.at(-1));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    return value;
  } catch {
    throw boundedError('PROVIDER_PREFLIGHT_OBSERVATION_INVALID');
  }
}
