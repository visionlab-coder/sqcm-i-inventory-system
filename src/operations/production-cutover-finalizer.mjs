import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import gates from './gates.js';
import { GATE_IDS } from './production-cutover-evidence.mjs';

export const ACTUAL_CUTOVER_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

function finalizerInputError(code) {
  const error = new Error(code);
  error.name = 'ProductionCutoverFinalizerInputError';
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

function isPhysicalDirectory(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function isPhysicalFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false);
}

function sameFileIdentity(before, after) {
  return before.size === after.size
    && before.dev === after.dev
    && before.ino === after.ino
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

export function readActualCutoverEvidenceFile(filePath, {
  repositoryRoot = process.cwd(),
  io = fs,
  maxBytes = ACTUAL_CUTOVER_EVIDENCE_MAX_BYTES
} = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.json'
    || typeof repositoryRoot !== 'string' || !repositoryRoot
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > ACTUAL_CUTOVER_EVIDENCE_MAX_BYTES) {
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  }
  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(filePath);
  if (pathInsideOrEqual(repository, candidate)) throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  let repositoryReal;
  let repositoryStat;
  let stat;
  try {
    repositoryStat = io.lstatSync(repository);
    if (!isPhysicalDirectory(repositoryStat)) {
      throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
    }
    repositoryReal = path.resolve(io.realpathSync(repository));
    if (!samePhysicalPath(repositoryReal, repository)) {
      throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
    }
    stat = io.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_NOT_FOUND');
    if (error?.name === 'ProductionCutoverFinalizerInputError') throw error;
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  }
  if (!isPhysicalFile(stat) || stat.size < 1 || stat.size > maxBytes) {
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  }
  let candidateReal;
  let raw;
  try {
    candidateReal = path.resolve(io.realpathSync(candidate));
    if (!samePhysicalPath(candidateReal, candidate) || pathInsideOrEqual(repositoryReal, candidateReal)) {
      throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
    }
    raw = io.readFileSync(candidateReal);
  } catch (error) {
    if (error?.name === 'ProductionCutoverFinalizerInputError') throw error;
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  }
  if (!Buffer.isBuffer(raw) || raw.length > maxBytes) {
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID');
  }
  if (raw.length !== stat.size) throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_UNSTABLE');
  try {
    const repositoryStatAfter = io.lstatSync(repository);
    const repositoryRealAfter = path.resolve(io.realpathSync(repository));
    const statAfter = io.lstatSync(candidate);
    const candidateRealAfter = path.resolve(io.realpathSync(candidate));
    if (!isPhysicalDirectory(repositoryStatAfter)
      || !isPhysicalFile(statAfter)
      || !samePhysicalPath(repositoryRealAfter, repositoryReal)
      || !samePhysicalPath(candidateRealAfter, candidateReal)
      || !samePhysicalPath(repositoryRealAfter, repository)
      || !samePhysicalPath(candidateRealAfter, candidate)
      || pathInsideOrEqual(repositoryRealAfter, candidateRealAfter)
      || !sameFileIdentity(repositoryStat, repositoryStatAfter)
      || !sameFileIdentity(stat, statAfter)) {
      throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_UNSTABLE');
    }
  } catch (error) {
    if (error?.name === 'ProductionCutoverFinalizerInputError') throw error;
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_UNSTABLE');
  }
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch {
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_UTF8_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw finalizerInputError('ACTUAL_CUTOVER_EVIDENCE_JSON_INVALID');
  }
  return {
    value,
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex')
  };
}

const EXTERNAL_GATES = new Set([
  'health_readiness',
  'core_smoke',
  'logs_5xx',
  'rollback',
  'csrf_idempotency',
  'operational_health',
  'nonfunctional',
  'uat_signoff'
]);
const FORBIDDEN = /\b(staging|template|loopback|baseline|not[_ -]?run|pending)\b/i;

function actualProductionProvenance(value) {
  return typeof value === 'string'
    && /production/i.test(value)
    && !FORBIDDEN.test(value);
}

export function validateActualCutoverProvenance(evidence) {
  const contract = gates.validateCutoverEvidence(evidence);
  const failures = [...contract.failures];

  if (evidence?.template !== false) failures.push('ACTUAL_EVIDENCE_MUST_NOT_BE_TEMPLATE');
  if (evidence?.activationState !== 'actual') failures.push('ACTIVATION_STATE_NOT_ACTUAL');
  if (evidence?.targetUrl !== 'https://inventory.safe-link.co.kr') failures.push('PRODUCTION_TARGET_URL_MISMATCH');
  if (!/^sha-[0-9a-f]{40}$/.test(evidence?.releaseTag || '')) failures.push('IMMUTABLE_RELEASE_TAG_REQUIRED');
  if (evidence?.productionGo !== true) failures.push('PRODUCTION_GO_NOT_CONFIRMED');

  const ids = (evidence?.gates || []).map((gate) => gate.id);
  if (ids.length !== GATE_IDS.length || new Set(ids).size !== GATE_IDS.length) {
    failures.push('EXACT_12_UNIQUE_GATES_REQUIRED');
  }
  for (const id of ids) {
    if (!GATE_IDS.includes(id)) failures.push(`${id}_UNEXPECTED_GATE`);
  }
  for (const gate of evidence?.gates || []) {
    if (EXTERNAL_GATES.has(gate.id) && gate.status === 'PASS' && !actualProductionProvenance(gate.evidence)) {
      failures.push(`${gate.id}_NON_PRODUCTION_EVIDENCE`);
    }
  }

  for (const result of evidence?.pilot?.roleResults || []) {
    if (result.status === 'PASS' && !actualProductionProvenance(result.evidence)) {
      failures.push(`${result.role}_NON_PRODUCTION_ROLE_EVIDENCE`);
    }
  }
  for (const role of ['business', 'security', 'operations']) {
    const approval = evidence?.approvals?.[role];
    if (approval?.status === 'APPROVED' && !actualProductionProvenance(approval.evidence)) {
      failures.push(`${role}_NON_PRODUCTION_APPROVAL_EVIDENCE`);
    }
  }

  const uniqueFailures = [...new Set(failures)];
  return {
    status: uniqueFailures.length ? 'FAIL_ACTUAL_CUTOVER_EVIDENCE' : 'PASS_ACTUAL_CUTOVER_EVIDENCE',
    failures: uniqueFailures,
    requiredGateCount: GATE_IDS.length,
    productionGo: uniqueFailures.length === 0
  };
}
