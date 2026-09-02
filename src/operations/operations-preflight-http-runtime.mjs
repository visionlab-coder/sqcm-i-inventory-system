export const OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES = 1024 * 1024;

function declaredContentLength(response) {
  const raw = response?.headers?.get?.('content-length');
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_CONTENT_LENGTH');
  }
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes)) {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_CONTENT_LENGTH');
  }
  return bytes;
}

export async function consumeBoundedResponseBody(
  response,
  { maximumBytes = OPERATIONS_PREFLIGHT_RESPONSE_MAX_BYTES } = {}
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_LIMIT');
  }
  const declaredBytes = declaredContentLength(response);
  if (declaredBytes !== null && declaredBytes > maximumBytes) {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_TOO_LARGE');
  }
  if (!response?.body) return new Uint8Array(0);
  if (typeof response.body.getReader !== 'function') {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_BODY');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_BODY');
      }
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error?.message?.startsWith('OPERATIONS_PREFLIGHT_RESPONSE_')) throw error;
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_READ_FAILED');
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedJsonObjectResponse(response, options) {
  const bytes = await consumeBoundedResponseBody(response, options);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_UTF8');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_JSON_OBJECT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OPERATIONS_PREFLIGHT_RESPONSE_INVALID_JSON_OBJECT');
  }
  return value;
}
