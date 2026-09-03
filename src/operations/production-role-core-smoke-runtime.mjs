import { readBoundedJsonObjectResponse } from './operations-preflight-http-runtime.mjs';

export const ROLE_SMOKE_HTTP_TIMEOUT_MS = 10_000;

export async function requestRoleSmokeHttp({
  url,
  options = {},
  timeoutMs = ROLE_SMOKE_HTTP_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  if (!url || typeof url !== 'string') throw new Error('ROLE_SMOKE_HTTP_URL_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('ROLE_SMOKE_HTTP_TIMEOUT_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('ROLE_SMOKE_HTTP_CLIENT_INVALID');
  try {
    return await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new Error('ROLE_SMOKE_HTTP_TIMEOUT');
    throw new Error('ROLE_SMOKE_HTTP_FAILED');
  }
}

export async function readRoleSmokeJson(response) {
  try { return await readBoundedJsonObjectResponse(response); } catch { return {}; }
}

export async function cleanupRoleSmokeSession({ session, logout } = {}) {
  if (!session?.cookie || !session?.token || typeof logout !== 'function') {
    return { attempted: false, succeeded: false };
  }
  try {
    await logout(session);
    return { attempted: true, succeeded: true };
  } catch {
    return { attempted: true, succeeded: false };
  }
}
