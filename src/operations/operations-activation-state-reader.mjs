import fs from 'node:fs';
import path from 'node:path';

export const OPERATIONS_ACTIVATION_STATE_MAX_BYTES = 64 * 1024;

function invalidState() {
  return new Error('OPERATIONS_ACTIVATION_STATE_INVALID');
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function physicalDirectory(candidate) {
  let stat;
  let real;
  try {
    stat = fs.lstatSync(candidate);
    real = fs.realpathSync(candidate);
  } catch {
    throw invalidState();
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false) || !samePath(real, candidate)) {
    throw invalidState();
  }
  return { stat, real: path.resolve(real) };
}

export function readOperationsActivationStateDocument(candidate, {
  expectedDirectory,
  expectedBasename,
  io = fs
} = {}) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)
    || typeof expectedDirectory !== 'string' || !path.isAbsolute(expectedDirectory)
    || typeof expectedBasename !== 'string' || expectedBasename !== path.basename(expectedBasename)
    || expectedBasename.length === 0) {
    throw invalidState();
  }

  const directoryBefore = physicalDirectory(expectedDirectory);
  const resolved = path.resolve(candidate);
  const expected = path.resolve(expectedDirectory, expectedBasename);
  if (!samePath(resolved, expected) || path.basename(resolved) !== expectedBasename) throw invalidState();

  let before;
  let realBefore;
  try {
    before = io.lstatSync(resolved);
    realBefore = io.realpathSync(resolved);
  } catch {
    throw invalidState();
  }
  if (!before.isFile() || before.isSymbolicLink() || (before.isReparsePoint?.() ?? false)
    || !samePath(realBefore, resolved)
    || before.size < 1 || before.size > OPERATIONS_ACTIVATION_STATE_MAX_BYTES) {
    throw invalidState();
  }

  let raw;
  try {
    raw = io.readFileSync(resolved);
  } catch {
    throw invalidState();
  }
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);
  if (raw.length !== before.size || raw.length < 1 || raw.length > OPERATIONS_ACTIVATION_STATE_MAX_BYTES) {
    throw invalidState();
  }

  let after;
  let realAfter;
  try {
    after = io.lstatSync(resolved);
    realAfter = io.realpathSync(resolved);
  } catch {
    throw invalidState();
  }
  const directoryAfter = physicalDirectory(expectedDirectory);
  if (!after.isFile() || after.isSymbolicLink() || (after.isReparsePoint?.() ?? false)
    || !samePath(realAfter, resolved) || after.size !== before.size
    || (Number.isInteger(before.dev) && Number.isInteger(after.dev) && before.dev !== after.dev)
    || (Number.isInteger(before.ino) && Number.isInteger(after.ino) && before.ino !== after.ino)
    || !samePath(directoryBefore.real, directoryAfter.real)
    || (Number.isInteger(directoryBefore.stat.dev) && Number.isInteger(directoryAfter.stat.dev)
      && directoryBefore.stat.dev !== directoryAfter.stat.dev)
    || (Number.isInteger(directoryBefore.stat.ino) && Number.isInteger(directoryAfter.stat.ino)
      && directoryBefore.stat.ino !== directoryAfter.stat.ino)) {
    throw invalidState();
  }

  let text;
  let value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    value = JSON.parse(text);
  } catch {
    throw invalidState();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidState();

  return { path: path.resolve(realAfter), bytes: raw.length, value };
}
