import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const OPERATIONS_ACTIVATION_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const OPERATIONS_SECRET_INPUT_MAX_BYTES = 64 * 1024;

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

function readExternalPhysicalInput(filePath, {
  repositoryRoot,
  io,
  maxBytes,
  maximumAllowedBytes,
  errorPrefix
}) {
  if (typeof filePath !== 'string' || !filePath.trim() || !path.isAbsolute(filePath)
    || typeof repositoryRoot !== 'string' || !repositoryRoot
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > maximumAllowedBytes) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(filePath);
  if (pathInsideOrEqual(repository, candidate)) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  let repositoryReal;
  let stat;
  try {
    const repositoryStat = io.lstatSync(repository);
    if (!repositoryStat.isDirectory() || repositoryStat.isSymbolicLink() || (repositoryStat.isReparsePoint?.() ?? false)) {
      throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
    }
    repositoryReal = path.resolve(io.realpathSync(repository));
    stat = io.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') throw inputError(`${errorPrefix}_NOT_FOUND`);
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || stat.size < 1 || stat.size > maxBytes) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  let candidateReal;
  let raw;
  try {
    candidateReal = path.resolve(io.realpathSync(candidate));
    if (!samePhysicalPath(candidateReal, candidate) || pathInsideOrEqual(repositoryReal, candidateReal)) {
      throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
    }
    raw = io.readFileSync(candidateReal);
  } catch (error) {
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }
  if (!Buffer.isBuffer(raw) || raw.length !== stat.size || raw.length > maxBytes) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  return {
    raw,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    path: candidateReal
  };
}

export function readOperationsActivationInputDocument(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = OPERATIONS_ACTIVATION_INPUT_MAX_BYTES
} = {}) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.json') {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID');
  }
  const input = readExternalPhysicalInput(filePath, {
    repositoryRoot,
    io,
    maxBytes,
    maximumAllowedBytes: OPERATIONS_ACTIVATION_INPUT_MAX_BYTES,
    errorPrefix: 'OPERATIONS_ACTIVATION_INPUT'
  });

  let value;
  try { value = JSON.parse(input.raw.toString('utf8')); }
  catch { throw inputError('OPERATIONS_ACTIVATION_INPUT_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw inputError('OPERATIONS_ACTIVATION_INPUT_JSON_INVALID');
  }

  return {
    value,
    bytes: input.bytes,
    sha256: input.sha256,
    path: input.path
  };
}

export function readOperationsSecretInput(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = OPERATIONS_SECRET_INPUT_MAX_BYTES
} = {}) {
  const input = readExternalPhysicalInput(filePath, {
    repositoryRoot,
    io,
    maxBytes,
    maximumAllowedBytes: OPERATIONS_SECRET_INPUT_MAX_BYTES,
    errorPrefix: 'OPERATIONS_SECRET_INPUT'
  });

  let value;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(input.raw).trim(); }
  catch { throw inputError('OPERATIONS_SECRET_INPUT_VALUE_INVALID'); }
  if (!value || value.includes('\u0000')) throw inputError('OPERATIONS_SECRET_INPUT_VALUE_INVALID');

  return {
    value,
    bytes: input.bytes,
    sha256: input.sha256,
    path: input.path
  };
}
