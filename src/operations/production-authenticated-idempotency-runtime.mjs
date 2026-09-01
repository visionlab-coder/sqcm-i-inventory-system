import { spawnSync } from 'node:child_process';

export const AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT_MS = 10_000;
export const AUTHENTICATED_IDEMPOTENCY_PROCESS_TIMEOUT_MS = 10_000;
export const AUTHENTICATED_IDEMPOTENCY_PROCESS_MAX_BUFFER = 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'AuthenticatedIdempotencyRuntimeError';
  return error;
}

export async function requestAuthenticatedIdempotencyHttp({
  url,
  options = {},
  fetchClient = fetch,
  timeoutMs = AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT_MS
}) {
  if (typeof url !== 'string' || !url || typeof fetchClient !== 'function') {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_HTTP_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT_MS) {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT_INVALID');
  }
  try {
    return await fetchClient(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR') {
      throw boundedError('AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT');
    }
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_HTTP_FAILED');
  }
}

export async function readAuthenticatedIdempotencyJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function runAuthenticatedIdempotencyProcess(command, args, {
  spawnClient = spawnSync,
  timeoutMs = AUTHENTICATED_IDEMPOTENCY_PROCESS_TIMEOUT_MS,
  maxBuffer = AUTHENTICATED_IDEMPOTENCY_PROCESS_MAX_BUFFER
} = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || typeof spawnClient !== 'function') {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > AUTHENTICATED_IDEMPOTENCY_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > AUTHENTICATED_IDEMPOTENCY_PROCESS_MAX_BUFFER) {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_PROCESS_TIMEOUT');
  }
  if (result?.error || result?.status !== 0) {
    throw boundedError('AUTHENTICATED_IDEMPOTENCY_PROCESS_FAILED');
  }
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

export async function cleanupAuthenticatedIdempotencyRun({ cleanupDatabase, logout }) {
  const result = {
    databaseCleanupAttempted: typeof cleanupDatabase === 'function',
    databaseCleanupSucceeded: false,
    logoutAttempted: typeof logout === 'function',
    logoutSucceeded: false
  };
  if (result.databaseCleanupAttempted) {
    try {
      await cleanupDatabase();
      result.databaseCleanupSucceeded = true;
    } catch {}
  }
  if (result.logoutAttempted) {
    try {
      await logout();
      result.logoutSucceeded = true;
    } catch {}
  }
  return result;
}
