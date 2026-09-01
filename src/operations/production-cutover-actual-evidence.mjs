import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CUTOVER_GATE_ADAPTER_PLAN } from './production-cutover-gate-adapters.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import { validateActualCutoverProvenance } from './production-cutover-finalizer.mjs';

export const ACTUAL_CUTOVER_ASSEMBLY_CONFIRMATION = 'ACK-P6-ASSEMBLE-ACTUAL-CUTOVER-EVIDENCE';
export const ACTUAL_TARGET_URL = 'https://inventory.safe-link.co.kr';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const ROLE_MAP = Object.freeze({ ADMIN: 'admin', MANAGER: 'manager', USER: 'employee' });

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

function validateRoleResult(document, { role, runId, releaseTag, coreGateSha }) {
  const value = document?.value;
  return SHA256.test(document?.sha256 || '') && value?.schemaVersion === 1
    && value?.template === false && value?.evidenceType === 'P6_ROLE_UAT_RESULT_ACTUAL'
    && value?.environment === 'production' && value?.activationState === 'actual'
    && value?.targetUrl === ACTUAL_TARGET_URL && value?.releaseTag === releaseTag
    && value?.runId === runId && value?.role === role && value?.status === 'PASS'
    && value?.actualProduction === true && value?.coreSmokeGateReceiptSha256 === coreGateSha
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
  for (const role of Object.keys(ROLE_MAP)) {
    if (!validateRoleResult(roleResultDocuments[role], { role, runId, releaseTag, coreGateSha })) failures.push(`${role}_ACTUAL_ROLE_RESULT_INVALID`);
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

export function loadJsonDocument(filePath, { io = fs } = {}) {
  const resolved = path.resolve(filePath);
  const stat = io.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('ACTUAL_EVIDENCE_INPUT_NOT_PHYSICAL_FILE');
  const raw = io.readFileSync(resolved);
  return { fileName: path.basename(resolved), sha256: createHash('sha256').update(raw).digest('hex'), value: JSON.parse(raw.toString('utf8')) };
}

export function loadRunReceiptDocuments(root, runId, { io = fs } = {}) {
  const resolved = path.resolve(root);
  const stat = io.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(io.realpathSync(resolved)).toLowerCase() !== resolved.toLowerCase()) throw new Error('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL');
  return io.readdirSync(resolved).filter((name) => name.endsWith('.json')).map((name) => loadJsonDocument(path.join(resolved, name), { io }))
    .filter((document) => document.value?.runId === runId);
}

export function writeActualCutoverEvidence(outputPath, evidence, { io = fs, repositoryRoot = process.cwd() } = {}) {
  const resolved = path.resolve(outputPath);
  const repo = path.resolve(repositoryRoot);
  if (resolved.toLowerCase() === repo.toLowerCase() || resolved.toLowerCase().startsWith(`${repo.toLowerCase()}${path.sep}`)) throw new Error('ACTUAL_CUTOVER_EVIDENCE_OUTPUT_MUST_BE_EXTERNAL');
  const parent = path.dirname(resolved);
  const stat = io.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(io.realpathSync(parent)).toLowerCase() !== parent.toLowerCase()) throw new Error('ACTUAL_CUTOVER_EVIDENCE_PARENT_NOT_PHYSICAL');
  io.writeFileSync(resolved, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return resolved;
}
