import { spawnSync } from 'node:child_process';

export const CSRF_BASELINE_TIMEOUT_MS = 10_000;
export const CSRF_BASELINE_PROCESS_MAX_BUFFER = 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionCsrfIdempotencyBaselineRuntimeError';
  return error;
}

export function runCsrfIdempotencyBaselineProcess(args, {
  spawnClient = spawnSync,
  timeoutMs = CSRF_BASELINE_TIMEOUT_MS,
  maxBuffer = CSRF_BASELINE_PROCESS_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') {
    throw boundedError('CSRF_BASELINE_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CSRF_BASELINE_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > CSRF_BASELINE_PROCESS_MAX_BUFFER) {
    throw boundedError('CSRF_BASELINE_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('CSRF_BASELINE_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('CSRF_BASELINE_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

export async function requestCsrfIdempotencyBaseline({
  url,
  options = {},
  fetchClient = fetch,
  timeoutMs = CSRF_BASELINE_TIMEOUT_MS
}) {
  if (typeof url !== 'string' || !url || typeof fetchClient !== 'function') {
    throw boundedError('CSRF_BASELINE_HTTP_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CSRF_BASELINE_TIMEOUT_MS) {
    throw boundedError('CSRF_BASELINE_HTTP_LIMIT_INVALID');
  }
  try {
    return await fetchClient(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR') {
      throw boundedError('CSRF_BASELINE_HTTP_TIMEOUT');
    }
    throw boundedError('CSRF_BASELINE_HTTP_FAILED');
  }
}

export async function readCsrfIdempotencyBaselineJson(response) {
  try { return await response.json(); } catch { return {}; }
}

export function parseCsrfIdempotencyBaselineContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw boundedError('CSRF_BASELINE_CONTAINER_RESULT_INVALID');
  }
  return ids[0];
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/.test(value)) throw boundedError('CSRF_BASELINE_DB_RESULT_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw boundedError('CSRF_BASELINE_DB_RESULT_INVALID');
  return parsed;
}

export function parseCsrfIdempotencyBaselineCount(stdout) {
  return parseNonNegativeInteger(String(stdout ?? '').trim());
}

export function parseCsrfIdempotencyBaselineSchema(stdout) {
  const fields = String(stdout ?? '').trim().split(',');
  if (fields.length !== 5) throw boundedError('CSRF_BASELINE_DB_RESULT_INVALID');
  return fields.map(parseNonNegativeInteger);
}
