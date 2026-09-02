import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { CUTOVER_GATE_ADAPTER_PLAN } from './production-cutover-gate-adapters.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import { validateActualCutoverProvenance } from './production-cutover-finalizer.mjs';
import { productionRoleResultSetPublicationId } from './production-role-result-evidence.mjs';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const ACTUAL_CUTOVER_ASSEMBLY_CONFIRMATION = 'ACK-P6-ASSEMBLE-ACTUAL-CUTOVER-EVIDENCE';
export const ACTUAL_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const ACTUAL_EVIDENCE_INPUT_MAX_BYTES = 1024 * 1024;
export const CUTOVER_RECEIPT_MAX_DOCUMENTS = 64;
export const CUTOVER_RECEIPT_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const ROLE_MAP = Object.freeze({ ADMIN: 'admin', MANAGER: 'manager', USER: 'employee' });

function inputError(code) {
  const error = new Error(code);
  error.name = 'ActualCutoverEvidenceInputError';
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

const inWindow = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    && time >= Date.parse(PRODUCTION_CHANGE_WINDOW.start)
    && time <= Date.parse(PRODUCTION_CHANGE_WINDOW.end);
};

function receiptMap(documents, kind) {
  return new Map(documents.filter((document) => document.value?.kind === kind).map((document) => [
    kind === 'gate' ? document.value.gate : `${document.value.gate}:${document.value.step}`,
    document
  ]));
}

function validReceiptDocument(document, runId) {
  const value = document?.value;
  return typeof document?.fileName === 'string' && SHA256.test(document?.sha256 || '')
    && value?.schemaVersion === 1 && value?.runId === runId && inWindow(value?.checkedAt)
    && value?.productionGo === false && ['step', 'gate'].includes(value?.kind);
}

function validateRoleResult(document, {
  role, runId, releaseTag, coreGateSha, roleStepSha, resultSetPublicationId
}) {
  const value = document?.value;
  return SHA256.test(document?.sha256 || '') && value?.schemaVersion === 1
    && value?.template === false && value?.evidenceType === 'P6_ROLE_UAT_RESULT_ACTUAL'
    && value?.environment === 'production' && value?.activationState === 'actual'
    && value?.targetUrl === ACTUAL_TARGET_URL && value?.releaseTag === releaseTag
    && value?.runId === runId && value?.role === role && value?.status === 'PASS'
    && value?.actualProduction === true && value?.coreSmokeGateReceiptSha256 === coreGateSha
    && value?.roleSmokeStepReceiptSha256 === roleStepSha
    && value?.resultSetPublicationId === resultSetPublicationId
    && inWindow(value?.checkedAt);
}

function validateSignoff(document, { area, runId, releaseTag, coreGateSha }) {
  const value = document?.value;
  return SHA256.test(document?.sha256 || '') && value?.schemaVersion === 1
    && value?.template === false && value?.evidenceType === 'P6_CUTOVER_SIGNOFF_ACTUAL'
    && value?.environment === 'production' && value?.activationState === 'actual'
    && value?.targetUrl === ACTUAL_TARGET_URL && value?.releaseTag === releaseTag
    && value?.runId === runId && value?.area === area && value?.decision === 'APPROVED'
    && IDENTITY.test(value?.signedByRef || '') && inWindow(value?.signedAt)
    && value?.coreSmokeGateReceiptSha256 === coreGateSha;
}

