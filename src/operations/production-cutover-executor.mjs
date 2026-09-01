import fs from 'node:fs';
import path from 'node:path';
import { CUTOVER_GATE_ADAPTER_PLAN, createCutoverGateHandlers, createCutoverRouteDisableHandler } from './production-cutover-gate-adapters.mjs';
import { executeCutoverGateSequence } from './production-cutover-orchestrator.mjs';
import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import {
  PRODUCTION_CUTOVER_RECEIPT_ROOT,
  createGateEvidenceRecorder,
  createProcessStepRunner,
  createRuntimeReceiptWriter
} from './production-cutover-process-runner.mjs';
import {
  SIGNOFF_RESUME_CONFIRMATION,
  createSignoffPauseCheckpoint,
  evaluateSignoffResume,
  loadSignoffPauseCheckpoint,
  sha256PhysicalFile,
  validateSignoffResumeReceipts,
  writeSignoffPauseCheckpoint
} from './production-cutover-signoff-resume.mjs';

export const PRODUCTION_CUTOVER_CONFIRMATION = 'ACK-2026-09-11-P6-G4';

function waitingResult(status, now, failures = []) {
  return {
    checkedAt: new Date(now).toISOString(), status, failures, gateResults: [],
    executedGates: [], skippedGates: Object.keys(CUTOVER_GATE_ADAPTER_PLAN),
    externalMutationPerformed: false, actualCutoverExecuted: false, productionGo: false
  };
}

export function ensureCutoverReceiptRoot({ root = PRODUCTION_CUTOVER_RECEIPT_ROOT, io = fs } = {}) {
  const resolved = path.resolve(root);
  const parent = path.dirname(resolved);
  const parentStat = io.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (parentStat.isReparsePoint?.() ?? false)) throw new Error('CUTOVER_RECEIPT_PARENT_NOT_PHYSICAL');
  if (path.resolve(io.realpathSync(parent)).toLowerCase() !== parent.toLowerCase()) throw new Error('CUTOVER_RECEIPT_PARENT_PATH_MISMATCH');
  if (!io.existsSync(resolved)) io.mkdirSync(resolved, { recursive: false, mode: 0o700 });
  const stat = io.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) throw new Error('CUTOVER_RECEIPT_ROOT_NOT_PHYSICAL');
  if (path.resolve(io.realpathSync(resolved)).toLowerCase() !== resolved.toLowerCase()) throw new Error('CUTOVER_RECEIPT_ROOT_PATH_MISMATCH');
  return resolved;
}

