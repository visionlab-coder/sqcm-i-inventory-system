import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const OPERATIONS_ACTIVATION_INPUT_MAX_BYTES = 4 * 1024 * 1024;

function inputError(code) {
  const error = new Error(code);
  error.name = 'OperationsActivationInputError';
  return error;
}

function pathInsideOrEqual(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function samePhysicalPath(left, right) {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function readOperationsActivationInputDocument(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = OPERATIONS_ACTIVATION_INPUT_MAX_BYTES
} = {}) {
  if (typeof filePath !== 'string' || !filePath.trim() || !path.isAbsolute(filePath)
    || path.extname(filePath).toLowerCase() !== '.json'
    || typeof repositoryRoot !== 'string' || !repositoryRoot
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > OPERATIONS_ACTIVATION_INPUT_MAX_BYTES) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }

  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(filePath);
  if (pathInsideOrEqual(repository, candidate)) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }

  let repositoryReal;
  let stat;
  try {
    const repositoryStat = io.lstatSync(repository);
    if (!repositoryStat.isDirectory() || repositoryStat.isSymbolicLink() || (repositoryStat.isReparsePoint?.() ?? false)) {
      throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
    }
    repositoryReal = path.resolve(io.realpathSync(repository));
    stat = io.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') throw inputError('OPERATIONS_ACTIVATION_INPUT_NOT_FOUND');
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || stat.size < 1 || stat.size > maxBytes) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }

  let candidateReal;
  let raw;
  try {
    candidateReal = path.resolve(io.realpathSync(candidate));
    if (!samePhysicalPath(candidateReal, candidate) || pathInsideOrEqual(repositoryReal, candidateReal)) {
      throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
    }
    raw = io.readFileSync(candidateReal);
  } catch (error) {
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }
  if (!Buffer.isBuffer(raw) || raw.length !== stat.size || raw.length > maxBytes) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }

  let value;
  try { value = JSON.parse(raw.toString('utf8')); }
  catch { throw inputError('OPERATIONS_ACTIVATION_INPUT_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_JSON_INVALID');
  }

  return {
    value,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    path: candidateReal
  };
}
