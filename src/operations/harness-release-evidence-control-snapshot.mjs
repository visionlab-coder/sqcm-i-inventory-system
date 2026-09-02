import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const HARNESS_RELEASE_EVIDENCE_CONTROL_MAX_BYTES = 1024 * 1024;

const RELATIVE_FILES = Object.freeze({
  candidate: ['agent docs', 'harness', 'P2_RELEASE_CANDIDATE.json'],
  remoteEvidence: ['agent docs', 'harness', 'P2_REMOTE_EVIDENCE.json']
});

function controlError(code) {
  const error = new Error(code);
  error.name = 'HarnessReleaseEvidenceControlError';
  return error;
}

function samePath(left, right) {
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

function optionalFile(file, io) {
  try {
    return { stat: io.lstatSync(file), real: path.resolve(io.realpathSync(file)) };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_NOT_FOUND');
  }
}

function inspect(root, directory, files, io) {
  let rootStat; let rootReal; let directoryStat; let directoryReal;
  try {
    rootStat = io.lstatSync(root);
    rootReal = path.resolve(io.realpathSync(root));
    directoryStat = io.lstatSync(directory);
    directoryReal = path.resolve(io.realpathSync(directory));
  } catch {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_NOT_FOUND');
  }
  return {
    rootStat,
    rootReal,
    directoryStat,
    directoryReal,
    entries: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, optionalFile(file, io)]))
  };
}

function decodeObject(raw) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_UTF8_INVALID'); }
  let value;
  try { value = JSON.parse(source); }
  catch { throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_JSON_INVALID');
  }
  return value;
}

export function readHarnessReleaseEvidenceControlSnapshot(projectRoot, {
  io = fs,
  maxBytes = HARNESS_RELEASE_EVIDENCE_CONTROL_MAX_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Number.isInteger(maxBytes) || maxBytes < 1
    || maxBytes > HARNESS_RELEASE_EVIDENCE_CONTROL_MAX_BYTES) {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_REFERENCE_INVALID');
  }

  const root = path.resolve(projectRoot);
  const directory = path.join(root, 'agent docs', 'harness');
  const files = Object.fromEntries(
    Object.entries(RELATIVE_FILES).map(([name, segments]) => [name, path.join(root, ...segments)])
  );
  const before = inspect(root, directory, files, io);
  if (!physicalDirectory(before.rootStat) || !samePath(before.rootReal, root)
    || !physicalDirectory(before.directoryStat) || !samePath(before.directoryReal, directory)) {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_ROOT_NOT_PHYSICAL');
  }
  if (!before.entries.candidate) {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_NOT_FOUND');
  }
  for (const [name, file] of Object.entries(files)) {
    const entry = before.entries[name];
    if (!entry) continue;
    if (!physicalFile(entry.stat) || !samePath(entry.real, file)) {
      throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_FILE_NOT_PHYSICAL');
    }
    if (entry.stat.size < 1 || entry.stat.size > maxBytes) {
      throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_SIZE_INVALID');
    }
  }

  const raw = {};
  try {
    for (const [name, file] of Object.entries(files)) {
      if (!before.entries[name]) continue;
      const value = io.readFileSync(file);
      raw[name] = Buffer.isBuffer(value) ? value : Buffer.from(value);
    }
  } catch {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_READ_FAILED');
  }

  const after = inspect(root, directory, files, io);
  if (!physicalDirectory(after.rootStat) || !physicalDirectory(after.directoryStat)
    || !samePath(before.rootReal, after.rootReal) || !samePath(after.rootReal, root)
    || !samePath(before.directoryReal, after.directoryReal) || !samePath(after.directoryReal, directory)
    || !sameIdentity(before.rootStat, after.rootStat)
    || !sameIdentity(before.directoryStat, after.directoryStat)) {
    throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_UNSTABLE');
  }
  for (const [name, file] of Object.entries(files)) {
    const beforeEntry = before.entries[name];
    const afterEntry = after.entries[name];
    if (Boolean(beforeEntry) !== Boolean(afterEntry)) {
      throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_UNSTABLE');
    }
    if (!beforeEntry) continue;
    if (!physicalFile(afterEntry.stat)
      || !samePath(beforeEntry.real, afterEntry.real) || !samePath(afterEntry.real, file)
      || !sameIdentity(beforeEntry.stat, afterEntry.stat)
      || raw[name].length !== afterEntry.stat.size
      || raw[name].length < 1 || raw[name].length > maxBytes) {
      throw controlError('HARNESS_RELEASE_EVIDENCE_CONTROL_UNSTABLE');
    }
  }

  const entry = (name) => raw[name] ? {
    value: decodeObject(raw[name]),
    bytes: raw[name].length,
    sha256: createHash('sha256').update(raw[name]).digest('hex')
  } : null;
  return { candidate: entry('candidate'), remoteEvidence: entry('remoteEvidence') };
}