export function assembleActualCutoverEvidence({ receiptDocuments = [], roleResultDocuments = {}, signoffDocuments = {}, runId, releaseSha } = {}) {
  const failures = [];
  if (!RUN_ID.test(runId || '')) failures.push('CUTOVER_RUN_ID_INVALID');
  if (!/^[a-f0-9]{40}$/.test(releaseSha || '')) failures.push('CUTOVER_RELEASE_SHA_INVALID');
  const releaseTag = `sha-${releaseSha}`;
  if (!receiptDocuments.every((document) => validReceiptDocument(document, runId))) failures.push('CUTOVER_RECEIPT_DOCUMENT_INVALID');
  const stepDocuments = receiptMap(receiptDocuments, 'step');
  const gateDocuments = receiptMap(receiptDocuments, 'gate');
  const expectedSteps = Object.values(CUTOVER_GATE_ADAPTER_PLAN).flat().length;
  if (stepDocuments.size !== expectedSteps) failures.push('EXACT_CUTOVER_STEP_RECEIPTS_REQUIRED');
  if (gateDocuments.size !== Object.keys(CUTOVER_GATE_ADAPTER_PLAN).length) failures.push('EXACT_CUTOVER_GATE_RECEIPTS_REQUIRED');

  for (const [gate, steps] of Object.entries(CUTOVER_GATE_ADAPTER_PLAN)) {
    const gateDocument = gateDocuments.get(gate);
    if (gateDocument?.value?.status !== 'PASS' || gateDocument?.value?.step !== 'summary') failures.push(`${gate}_GATE_RECEIPT_INVALID`);
    const expectedRefs = [];
    for (const step of steps) {
      const document = stepDocuments.get(`${gate}:${step.id}`);
      if (!document || document.value?.exitCode !== 0 || !step.acceptedStatuses.includes(document.value?.status)) failures.push(`${gate}_${step.id}_STEP_RECEIPT_INVALID`);
      else expectedRefs.push(document.fileName);
    }
    if (gateDocument && JSON.stringify(gateDocument.value?.evidenceRefs || []) !== JSON.stringify(expectedRefs)) failures.push(`${gate}_GATE_STEP_REFERENCES_INVALID`);
  }

  const coreGateSha = gateDocuments.get('core_smoke')?.sha256 || '';
  const roleStepSha = stepDocuments.get('core_smoke:role-core-smoke')?.sha256 || '';
  const roleCheckedAt = roleResultDocuments.ADMIN?.value?.checkedAt;
  const resultSetPublicationId = productionRoleResultSetPublicationId({
    runId, releaseSha, coreGateSha, roleStepSha, checkedAt: roleCheckedAt
  });
  if (!SHA256.test(resultSetPublicationId)
    || !Object.keys(ROLE_MAP).every((role) => roleResultDocuments[role]?.value?.resultSetPublicationId === resultSetPublicationId
      && roleResultDocuments[role]?.value?.checkedAt === roleCheckedAt)) {
    failures.push('ROLE_RESULT_SET_PROVENANCE_INVALID');
  }
  for (const role of Object.keys(ROLE_MAP)) {
    if (!validateRoleResult(roleResultDocuments[role], {
      role, runId, releaseTag, coreGateSha, roleStepSha, resultSetPublicationId
    })) failures.push(`${role}_ACTUAL_ROLE_RESULT_INVALID`);
  }
  for (const area of ['BUSINESS', 'SECURITY', 'OPERATIONS']) {
    if (!validateSignoff(signoffDocuments[area], { area, runId, releaseTag, coreGateSha })) failures.push(`${area}_ACTUAL_SIGNOFF_INVALID`);
  }
  if (failures.length) return { status: 'FAIL_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY', failures: [...new Set(failures)], productionGo: false };

  const gates = Object.keys(CUTOVER_GATE_ADAPTER_PLAN).map((id) => ({
    id, status: 'PASS', evidence: `production cutover run ${runId} ${id} receipt sha256:${gateDocuments.get(id).sha256}`
  }));
  const roleResults = Object.entries(ROLE_MAP).map(([sourceRole, role]) => ({
    role, status: 'PASS', evidence: `production ${sourceRole.toLowerCase()} UAT result sha256:${roleResultDocuments[sourceRole].sha256}`
  }));
  const approvals = Object.fromEntries(['BUSINESS', 'SECURITY', 'OPERATIONS'].map((area) => {
    const document = signoffDocuments[area];
    return [area.toLowerCase(), {
      status: 'APPROVED', signedBy: document.value.signedByRef, signedAt: document.value.signedAt,
      evidence: `production ${area.toLowerCase()} approval sha256:${document.sha256}`
    }];
  }));
  const checkedAt = receiptDocuments.map((document) => document.value.checkedAt).sort().at(-1);
  const evidence = {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', checkedAt,
    runId, releaseSha, releaseTag, targetUrl: ACTUAL_TARGET_URL, gates,
    pilot: { openCriticalDefects: 0, openHighDefects: 0, roleResults }, approvals, productionGo: true
  };
  const validation = validateActualCutoverProvenance(evidence);
  return validation.productionGo
    ? { status: 'PASS_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY', failures: [], evidence, productionGo: true }
    : { status: 'FAIL_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY', failures: validation.failures, productionGo: false };
}

