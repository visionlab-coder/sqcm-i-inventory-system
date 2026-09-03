import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const HARNESS_CANDIDATE_CONTENT_MAX_FILES = 512;
export const HARNESS_CANDIDATE_CONTENT_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const HARNESS_CANDIDATE_CONTENT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

function contentError(code) {
  const error = new Error(code);
  error.name = 'HarnessCandidateContentError';
  return error;
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameIdentity(before, after) {
  return before.size === after.size
    && before.dev === after.dev
    && before.ino === after.ino
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

function physicalDirectory(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function physicalFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function validateRelativePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.includes('\\') || value.includes('\0')
    || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value)
    || path.posix.normalize(value) !== value
    || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw contentError('HARNESS_CANDIDATE_CONTENT_PATH_INVALID');
  }
  return value;
}

function inspect(root, entries, io) {
  let rootStat; let rootReal;
  try {
    rootStat = io.lstatSync(root);
    rootReal = path.resolve(io.realpathSync(root));
  } catch {
    throw contentError('HARNESS_CANDIDATE_CONTENT_ROOT_NOT_FOUND');
  }
  const files = [];
  for (const entry of entries) {
    try {
      files.push({
        ...entry,
        stat: io.lstatSync(entry.absolutePath),
        real: path.resolve(io.realpathSync(entry.absolutePath))
      });
    } catch {
      throw contentError(`HARNESS_CANDIDATE_CONTENT_FILE_NOT_FOUND:${entry.relativePath}`);
    }
  }
  return { rootStat, rootReal, files };
}

export function readHarnessCandidateContentSnapshot(projectRoot, files, {
  io = fs,
  maxFiles = HARNESS_CANDIDATE_CONTENT_MAX_FILES,
  maxFileBytes = HARNESS_CANDIDATE_CONTENT_MAX_FILE_BYTES,
  maxTotalBytes = HARNESS_CANDIDATE_CONTENT_MAX_TOTAL_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Array.isArray(files) || files.length > maxFiles
    || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > HARNESS_CANDIDATE_CONTENT_MAX_FILES
    || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > HARNESS_CANDIDATE_CONTENT_MAX_FILE_BYTES
    || !Number.isInteger(maxTotalBytes) || maxTotalBytes < 1 || maxTotalBytes > HARNESS_CANDIDATE_CONTENT_MAX_TOTAL_BYTES) {
    throw contentError('HARNESS_CANDIDATE_CONTENT_REFERENCE_INVALID');
  }

  const root = path.resolve(projectRoot);
  const seen = new Set();
  const entries = files.map((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw contentError('HARNESS_CANDIDATE_CONTENT_REFERENCE_INVALID');
    }
    const relativePath = validateRelativePath(file.path);
    const key = process.platform === 'win32' ? relativePath.toLowerCase() : relativePath;
    if (seen.has(key)) throw contentError('HARNESS_CANDIDATE_CONTENT_PATH_DUPLICATE');
    seen.add(key);
    return {
      relativePath,
      expectedSha256: file.sha256,
      absolutePath: path.join(root, ...relativePath.split('/'))
    };
  });

  const before = inspect(root, entries, io);
  if (!physicalDirectory(before.rootStat) || !samePath(before.rootReal, root)) {
    throw contentError('HARNESS_CANDIDATE_CONTENT_ROOT_NOT_PHYSICAL');
  }
  let inspectedTotal = 0;
  for (const entry of before.files) {
    if (!physicalFile(entry.stat) || !samePath(entry.real, entry.absolutePath)) {
      throw contentError(`HARNESS_CANDIDATE_CONTENT_FILE_NOT_PHYSICAL:${entry.relativePath}`);
    }
    if (entry.stat.size < 1 || entry.stat.size > maxFileBytes) {
      throw contentError(`HARNESS_CANDIDATE_CONTENT_FILE_SIZE_INVALID:${entry.relativePath}`);
    }
    inspectedTotal += entry.stat.size;
    if (inspectedTotal > maxTotalBytes) {
      throw contentError('HARNESS_CANDIDATE_CONTENT_TOTAL_SIZE_INVALID');
    }
  }

  const raw = new Map();
  try {
    for (const entry of before.files) {
      const value = io.readFileSync(entry.absolutePath);
      raw.set(entry.relativePath, Buffer.isBuffer(value) ? value : Buffer.from(value));
    }
  } catch {
    throw contentError('HARNESS_CANDIDATE_CONTENT_READ_FAILED');
  }

  const after = inspect(root, entries, io);
  if (!physicalDirectory(after.rootStat) || !samePath(before.rootReal, after.rootReal)
    || !samePath(after.rootReal, root) || !sameIdentity(before.rootStat, after.rootStat)) {
    throw contentError('HARNESS_CANDIDATE_CONTENT_UNSTABLE');
  }
  let actualTotal = 0;
  for (let index = 0; index < before.files.length; index += 1) {
    const previous = before.files[index];
    const current = after.files[index];
    const bytes = raw.get(previous.relativePath);
    if (!physicalFile(current.stat) || !samePath(previous.real, current.real)
      || !samePath(current.real, current.absolutePath) || !sameIdentity(previous.stat, current.stat)
      || bytes.length !== current.stat.size || bytes.length < 1 || bytes.length > maxFileBytes) {
      throw contentError('HARNESS_CANDIDATE_CONTENT_UNSTABLE');
    }
    actualTotal += bytes.length;
    if (actualTotal > maxTotalBytes) throw contentError('HARNESS_CANDIDATE_CONTENT_UNSTABLE');
  }

  return {
    entries: entries.map((entry) => ({
      path: entry.relativePath,
      expectedSha256: entry.expectedSha256,
      sha256: createHash('sha256').update(raw.get(entry.relativePath)).digest('hex'),
      bytes: raw.get(entry.relativePath).length
    })),
    totalBytes: actualTotal
  };
}
