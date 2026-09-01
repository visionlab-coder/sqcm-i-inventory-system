import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CUTOVER_GATE_ADAPTER_PLAN } from './production-cutover-gate-adapters.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import { CUTOVER_GATE_SEQUENCE } from './production-cutover-orchestrator.mjs';

export const SIGNOFF_RESUME_CONFIRMATION = 'ACK-P6-RESUME-SAME-CUTOVER-RUN-SIGNOFF';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RECEIPT_FILE = /^[^\\/]+\.json$/;
const PRE_SIGNOFF_GATES = Object.freeze(CUTOVER_GATE_SEQUENCE.slice(0, -1));

const inApprovedWindow = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    && time >= Date.parse(PRODUCTION_CHANGE_WINDOW.start)
    && time <= Date.parse(PRODUCTION_CHANGE_WINDOW.end);
};

export function createSignoffPauseCheckpoint({ runId, releaseSha, gateResults = [], checkedAt } = {}) {
  const failures = [];
  if (!RUN_ID.test(runId || '')) failures.push('CUTOVER_RUN_ID_INVALID');
  if (!RELEASE_SHA.test(releaseSha || '')) failures.push('CUTOVER_RELEASE_SHA_INVALID');
  if (!inApprovedWindow(checkedAt)) failures.push('CHECKPOINT_OUTSIDE_APPROVED_CHANGE_WINDOW');
  if (gateResults.length !== PRE_SIGNOFF_GATES.length) failures.push('PRE_SIGNOFF_GATE_COUNT_INVALID');
  gateResults.forEach((result, index) => {
    if (result?.gate !== PRE_SIGNOFF_GATES[index] || result?.result !== 'PASS'
      || !RECEIPT_FILE.test(result?.evidenceRef || '') || !SHA256.test(result?.evidenceSha256 || '')) failures.push(`PRE_SIGNOFF_GATE_INVALID:${PRE_SIGNOFF_GATES[index]}`);
  });
  if (failures.length) return { status: 'FAIL_SIGNOFF_PAUSE_CHECKPOINT', failures: [...new Set(failures)], productionGo: false };
  return {
    status: 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF',
    failures: [],
    checkpoint: {
      schemaVersion: 1,
      evidenceType: 'P6_CUTOVER_SIGNOFF_PAUSE_CHECKPOINT',
      runId,
      releaseSha,
      checkedAt,
      pausedBeforeGate: 'uat_signoff',
      completedGates: gateResults.map(({ gate, evidenceRef, evidenceSha256 }) => ({ gate, evidenceRef, evidenceSha256 })),
      productionGo: false
    },
    productionGo: false
  };
}

export function evaluateSignoffResume({
  checkpoint,
  runId,
  releaseSha,
  checkedAt,
  confirmation,
  roleResultReferences = {},
  signoffReferences = {}
} = {}) {
  const failures = [];
  if (checkpoint?.schemaVersion !== 1 || checkpoint?.evidenceType !== 'P6_CUTOVER_SIGNOFF_PAUSE_CHECKPOINT') failures.push('CHECKPOINT_TYPE_INVALID');
  if (!RUN_ID.test(runId || '') || checkpoint?.runId !== runId) failures.push('CHECKPOINT_RUN_ID_MISMATCH');
  if (!RELEASE_SHA.test(releaseSha || '') || checkpoint?.releaseSha !== releaseSha) failures.push('CHECKPOINT_RELEASE_SHA_MISMATCH');
  if (!inApprovedWindow(checkpoint?.checkedAt)) failures.push('CHECKPOINT_TIME_INVALID');
  const now = Date.parse(checkedAt);
  if (!inApprovedWindow(checkedAt) || now > Date.parse(PRODUCTION_CHANGE_WINDOW.rollbackCutoff)) failures.push('SIGNOFF_RESUME_OUTSIDE_ROLLBACK_CUTOFF');
  if (checkpoint?.pausedBeforeGate !== 'uat_signoff' || checkpoint?.productionGo !== false) failures.push('CHECKPOINT_STATE_INVALID');
  const completed = checkpoint?.completedGates || [];
  if (completed.length !== PRE_SIGNOFF_GATES.length
    || completed.some((item, index) => item?.gate !== PRE_SIGNOFF_GATES[index]
      || !RECEIPT_FILE.test(item?.evidenceRef || '') || !SHA256.test(item?.evidenceSha256 || ''))) failures.push('CHECKPOINT_GATE_PROVENANCE_INVALID');
  if (failures.length) return { status: 'FAIL_SIGNOFF_RESUME_CONTRACT', failures: [...new Set(failures)], routeDisableRequired: true, productionGo: false };

  const missing = [
    ...['ADMIN', 'MANAGER', 'USER'].filter((role) => roleResultReferences[role] !== true).map((role) => `${role}_ACTUAL_ROLE_RESULT_MISSING`),
    ...['BUSINESS', 'SECURITY', 'OPERATIONS'].filter((area) => signoffReferences[area] !== true).map((area) => `${area}_ACTUAL_SIGNOFF_MISSING`)
  ];
  if (missing.length) return { status: 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF', failures: [], missing, routeDisableRequired: false, productionGo: false };
  if (confirmation !== SIGNOFF_RESUME_CONFIRMATION) return { status: 'READY_WAIT_SIGNOFF_RESUME_CONFIRMATION', failures: [], missing: [], routeDisableRequired: false, productionGo: false };
  return { status: 'READY_FOR_SAME_RUN_UAT_SIGNOFF_RESUME', failures: [], missing: [], resumeGate: 'uat_signoff', routeDisableRequired: false, productionGo: false };
}

function physicalDirectory(directory, io = fs) {
  const resolved = path.resolve(directory);
  const stat = io.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)
    || path.resolve(io.realpathSync(resolved)).toLowerCase() !== resolved.toLowerCase()) throw new Error('SIGNOFF_RESUME_DIRECTORY_NOT_PHYSICAL');
  return resolved;
}

