import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const CUTOVER_GATE_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

function inputError(code) {
  const error = new Error(code);
  error.name = 'CutoverGateEvidenceInputError';
  return error;
}

function samePath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function physicalDirectory(stat) {
  return stat?.isDirectory?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function physicalFile(stat) {
  return stat?.isFile?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function sameIdentity(left, right) {
  return left?.size === right?.size
    && left?.dev === right?.dev
    && left?.ino === right?.ino
    && left?.mtimeMs === right?.mtimeMs
    && left?.ctimeMs === right?.ctimeMs;
}

export function readCutoverGateEvidenceFile(filePath, {
  repositoryRoot = process.cwd(),
  allowTemplate = false,
  io = fs,
  maxBytes = CUTOVER_GATE_EVIDENCE_MAX_BYTES
} = {}) {
  if (typeof repositoryRoot !== 'string' || !repositoryRoot
    || typeof filePath !== 'string' || !filePath
    || path.extname(filePath).toLowerCase() !== '.json') {
    throw inputError('CUTOVER_GATE_EVIDENCE_REFERENCE_INVALID');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > CUTOVER_GATE_EVIDENCE_MAX_BYTES) {
    throw inputError('CUTOVER_GATE_EVIDENCE_LIMIT_INVALID');
  }

  const root = path.resolve(repositoryRoot);
  const candidate = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const officialTemplate = path.join(root, 'docs', 'templates', 'cutover-evidence.example.json');
  if (allowTemplate && !samePath(candidate, officialTemplate)) {
    throw inputError('CUTOVER_GATE_TEMPLATE_PATH_INVALID');
  }

  let rootBefore;
  let fileBefore;
  let rootRealBefore;
  let fileRealBefore;
  try {
    rootBefore = io.lstatSync(root);
    fileBefore = io.lstatSync(candidate);
    rootRealBefore = path.resolve(io.realpathSync(root));
    fileRealBefore = path.resolve(io.realpathSync(candidate));
  } catch {
    throw inputError('CUTOVER_GATE_EVIDENCE_REFERENCE_INVALID');
  }
  if (!physicalDirectory(rootBefore) || !physicalFile(fileBefore)
    || !samePath(rootRealBefore, root) || !samePath(fileRealBefore, candidate)) {
    throw inputError('CUTOVER_GATE_EVIDENCE_REFERENCE_INVALID');
  }
  if (fileBefore.size < 1 || fileBefore.size > maxBytes) {
    throw inputError('CUTOVER_GATE_EVIDENCE_BYTES_INVALID');
  }

  let raw;
  try { raw = io.readFileSync(fileRealBefore); }
  catch { throw inputError('CUTOVER_GATE_EVIDENCE_READ_FAILED'); }
  if (!Buffer.isBuffer(raw)) throw inputError('CUTOVER_GATE_EVIDENCE_BYTES_INVALID');

  let rootAfter;
  let fileAfter;
  let rootRealAfter;
  let fileRealAfter;
  try {
    rootAfter = io.lstatSync(root);
    fileAfter = io.lstatSync(candidate);
    rootRealAfter = path.resolve(io.realpathSync(root));
    fileRealAfter = path.resolve(io.realpathSync(candidate));
  } catch {
    throw inputError('CUTOVER_GATE_EVIDENCE_UNSTABLE');
  }
  if (!physicalDirectory(rootAfter) || !physicalFile(fileAfter)
    || !samePath(rootRealAfter, rootRealBefore) || !samePath(fileRealAfter, fileRealBefore)
    || !samePath(rootRealAfter, root) || !samePath(fileRealAfter, candidate)
    || !sameIdentity(rootBefore, rootAfter) || !sameIdentity(fileBefore, fileAfter)
    || raw.length !== fileBefore.size || raw.length < 1 || raw.length > maxBytes) {
    throw inputError('CUTOVER_GATE_EVIDENCE_UNSTABLE');
  }

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw inputError('CUTOVER_GATE_EVIDENCE_UTF8_INVALID'); }
  let value;
  try { value = JSON.parse(source); }
  catch { throw inputError('CUTOVER_GATE_EVIDENCE_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw inputError('CUTOVER_GATE_EVIDENCE_JSON_INVALID');
  }

  return {
    path: candidate,
    value,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex')
  };
}
