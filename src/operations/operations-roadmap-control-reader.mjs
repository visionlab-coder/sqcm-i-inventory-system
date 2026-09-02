import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const OPERATIONS_ROADMAP_CONTROL_MAX_BYTES = 1024 * 1024;
const ROADMAP_RELATIVE_PATH = ['agent docs', 'harness', 'MASTER_ROADMAP.json'];

function roadmapError(code) {
  const error = new Error(code);
  error.name = 'OperationsRoadmapControlError';
  return error;
}

function samePhysicalPath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameIdentity(before, after) {
  return before.size === after.size
    && (!Number.isInteger(before.dev) || !Number.isInteger(after.dev) || before.dev === after.dev)
    && (!Number.isInteger(before.ino) || !Number.isInteger(after.ino) || before.ino === after.ino)
    && (!Number.isFinite(before.mtimeMs) || !Number.isFinite(after.mtimeMs) || before.mtimeMs === after.mtimeMs);
}

function physicalDirectory(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function physicalFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

export function readOperationsRoadmapControl(projectRoot, {
  io = fs,
  maxBytes = OPERATIONS_ROADMAP_CONTROL_MAX_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > OPERATIONS_ROADMAP_CONTROL_MAX_BYTES) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_REFERENCE_INVALID');
  }

  const root = path.resolve(projectRoot);
  const candidate = path.join(root, ...ROADMAP_RELATIVE_PATH);
  let rootBefore; let rootRealBefore; let before; let realBefore;
  try {
    rootBefore = io.lstatSync(root);
    rootRealBefore = path.resolve(io.realpathSync(root));
    before = io.lstatSync(candidate);
    realBefore = path.resolve(io.realpathSync(candidate));
  } catch {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_NOT_FOUND');
  }
  if (!physicalDirectory(rootBefore) || !samePhysicalPath(rootRealBefore, root)) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_ROOT_NOT_PHYSICAL');
  }
  if (!physicalFile(before) || !samePhysicalPath(realBefore, candidate)) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_FILE_NOT_PHYSICAL');
  }
  if (before.size < 1 || before.size > maxBytes) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_SIZE_INVALID');
  }

  let raw;
  try { raw = io.readFileSync(candidate); }
  catch { throw roadmapError('OPERATIONS_ROADMAP_CONTROL_READ_FAILED'); }
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);
  if (raw.length !== before.size || raw.length < 1 || raw.length > maxBytes) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_UNSTABLE');
  }

  let rootAfter; let rootRealAfter; let after; let realAfter;
  try {
    rootAfter = io.lstatSync(root);
    rootRealAfter = path.resolve(io.realpathSync(root));
    after = io.lstatSync(candidate);
    realAfter = path.resolve(io.realpathSync(candidate));
  } catch {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_UNSTABLE');
  }
  if (!physicalDirectory(rootAfter) || !physicalFile(after)
    || !samePhysicalPath(rootRealBefore, rootRealAfter) || !samePhysicalPath(rootRealAfter, root)
    || !samePhysicalPath(realBefore, realAfter) || !samePhysicalPath(realAfter, candidate)
    || !sameIdentity(rootBefore, rootAfter) || !sameIdentity(before, after)) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_UNSTABLE');
  }

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw roadmapError('OPERATIONS_ROADMAP_CONTROL_UTF8_INVALID'); }
  let value;
  try { value = JSON.parse(source); }
  catch { throw roadmapError('OPERATIONS_ROADMAP_CONTROL_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw roadmapError('OPERATIONS_ROADMAP_CONTROL_JSON_INVALID');
  }

  return {
    value,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex')
  };
}