export function sha256PhysicalFile(filePath, { io = fs } = {}) {
  const resolved = path.resolve(filePath);
  const stat = io.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('SIGNOFF_RESUME_RECEIPT_NOT_PHYSICAL');
  return createHash('sha256').update(io.readFileSync(resolved)).digest('hex');
}

function outsideRepository(resolved, repositoryRoot) {
  const repo = path.resolve(repositoryRoot).toLowerCase();
  const target = path.resolve(resolved).toLowerCase();
  return target !== repo && !target.startsWith(`${repo}${path.sep}`);
}

export function writeSignoffPauseCheckpoint(outputPath, checkpoint, { io = fs, repositoryRoot = process.cwd() } = {}) {
  const resolved = path.resolve(outputPath);
  if (!outsideRepository(resolved, repositoryRoot)) throw new Error('SIGNOFF_CHECKPOINT_MUST_BE_EXTERNAL');
  const parent = physicalDirectory(path.dirname(resolved), io);
  if (path.dirname(resolved).toLowerCase() !== parent.toLowerCase() || path.extname(resolved) !== '.checkpoint') throw new Error('SIGNOFF_CHECKPOINT_PATH_INVALID');
  io.writeFileSync(resolved, `${JSON.stringify(checkpoint, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return resolved;
}

export function loadSignoffPauseCheckpoint(filePath, { io = fs, repositoryRoot = process.cwd() } = {}) {
  const resolved = path.resolve(filePath);
  if (!outsideRepository(resolved, repositoryRoot)) throw new Error('SIGNOFF_CHECKPOINT_MUST_BE_EXTERNAL');
  const stat = io.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false) || path.extname(resolved) !== '.checkpoint') throw new Error('SIGNOFF_CHECKPOINT_NOT_PHYSICAL');
  return JSON.parse(io.readFileSync(resolved, 'utf8'));
}

export function validateSignoffResumeReceipts({ root, checkpoint, io = fs } = {}) {
  const failures = [];
  let resolvedRoot;
  try { resolvedRoot = physicalDirectory(root, io); } catch { return { status: 'FAIL_SIGNOFF_RESUME_RECEIPTS', failures: ['RECEIPT_ROOT_NOT_PHYSICAL'], receiptCount: 0 }; }
  const names = io.readdirSync(resolvedRoot).filter((name) => name.endsWith('.json'));
  const documents = [];
  for (const name of names) {
    const filePath = path.join(resolvedRoot, name);
    let value;
    try { value = JSON.parse(io.readFileSync(filePath, 'utf8')); } catch { failures.push(`RECEIPT_JSON_INVALID:${name}`); continue; }
    if (value?.runId !== checkpoint?.runId) continue;
    documents.push({ name, value, sha256: sha256PhysicalFile(filePath, { io }) });
  }
  if (documents.some((item) => item.value?.schemaVersion !== 1 || !inApprovedWindow(item.value?.checkedAt)
    || item.value?.productionGo !== false || !['step', 'gate'].includes(item.value?.kind))) failures.push('RECEIPT_COMMON_PROVENANCE_INVALID');
  const gates = new Map(documents.filter((item) => item.value?.kind === 'gate').map((item) => [item.value.gate, item]));
  const steps = new Map(documents.filter((item) => item.value?.kind === 'step').map((item) => [`${item.value.gate}:${item.value.step}`, item]));
  const expectedStepCount = PRE_SIGNOFF_GATES.reduce((sum, gate) => sum + CUTOVER_GATE_ADAPTER_PLAN[gate].length, 0);
  if (documents.length !== PRE_SIGNOFF_GATES.length + expectedStepCount) failures.push('EXACT_PRE_SIGNOFF_RECEIPT_COUNT_REQUIRED');
  if (gates.size !== PRE_SIGNOFF_GATES.length) failures.push('EXACT_PRE_SIGNOFF_GATE_RECEIPTS_REQUIRED');
  if (steps.size !== expectedStepCount) failures.push('EXACT_PRE_SIGNOFF_STEP_RECEIPTS_REQUIRED');
  for (const checkpointGate of checkpoint?.completedGates || []) {
    const gate = gates.get(checkpointGate.gate);
    if (!gate || gate.name !== checkpointGate.evidenceRef || gate.sha256 !== checkpointGate.evidenceSha256
      || gate.value?.status !== 'PASS' || gate.value?.step !== 'summary') failures.push(`${checkpointGate.gate}_CHECKPOINT_RECEIPT_MISMATCH`);
    const expectedRefs = [];
    for (const step of CUTOVER_GATE_ADAPTER_PLAN[checkpointGate.gate] || []) {
      const receipt = steps.get(`${checkpointGate.gate}:${step.id}`);
      if (!receipt || receipt.value?.exitCode !== 0 || !step.acceptedStatuses.includes(receipt.value?.status)) failures.push(`${checkpointGate.gate}_${step.id}_STEP_RECEIPT_INVALID`);
      else expectedRefs.push(receipt.name);
    }
    if (gate && JSON.stringify(gate.value?.evidenceRefs || []) !== JSON.stringify(expectedRefs)) failures.push(`${checkpointGate.gate}_STEP_REFERENCES_INVALID`);
  }
  return { status: failures.length ? 'FAIL_SIGNOFF_RESUME_RECEIPTS' : 'PASS_SIGNOFF_RESUME_RECEIPTS', failures: [...new Set(failures)], receiptCount: documents.length };
}

export function runSignoffPauseResumeRehearsal() {
  const runId = '11111111-1111-4111-8111-111111111111';
  const releaseSha = 'a'.repeat(40);
  const checkedAt = '2026-09-11T12:00:00.000Z';
  const gateResults = PRE_SIGNOFF_GATES.map((gate, index) => ({ gate, result: 'PASS', evidenceRef: `${String(index + 1).padStart(4, '0')}-${gate}.json`, evidenceSha256: String(index + 1).padStart(64, '0') }));
  const pause = createSignoffPauseCheckpoint({ runId, releaseSha, gateResults, checkedAt });
  const waiting = evaluateSignoffResume({ checkpoint: pause.checkpoint, runId, releaseSha, checkedAt, roleResultReferences: {}, signoffReferences: {} });
  const ready = evaluateSignoffResume({
    checkpoint: pause.checkpoint, runId, releaseSha, checkedAt, confirmation: SIGNOFF_RESUME_CONFIRMATION,
    roleResultReferences: { ADMIN: true, MANAGER: true, USER: true },
    signoffReferences: { BUSINESS: true, SECURITY: true, OPERATIONS: true }
  });
  const crossRun = evaluateSignoffResume({ checkpoint: pause.checkpoint, runId: '22222222-2222-4222-8222-222222222222', releaseSha, checkedAt });
  const afterCutoff = evaluateSignoffResume({ checkpoint: pause.checkpoint, runId, releaseSha, checkedAt: '2026-09-11T13:01:00.000Z' });
  const pass = pause.status === 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF'
    && waiting.status === 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF'
    && ready.status === 'READY_FOR_SAME_RUN_UAT_SIGNOFF_RESUME'
    && crossRun.status === 'FAIL_SIGNOFF_RESUME_CONTRACT' && crossRun.routeDisableRequired === true
    && afterCutoff.status === 'FAIL_SIGNOFF_RESUME_CONTRACT' && afterCutoff.routeDisableRequired === true;
  return {
    status: pass ? 'PASS_SIGNOFF_PAUSE_RESUME_CONTRACT_REHEARSAL' : 'FAIL_SIGNOFF_PAUSE_RESUME_CONTRACT_REHEARSAL',
    preSignoffGateCount: PRE_SIGNOFF_GATES.length,
    waitingStatus: waiting.status,
    resumeStatus: ready.status,
    crossRunBlocked: crossRun.status === 'FAIL_SIGNOFF_RESUME_CONTRACT',
    afterCutoffRouteDisableRequired: afterCutoff.routeDisableRequired === true,
    externalMutationPerformed: false,
    productionGo: false
  };
}
