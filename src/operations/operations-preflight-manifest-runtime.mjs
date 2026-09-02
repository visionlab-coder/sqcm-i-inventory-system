import fs from 'node:fs';
import path from 'node:path';

export const OPERATIONS_PREFLIGHT_MANIFEST_MAX_BYTES = 1024 * 1024;

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function boundedError(code) {
  return new Error(code);
}

export function readOperationsPreflightManifest(
  candidate,
  {
    cwd = process.cwd(),
    maximumBytes = OPERATIONS_PREFLIGHT_MANIFEST_MAX_BYTES,
    io = fs
  } = {}
) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_PATH_INVALID');
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_LIMIT_INVALID');
  }
  const resolved = path.resolve(cwd, candidate);
  if (path.extname(resolved).toLowerCase() !== '.json') {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_PATH_INVALID');
  }

  let before;
  let realPath;
  try {
    before = io.lstatSync(resolved);
    realPath = path.resolve(io.realpathSync(resolved));
  } catch {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_NOT_FOUND');
  }
  if (!before.isFile() || before.isSymbolicLink?.() || comparablePath(realPath) !== comparablePath(resolved)) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_NOT_PHYSICAL');
  }
  if (!Number.isSafeInteger(before.size) || before.size < 1) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_EMPTY');
  }
  if (before.size > maximumBytes) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_TOO_LARGE');
  }

  let bytes;
  try {
    bytes = io.readFileSync(resolved);
  } catch {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_READ_FAILED');
  }
  if (!(bytes instanceof Uint8Array)) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_READ_FAILED');
  }
  if (bytes.byteLength < 1) throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_EMPTY');
  if (bytes.byteLength > maximumBytes) throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_TOO_LARGE');

  let after;
  let afterRealPath;
  try {
    after = io.lstatSync(resolved);
    afterRealPath = path.resolve(io.realpathSync(resolved));
  } catch {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_CHANGED_DURING_READ');
  }
  if (!after.isFile() || after.isSymbolicLink?.()
    || comparablePath(afterRealPath) !== comparablePath(resolved)
    || after.size !== before.size
    || bytes.byteLength !== after.size) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_CHANGED_DURING_READ');
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_INVALID_UTF8');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_INVALID_JSON_OBJECT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw boundedError('OPERATIONS_PREFLIGHT_MANIFEST_INVALID_JSON_OBJECT');
  }
  return { path: realPath, bytes: bytes.byteLength, value };
}