export async function executeProductionCutover({
  execute = false,
  externalActionConfirmed = false,
  now = () => Date.now(),
  receiptRoot = PRODUCTION_CUTOVER_RECEIPT_ROOT,
  ensureReceiptRoot = ensureCutoverReceiptRoot,
  createWriter = createRuntimeReceiptWriter,
  createRunner = createProcessStepRunner,
  pauseBeforeSignoff = false,
  releaseSha = null,
  createCheckpoint = createSignoffPauseCheckpoint,
  persistCheckpoint = writeSignoffPauseCheckpoint,
  hashReceipt = sha256PhysicalFile
} = {}) {
  const startedAt = Number(now());
  const windowStart = new Date(PRODUCTION_CHANGE_WINDOW.start).getTime();
  const rollbackCutoff = new Date(PRODUCTION_CHANGE_WINDOW.rollbackCutoff).getTime();
  const windowEnd = new Date(PRODUCTION_CHANGE_WINDOW.end).getTime();
  if (!execute) return waitingResult('PASS_CUTOVER_EXECUTION_ENTRYPOINT_DRY_RUN', startedAt);
  if (!Number.isFinite(startedAt) || startedAt < windowStart || startedAt > windowEnd) {
    return waitingResult('FAIL_OUTSIDE_APPROVED_CHANGE_WINDOW', startedAt, ['OUTSIDE_APPROVED_CHANGE_WINDOW']);
  }
  if (!externalActionConfirmed) return waitingResult('READY_WAIT_EXTERNAL_CUTOVER_ACTION_CONFIRMATION', startedAt);
  if (pauseBeforeSignoff && !/^[a-f0-9]{40}$/.test(releaseSha || '')) {
    return waitingResult('FAIL_CUTOVER_RELEASE_SHA_INVALID', startedAt, ['CUTOVER_RELEASE_SHA_INVALID']);
  }

  let root;
  try { root = ensureReceiptRoot({ root: receiptRoot }); }
  catch { return waitingResult('FAIL_CUTOVER_RECEIPT_ROOT_PREPARATION', startedAt, ['CUTOVER_RECEIPT_ROOT_NOT_READY']); }
  const writeReceipt = createWriter({ root });
  const runStep = createRunner({ writeReceipt });
  const recordGateEvidence = createGateEvidenceRecorder({ writeReceipt });
  const routeDisableHandler = createCutoverRouteDisableHandler({ runStep, recordGateEvidence });
  const result = await executeCutoverGateSequence({
    gateHandlers: createCutoverGateHandlers({ runStep, recordGateEvidence }),
    routeDisableHandler,
    windowStart, rollbackCutoff, windowEnd, now, externalActionConfirmed: true,
    pauseBeforeGate: pauseBeforeSignoff ? 'uat_signoff' : null
  });
  if (pauseBeforeSignoff && result.status === 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF') {
    try {
      const gateResults = result.gateResults.map((gate) => ({
        gate: gate.gate,
        result: gate.result,
        evidenceRef: path.basename(gate.evidenceRef),
        evidenceSha256: hashReceipt(gate.evidenceRef)
      }));
      const pause = createCheckpoint({ runId: writeReceipt.runId, releaseSha, gateResults, checkedAt: new Date(Number(now())).toISOString() });
      if (!pause.checkpoint) throw new Error(pause.failures?.join(',') || 'SIGNOFF_CHECKPOINT_INVALID');
      const checkpointPath = persistCheckpoint(path.join(root, `${writeReceipt.runId}.checkpoint`), pause.checkpoint);
      return {
        checkedAt: new Date(startedAt).toISOString(), runId: writeReceipt.runId, receiptRoot: root,
        checkpointPath, actualCutoverExecuted: true, externalMutationPerformed: true,
        ...result, productionGo: false
      };
    } catch {
      const containment = await routeDisableHandler({ failedGate: 'uat_signoff', failureReason: 'SIGNOFF_CHECKPOINT_NOT_RECORDED' });
      const verified = containment?.status === 'PASS_PUBLIC_ROUTE_DISABLED' && typeof containment?.evidenceRef === 'string' && containment.evidenceRef.length > 0;
      return {
        checkedAt: new Date(startedAt).toISOString(), runId: writeReceipt.runId, receiptRoot: root,
        status: verified ? 'PASS_SIGNOFF_CHECKPOINT_FAILURE_CONTAINED' : 'BLOCKED_SIGNOFF_CHECKPOINT_FAILURE_NOT_CONTAINED',
        failures: verified ? [] : ['PUBLIC_ROUTE_DISABLE_NOT_VERIFIED'], gateResults: result.gateResults,
        executedGates: result.executedGates, skippedGates: result.skippedGates,
        routeDisableRequired: true, routeDisableVerified: verified,
        routeDisableEvidenceRef: verified ? containment.evidenceRef : '',
        actualCutoverExecuted: true, externalMutationPerformed: true, productionGo: false
      };
    }
  }
  return {
    checkedAt: new Date(startedAt).toISOString(),
    runId: writeReceipt.runId || null,
    receiptRoot: root,
    actualCutoverExecuted: result.executedGates.length > 0,
    externalMutationPerformed: result.executedGates.length > 0,
    ...result,
    productionGo: false
  };
}

