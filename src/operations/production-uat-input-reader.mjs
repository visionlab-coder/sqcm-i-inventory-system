import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const PRODUCTION_UAT_INPUT_MAX_BYTES = 64 * 1024;

function inputError(code) {
  const error = new Error(code);
  error.name = 'ProductionUatInputError';
  return error;
}

function pathInsideOrEqual(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function samePhysicalPath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function physicalDirectory(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function physicalFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function sameIdentity(before, after) {
  return before.size === after.size && before.dev === after.dev && before.ino === after.ino
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

function inspectReference(filePath, { repositoryRoot, io, maxBytes }) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)
    || path.extname(filePath).toLowerCase() !== '.json'
    || typeof repositoryRoot !== 'string' || !repositoryRoot
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > PRODUCTION_UAT_INPUT_MAX_BYTES) {
    throw inputError('PRODUCTION_UAT_INPUT_REFERENCE_INVALID');
  }
  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(filePath);
  if (pathInsideOrEqual(repository, candidate)) throw inputError('PRODUCTION_UAT_INPUT_REFERENCE_INVALID');

  let repositoryStat;
  let repositoryReal;
  let candidateStat;
  let candidateReal;
  try {
    repositoryStat = io.lstatSync(repository);
    repositoryReal = path.resolve(io.realpathSync(repository));
    candidateStat = io.lstatSync(candidate);
    candidateReal = path.resolve(io.realpathSync(candidate));
  } catch { throw inputError('PRODUCTION_UAT_INPUT_REFERENCE_INVALID'); }
  if (!physicalDirectory(repositoryStat) || !samePhysicalPath(repositoryReal, repository)
    || !physicalFile(candidateStat) || !samePhysicalPath(candidateReal, candidate)
    || pathInsideOrEqual(repositoryReal, candidateReal)
    || candidateStat.size < 1 || candidateStat.size > maxBytes) {
    throw inputError('PRODUCTION_UAT_INPUT_REFERENCE_INVALID');
  }
  return { repository, repositoryStat, repositoryReal, candidate, candidateStat, candidateReal };
}

export function inspectProductionUatJsonReference(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = PRODUCTION_UAT_INPUT_MAX_BYTES
} = {}) {
  try {
    const inspected = inspectReference(filePath, { repositoryRoot, io, maxBytes });
    return { present: true, path: inspected.candidateReal, bytes: inspected.candidateStat.size };
  } catch {
    return { present: false, path: null, bytes: 0 };
  }
}

export function readProductionUatJsonDocument(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = PRODUCTION_UAT_INPUT_MAX_BYTES
} = {}) {
  const before = inspectReference(filePath, { repositoryRoot, io, maxBytes });
  let raw;
  try { raw = io.readFileSync(before.candidateReal); } catch {
    throw inputError('PRODUCTION_UAT_INPUT_READ_FAILED');
  }
  if (!Buffer.isBuffer(raw) || raw.length !== before.candidateStat.size || raw.length > maxBytes) {
    throw inputError('PRODUCTION_UAT_INPUT_UNSTABLE');
  }

  try {
    const repositoryAfter = io.lstatSync(before.repository);
    const repositoryRealAfter = path.resolve(io.realpathSync(before.repository));
    const candidateAfter = io.lstatSync(before.candidate);
    const candidateRealAfter = path.resolve(io.realpathSync(before.candidate));
    if (!physicalDirectory(repositoryAfter) || !sameIdentity(before.repositoryStat, repositoryAfter)
      || !samePhysicalPath(before.repositoryReal, repositoryRealAfter)
      || !samePhysicalPath(repositoryRealAfter, before.repository)
      || !physicalFile(candidateAfter) || !sameIdentity(before.candidateStat, candidateAfter)
      || !samePhysicalPath(before.candidateReal, candidateRealAfter)
      || !samePhysicalPath(candidateRealAfter, before.candidate)
      || pathInsideOrEqual(repositoryRealAfter, candidateRealAfter)) {
      throw inputError('PRODUCTION_UAT_INPUT_UNSTABLE');
    }
  } catch (error) {
    if (error?.name === 'ProductionUatInputError') throw error;
    throw inputError('PRODUCTION_UAT_INPUT_UNSTABLE');
  }

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch {
    throw inputError('PRODUCTION_UAT_INPUT_UTF8_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { throw inputError('PRODUCTION_UAT_INPUT_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw inputError('PRODUCTION_UAT_INPUT_JSON_INVALID');
  }
  return {
    value,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    path: before.candidateReal
  };
}
