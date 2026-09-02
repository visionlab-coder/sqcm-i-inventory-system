import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const OPERATIONS_ACTIVATION_INPUT_MAX_BYTES = 4 * 1024 * 1024;
export const OPERATIONS_TEXT_INPUT_MAX_BYTES = 64 * 1024;
export const OPERATIONS_SECRET_INPUT_MAX_BYTES = OPERATIONS_TEXT_INPUT_MAX_BYTES;

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

function sameFileIdentity(before, after) {
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

  let repositoryStat;
  let repositoryReal;
  let stat;
  let candidateReal;
  try {
    repositoryStat = io.lstatSync(repository);
    if (!physicalDirectory(repositoryStat)) {
      throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
    }
    repositoryReal = path.resolve(io.realpathSync(repository));
    stat = io.lstatSync(candidate);
    candidateReal = path.resolve(io.realpathSync(candidate));
  } catch (error) {
    if (error?.code === 'ENOENT') throw inputError(`${errorPrefix}_NOT_FOUND`);
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }
  if (!samePhysicalPath(repositoryReal, repository) || !physicalFile(stat)
    || !samePhysicalPath(candidateReal, candidate) || pathInsideOrEqual(repositoryReal, candidateReal)
    || stat.size < 1 || stat.size > maxBytes) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  let raw;
  try {
    raw = io.readFileSync(candidateReal);
  } catch (error) {
    if (error?.name === 'OperationsActivationInputError') throw error;
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }
  if (!Buffer.isBuffer(raw) || raw.length !== stat.size || raw.length > maxBytes) {
    throw inputError(`${errorPrefix}_REFERENCE_INVALID`);
  }

  let repositoryAfter;
  let repositoryRealAfter;
  let after;
  let candidateRealAfter;
  try {
    repositoryAfter = io.lstatSync(repository);
    repositoryRealAfter = path.resolve(io.realpathSync(repository));
    after = io.lstatSync(candidate);
    candidateRealAfter = path.resolve(io.realpathSync(candidate));
  } catch {
    throw inputError(`${errorPrefix}_UNSTABLE`);
  }
  if (!physicalDirectory(repositoryAfter) || !physicalFile(after)
    || !samePhysicalPath(repositoryReal, repositoryRealAfter) || !samePhysicalPath(repositoryRealAfter, repository)
    || !samePhysicalPath(candidateReal, candidateRealAfter) || !samePhysicalPath(candidateRealAfter, candidate)
    || pathInsideOrEqual(repositoryRealAfter, candidateRealAfter)
    || !sameFileIdentity(repositoryStat, repositoryAfter) || !sameFileIdentity(stat, after)) {
    throw inputError(`${errorPrefix}_UNSTABLE`);
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

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(input.raw); }
  catch { throw inputError('OPERATIONS_ACTIVATION_INPUT_UTF8_INVALID'); }
  let value;
  try { value = JSON.parse(source); }
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

function readBoundedTextInput(filePath, {
  repositoryRoot,
  io,
  maxBytes,
  maximumAllowedBytes,
  errorPrefix
}) {
  const input = readExternalPhysicalInput(filePath, {
    repositoryRoot,
    io,
    maxBytes,
    maximumAllowedBytes,
    errorPrefix
  });

  let value;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(input.raw).trim(); }
  catch { throw inputError(`${errorPrefix}_VALUE_INVALID`); }
  if (!value || value.includes('\u0000')) throw inputError(`${errorPrefix}_VALUE_INVALID`);

  return {
    value,
    bytes: input.bytes,
    sha256: input.sha256,
    path: input.path
  };
}

export function readOperationsTextInput(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = OPERATIONS_TEXT_INPUT_MAX_BYTES
} = {}) {
  return readBoundedTextInput(filePath, {
    repositoryRoot,
    io,
    maxBytes,
    maximumAllowedBytes: OPERATIONS_TEXT_INPUT_MAX_BYTES,
    errorPrefix: 'OPERATIONS_TEXT_INPUT'
  });
}

export function readOperationsSecretInput(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = OPERATIONS_SECRET_INPUT_MAX_BYTES
} = {}) {
  return readBoundedTextInput(filePath, {
    repositoryRoot,
    io,
    maxBytes,
    maximumAllowedBytes: OPERATIONS_SECRET_INPUT_MAX_BYTES,
    errorPrefix: 'OPERATIONS_SECRET_INPUT'
  });
}