export async function resumeProductionCutoverSignoff({
  execute = false,
  confirmation = null,
  runId = null,
  releaseSha = null,
  checkpointPath = null,
  roleResultReferences = {},
  signoffReferences = {},
  now = () => Date.now(),
  receiptRoot = PRODUCTION_CUTOVER_RECEIPT_ROOT,
  ensureReceiptRoot = ensureCutoverReceiptRoot,
  createWriter = createRuntimeReceiptWriter,
  createRunner = createProcessStepRunner,
  loadCheckpoint = loadSignoffPauseCheckpoint,
  validateReceipts = validateSignoffResumeReceipts
} = {}) {
  const checkedAtMs = Number(now());
  const checkedAt = new Date(checkedAtMs).toISOString();
  if (!execute) return { ...waitingResult('PASS_SIGNOFF_RESUME_ENTRYPOINT_DRY_RUN', checkedAtMs), resumeGate: 'uat_signoff' };
  const windowStart = Date.parse(PRODUCTION_CHANGE_WINDOW.start);
  const rollbackCutoff = Date.parse(PRODUCTION_CHANGE_WINDOW.rollbackCutoff);
  const windowEnd = Date.parse(PRODUCTION_CHANGE_WINDOW.end);
  if (!Number.isFinite(checkedAtMs) || checkedAtMs < windowStart || checkedAtMs > windowEnd) return waitingResult('FAIL_OUTSIDE_APPROVED_CHANGE_WINDOW', checkedAtMs, ['OUTSIDE_APPROVED_CHANGE_WINDOW']);
  let root; let checkpoint;
  try { root = ensureReceiptRoot({ root: receiptRoot }); checkpoint = loadCheckpoint(checkpointPath); }
  catch { return waitingResult('FAIL_SIGNOFF_RESUME_INPUT_PREPARATION', checkedAtMs, ['SIGNOFF_RESUME_INPUT_NOT_READY']); }
  const receiptValidation = validateReceipts({ root, checkpoint });
  const writeReceipt = createWriter({ root, runId: checkpoint.runId, startSequence: receiptValidation.receiptCount });
  const runStep = createRunner({ writeReceipt });
  const recordGateEvidence = createGateEvidenceRecorder({ writeReceipt });
  const routeDisableHandler = createCutoverRouteDisableHandler({ runStep, recordGateEvidence });
  const contain = async (reason) => {
    const result = await routeDisableHandler({ failedGate: 'uat_signoff', failureReason: reason });
    const verified = result?.status === 'PASS_PUBLIC_ROUTE_DISABLED' && typeof result?.evidenceRef === 'string' && result.evidenceRef.length > 0;
    return {
      checkedAt, runId: checkpoint.runId, receiptRoot: root,
      status: verified ? 'PASS_SIGNOFF_RESUME_FAILURE_CONTAINED' : 'BLOCKED_SIGNOFF_RESUME_FAILURE_NOT_CONTAINED',
      failures: verified ? [] : ['PUBLIC_ROUTE_DISABLE_NOT_VERIFIED'],
      executedGates: [], skippedGates: ['uat_signoff'], routeDisableRequired: true,
      routeDisableVerified: verified, routeDisableEvidenceRef: verified ? result.evidenceRef : '',
      actualCutoverExecuted: false, externalMutationPerformed: true, productionGo: false
    };
  };
  if (receiptValidation.status !== 'PASS_SIGNOFF_RESUME_RECEIPTS') return contain(receiptValidation.failures.join(','));
  const resume = evaluateSignoffResume({ checkpoint, runId, releaseSha, checkedAt, confirmation, roleResultReferences, signoffReferences });
  if (checkedAtMs > rollbackCutoff || resume.routeDisableRequired) return contain(resume.failures?.join(',') || 'ROLLBACK_CUTOFF_EXCEEDED');
  if (resume.status !== 'READY_FOR_SAME_RUN_UAT_SIGNOFF_RESUME') {
    return { checkedAt, runId: checkpoint.runId, receiptRoot: root, ...resume, actualCutoverExecuted: false, externalMutationPerformed: false, productionGo: false };
  }
  const gateHandler = createCutoverGateHandlers({ runStep, recordGateEvidence }).uat_signoff;
  const gateResult = await gateHandler();
  if (gateResult?.status !== 'PASS' || typeof gateResult?.evidenceRef !== 'string' || !gateResult.evidenceRef) return contain(gateResult?.reason || 'UAT_SIGNOFF_GATE_NOT_PASS');
  return {
    checkedAt, runId: checkpoint.runId, receiptRoot: root,
    status: 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION', failures: [],
    gateResults: [{ gate: 'uat_signoff', result: 'PASS', evidenceRef: gateResult.evidenceRef }],
    executedGates: ['uat_signoff'], skippedGates: [], routeDisableRequired: false,
    routeDisableVerified: false, actualCutoverExecuted: true, externalMutationPerformed: true, productionGo: false
  };
}

export { SIGNOFF_RESUME_CONFIRMATION };
