import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const PRODUCTION_CUTOVER_EVIDENCE_CONTROL_MAX_BYTES = 1024 * 1024;

const CONTROL_FILES = Object.freeze({
  g3: ['agent docs', 'harness', 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json'],
  g4: ['agent docs', 'harness', 'P6_G4_CUTOVER_PREFLIGHT_EVIDENCE.json'],
  p5: ['agent docs', 'harness', 'P5_G2_STAGING_UAT_SIGNOFF_EVIDENCE.json'],
  provider: ['agent docs', 'harness', 'P6_G4_PROVIDER_PREFLIGHT_EVIDENCE.json'],
  candidate: ['agent docs', 'harness', 'P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json']
});

function controlError(code) {
  const error = new Error(code);
  error.name = 'ProductionCutoverEvidenceControlError';
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

function inspect(root, files, io) {
  try {
    return {
      rootStat: io.lstatSync(root),
      rootReal: path.resolve(io.realpathSync(root)),
      entries: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, {
        stat: io.lstatSync(file),
        real: path.resolve(io.realpathSync(file))
      }]))
    };
  } catch {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_NOT_FOUND');
  }
}

function decodeObject(raw) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UTF8_INVALID'); }
  let value;
  try { value = JSON.parse(source); }
  catch { throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_JSON_INVALID');
  }
  return value;
}

export function readProductionCutoverEvidenceControlSnapshot(projectRoot, {
  io = fs,
  maxBytes = PRODUCTION_CUTOVER_EVIDENCE_CONTROL_MAX_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || !Number.isInteger(maxBytes) || maxBytes < 1
    || maxBytes > PRODUCTION_CUTOVER_EVIDENCE_CONTROL_MAX_BYTES) {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_REFERENCE_INVALID');
  }
  const root = path.resolve(projectRoot);
  const files = Object.fromEntries(Object.entries(CONTROL_FILES).map(([name, segments]) => [name, path.join(root, ...segments)]));
  const before = inspect(root, files, io);
  if (!physicalDirectory(before.rootStat) || !samePath(before.rootReal, root)) {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_ROOT_NOT_PHYSICAL');
  }
  for (const [name, file] of Object.entries(files)) {
    const entry = before.entries[name];
    if (!physicalFile(entry.stat) || !samePath(entry.real, file)) {
      throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_FILE_NOT_PHYSICAL');
    }
    if (entry.stat.size < 1 || entry.stat.size > maxBytes) {
      throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_SIZE_INVALID');
    }
  }

  const raw = {};
  try {
    for (const [name, file] of Object.entries(files)) {
      const value = io.readFileSync(file);
      raw[name] = Buffer.isBuffer(value) ? value : Buffer.from(value);
    }
  } catch {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_READ_FAILED');
  }

  const after = inspect(root, files, io);
  if (!physicalDirectory(after.rootStat)
    || !samePath(before.rootReal, after.rootReal)
    || !samePath(after.rootReal, root)
    || !sameIdentity(before.rootStat, after.rootStat)) {
    throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UNSTABLE');
  }
  for (const [name, file] of Object.entries(files)) {
    const beforeEntry = before.entries[name];
    const afterEntry = after.entries[name];
    if (!physicalFile(afterEntry.stat)
      || !samePath(beforeEntry.real, afterEntry.real)
      || !samePath(afterEntry.real, file)
      || !sameIdentity(beforeEntry.stat, afterEntry.stat)
      || raw[name].length !== afterEntry.stat.size
      || raw[name].length < 1
      || raw[name].length > maxBytes) {
      throw controlError('PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UNSTABLE');
    }
  }

  return Object.fromEntries(Object.keys(files).map((name) => [name, {
    value: decodeObject(raw[name]),
    bytes: raw[name].length,
    sha256: createHash('sha256').update(raw[name]).digest('hex')
  }]));
}
