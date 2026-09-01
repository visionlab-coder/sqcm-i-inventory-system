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
  createRunner = createProcessStepRunner
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

  let root;
  try { root = ensureReceiptRoot({ root: receiptRoot }); }
  catch { return waitingResult('FAIL_CUTOVER_RECEIPT_ROOT_PREPARATION', startedAt, ['CUTOVER_RECEIPT_ROOT_NOT_READY']); }
  const writeReceipt = createWriter({ root });
  const runStep = createRunner({ writeReceipt });
  const recordGateEvidence = createGateEvidenceRecorder({ writeReceipt });
  const result = await executeCutoverGateSequence({
    gateHandlers: createCutoverGateHandlers({ runStep, recordGateEvidence }),
    routeDisableHandler: createCutoverRouteDisableHandler({ runStep, recordGateEvidence }),
    windowStart, rollbackCutoff, windowEnd, now, externalActionConfirmed: true
  });
  return {
    checkedAt: new Date(startedAt).toISOString(),
    receiptRoot: root,
    actualCutoverExecuted: result.executedGates.length > 0,
    externalMutationPerformed: result.executedGates.length > 0,
    ...result,
    productionGo: false
  };
}