export function loadJsonDocument(filePath, {
  io = fs,
  repositoryRoot = process.cwd(),
  allowedBase = null,
  maxBytes = ACTUAL_EVIDENCE_INPUT_MAX_BYTES
} = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.json'
    || typeof repositoryRoot !== 'string' || !repositoryRoot
    || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > ACTUAL_EVIDENCE_INPUT_MAX_BYTES) {
    throw inputError('ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID');
  }
  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(filePath);
  const base = allowedBase === null ? null : path.resolve(allowedBase);
  if (pathInsideOrEqual(repository, candidate)
    || (base && (!pathInsideOrEqual(base, candidate) || samePhysicalPath(base, candidate)))) {
    throw inputError('ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID');
  }

  let repositoryBefore;
  let repositoryRealBefore;
  let baseBefore;
  let baseRealBefore;
  let before;
  let candidateRealBefore;
  try {
    repositoryBefore = io.lstatSync(repository);
    repositoryRealBefore = path.resolve(io.realpathSync(repository));
    if (base) {
      baseBefore = io.lstatSync(base);
      baseRealBefore = path.resolve(io.realpathSync(base));
    }
    before = io.lstatSync(candidate);
    candidateRealBefore = path.resolve(io.realpathSync(candidate));
  } catch {
    throw inputError('ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID');
  }
  if (!physicalDirectory(repositoryBefore) || !samePhysicalPath(repositoryRealBefore, repository)
    || (base && (!physicalDirectory(baseBefore) || !samePhysicalPath(baseRealBefore, base)))
    || !physicalFile(before) || !samePhysicalPath(candidateRealBefore, candidate)
    || pathInsideOrEqual(repositoryRealBefore, candidateRealBefore)
    || (base && !pathInsideOrEqual(baseRealBefore, candidateRealBefore))
    || before.size < 1 || before.size > maxBytes) {
    throw inputError('ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID');
  }

  let raw;
  try { raw = io.readFileSync(candidateRealBefore); } catch {
    throw inputError('ACTUAL_EVIDENCE_INPUT_READ_FAILED');
  }
  if (!Buffer.isBuffer(raw) || raw.length > maxBytes) throw inputError('ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID');
  if (raw.length !== before.size) throw inputError('ACTUAL_EVIDENCE_INPUT_UNSTABLE');

  try {
    const repositoryAfter = io.lstatSync(repository);
    const repositoryRealAfter = path.resolve(io.realpathSync(repository));
    const baseAfter = base ? io.lstatSync(base) : null;
    const baseRealAfter = base ? path.resolve(io.realpathSync(base)) : null;
    const after = io.lstatSync(candidate);
    const candidateRealAfter = path.resolve(io.realpathSync(candidate));
    if (!physicalDirectory(repositoryAfter) || !sameIdentity(repositoryBefore, repositoryAfter)
      || !samePhysicalPath(repositoryRealBefore, repositoryRealAfter)
      || !samePhysicalPath(repositoryRealAfter, repository)
      || (base && (!physicalDirectory(baseAfter) || !sameIdentity(baseBefore, baseAfter)
        || !samePhysicalPath(baseRealBefore, baseRealAfter) || !samePhysicalPath(baseRealAfter, base)))
      || !physicalFile(after) || !sameIdentity(before, after)
      || !samePhysicalPath(candidateRealBefore, candidateRealAfter)
      || !samePhysicalPath(candidateRealAfter, candidate)
      || pathInsideOrEqual(repositoryRealAfter, candidateRealAfter)
      || (base && !pathInsideOrEqual(baseRealAfter, candidateRealAfter))) {
      throw inputError('ACTUAL_EVIDENCE_INPUT_UNSTABLE');
    }
  } catch (error) {
    if (error?.name === 'ActualCutoverEvidenceInputError') throw error;
    throw inputError('ACTUAL_EVIDENCE_INPUT_UNSTABLE');
  }

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch {
    throw inputError('ACTUAL_EVIDENCE_INPUT_UTF8_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch { throw inputError('ACTUAL_EVIDENCE_INPUT_JSON_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inputError('ACTUAL_EVIDENCE_INPUT_JSON_INVALID');
  return {
    fileName: path.basename(candidate),
    bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    value
  };
}

export function loadRunReceiptDocuments(root, runId, { io = fs, repositoryRoot = process.cwd() } = {}) {
  const resolved = path.resolve(root);
  const repository = path.resolve(repositoryRoot);
  if (!path.isAbsolute(root) || pathInsideOrEqual(repository, resolved)) throw inputError('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL');
  let before;
  let realBefore;
  let names;
  try {
    before = io.lstatSync(resolved);
    realBefore = path.resolve(io.realpathSync(resolved));
    names = io.readdirSync(resolved).filter((name) => path.extname(name).toLowerCase() === '.json');
  } catch { throw inputError('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL'); }
  if (!physicalDirectory(before) || !samePhysicalPath(realBefore, resolved)
    || names.length > CUTOVER_RECEIPT_MAX_DOCUMENTS
    || names.some((name) => path.basename(name) !== name)) {
    throw inputError('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL');
  }
  let documents;
  try {
    documents = names.map((name) => loadJsonDocument(path.join(resolved, name), {
      io,
      repositoryRoot: repository,
      allowedBase: resolved
    }));
  } catch (error) {
    try {
      const rootAfterFailure = io.lstatSync(resolved);
      const rootRealAfterFailure = path.resolve(io.realpathSync(resolved));
      if (!physicalDirectory(rootAfterFailure) || !sameIdentity(before, rootAfterFailure)
        || !samePhysicalPath(realBefore, rootRealAfterFailure) || !samePhysicalPath(rootRealAfterFailure, resolved)) {
        throw inputError('CUTOVER_RECEIPT_ROOT_UNSTABLE');
      }
    } catch (rootError) {
      if (rootError?.name === 'ActualCutoverEvidenceInputError') throw rootError;
      throw inputError('CUTOVER_RECEIPT_ROOT_UNSTABLE');
    }
    if (error?.message === 'ACTUAL_EVIDENCE_INPUT_UNSTABLE') throw inputError('CUTOVER_RECEIPT_ROOT_UNSTABLE');
    throw error;
  }
  if (documents.reduce((total, document) => total + document.bytes, 0) > CUTOVER_RECEIPT_MAX_TOTAL_BYTES) {
    throw inputError('CUTOVER_RECEIPT_TOTAL_BYTES_EXCEEDED');
  }
  try {
    const after = io.lstatSync(resolved);
    const realAfter = path.resolve(io.realpathSync(resolved));
    if (!physicalDirectory(after) || !sameIdentity(before, after)
      || !samePhysicalPath(realBefore, realAfter) || !samePhysicalPath(realAfter, resolved)) {
      throw inputError('CUTOVER_RECEIPT_ROOT_UNSTABLE');
    }
  } catch (error) {
    if (error?.name === 'ActualCutoverEvidenceInputError') throw error;
    throw inputError('CUTOVER_RECEIPT_ROOT_UNSTABLE');
  }
  return documents.filter((document) => document.value?.runId === runId);
}

export function writeActualCutoverEvidence(outputPath, evidence, {
  io = fs, repositoryRoot = process.cwd(), processId = process.pid
} = {}) {
  const resolved = path.resolve(outputPath);
  const repo = path.resolve(repositoryRoot);
  if (resolved.toLowerCase() === repo.toLowerCase() || resolved.toLowerCase().startsWith(`${repo.toLowerCase()}${path.sep}`)) throw new Error('ACTUAL_CUTOVER_EVIDENCE_OUTPUT_MUST_BE_EXTERNAL');
  const parent = path.dirname(resolved);
  const stat = io.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(io.realpathSync(parent)).toLowerCase() !== parent.toLowerCase()) throw new Error('ACTUAL_CUTOVER_EVIDENCE_PARENT_NOT_PHYSICAL');
  return writeCreateOnlyJsonOutput(resolved, evidence, {
    io,
    processId,
    alreadyExistsCode: 'ACTUAL_CUTOVER_EVIDENCE_ALREADY_EXISTS'
  });
}
