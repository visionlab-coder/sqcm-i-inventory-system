import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

export const PHASE_PROMOTION_DOCUMENT_MAX_BYTES = 1024 * 1024;
export const PHASE_PROMOTION_GIT_TIMEOUT_MS = 10_000;
export const PHASE_PROMOTION_GIT_MAX_BUFFER = 1024 * 1024;

const ALLOWED_DOCUMENTS = new Set([
  path.join('docs', 'current-state.md'),
  path.join('docs', 'roadmap.md')
]);

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionPhasePromotionRuntimeError';
  return error;
}

function isPhysicalDirectory(stat) {
  return stat?.isDirectory?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function isPhysicalFile(stat) {
  return stat?.isFile?.() === true
    && stat?.isSymbolicLink?.() !== true
    && stat?.isReparsePoint?.() !== true;
}

function sameIdentity(left, right) {
  return left?.size === right?.size
    && left?.dev === right?.dev
    && left?.ino === right?.ino
    && left?.mtimeMs === right?.mtimeMs;
}

export function readPhasePromotionTextDocument({
  projectRoot,
  filePath,
  io = fs,
  maxBytes = PHASE_PROMOTION_DOCUMENT_MAX_BYTES
} = {}) {
  if (typeof projectRoot !== 'string' || !projectRoot || typeof filePath !== 'string' || !filePath) {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_INPUT_INVALID');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > PHASE_PROMOTION_DOCUMENT_MAX_BYTES) {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_LIMIT_INVALID');
  }
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(filePath);
  const relative = path.relative(root, candidate);
  if (!ALLOWED_DOCUMENTS.has(relative)) throw boundedError('PHASE_PROMOTION_DOCUMENT_PATH_INVALID');

  let rootBefore;
  let candidateBefore;
  let rootRealBefore;
  let candidateRealBefore;
  try {
    rootBefore = io.lstatSync(root);
    candidateBefore = io.lstatSync(candidate);
    rootRealBefore = path.resolve(io.realpathSync(root));
    candidateRealBefore = path.resolve(io.realpathSync(candidate));
  } catch {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_PATH_INVALID');
  }
  if (!isPhysicalDirectory(rootBefore) || !isPhysicalFile(candidateBefore)
    || rootRealBefore.toLowerCase() !== root.toLowerCase()
    || candidateRealBefore.toLowerCase() !== candidate.toLowerCase()) {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_PATH_INVALID');
  }
  if (candidateBefore.size < 1 || candidateBefore.size > maxBytes) {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_BYTES_INVALID');
  }

  let raw;
  try { raw = io.readFileSync(candidateRealBefore); }
  catch { throw boundedError('PHASE_PROMOTION_DOCUMENT_READ_FAILED'); }
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);

  let rootAfter;
  let candidateAfter;
  let rootRealAfter;
  let candidateRealAfter;
  try {
    rootAfter = io.lstatSync(root);
    candidateAfter = io.lstatSync(candidate);
    rootRealAfter = path.resolve(io.realpathSync(root));
    candidateRealAfter = path.resolve(io.realpathSync(candidate));
  } catch {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_UNSTABLE');
  }
  if (!sameIdentity(rootBefore, rootAfter) || !sameIdentity(candidateBefore, candidateAfter)
    || rootRealAfter.toLowerCase() !== rootRealBefore.toLowerCase()
    || candidateRealAfter.toLowerCase() !== candidateRealBefore.toLowerCase()
    || raw.length !== candidateBefore.size || raw.length < 1 || raw.length > maxBytes) {
    throw boundedError('PHASE_PROMOTION_DOCUMENT_UNSTABLE');
  }

  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw boundedError('PHASE_PROMOTION_DOCUMENT_UTF8_INVALID'); }
  return { path: candidateRealBefore, raw: Buffer.from(raw), text, bytes: raw.length };
}

export function runPhasePromotionGitStatus({
  projectRoot,
  spawnClient = spawnSync,
  timeoutMs = PHASE_PROMOTION_GIT_TIMEOUT_MS,
  maxBuffer = PHASE_PROMOTION_GIT_MAX_BUFFER
} = {}) {
  if (typeof projectRoot !== 'string' || !projectRoot || typeof spawnClient !== 'function') {
    throw boundedError('PHASE_PROMOTION_GIT_INPUT_INVALID');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PHASE_PROMOTION_GIT_TIMEOUT_MS
    || !Number.isSafeInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > PHASE_PROMOTION_GIT_MAX_BUFFER) {
    throw boundedError('PHASE_PROMOTION_GIT_LIMIT_INVALID');
  }
  const result = spawnClient('git', ['status', '--porcelain'], {
    cwd: path.resolve(projectRoot),
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('PHASE_PROMOTION_GIT_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('PHASE_PROMOTION_GIT_FAILED');
  return { clean: String(result.stdout ?? '').trim().length === 0 };
}
