import { PRODUCTION_CHANGE_WINDOW } from './production-cutover-preflight.mjs';
import { CUTOVER_GATE_SEQUENCE } from './production-cutover-orchestrator.mjs';

export const SIGNOFF_RESUME_CONFIRMATION = 'ACK-P6-RESUME-SAME-CUTOVER-RUN-SIGNOFF';
const RUN_ID = /^[a-f0-9]{8}-[a-f0-9-]{27,35}$/i;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
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
      || !RECEIPT_FILE.test(result?.evidenceRef || '')) failures.push(`PRE_SIGNOFF_GATE_INVALID:${PRE_SIGNOFF_GATES[index]}`);
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
      completedGates: gateResults.map(({ gate, evidenceRef }) => ({ gate, evidenceRef })),
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
    || completed.some((item, index) => item?.gate !== PRE_SIGNOFF_GATES[index] || !RECEIPT_FILE.test(item?.evidenceRef || ''))) failures.push('CHECKPOINT_GATE_PROVENANCE_INVALID');
  if (failures.length) return { status: 'FAIL_SIGNOFF_RESUME_CONTRACT', failures: [...new Set(failures)], routeDisableRequired: true, productionGo: false };

  const missing = [
    ...['ADMIN', 'MANAGER', 'USER'].filter((role) => roleResultReferences[role] !== true).map((role) => `${role}_ACTUAL_ROLE_RESULT_MISSING`),
    ...['BUSINESS', 'SECURITY', 'OPERATIONS'].filter((area) => signoffReferences[area] !== true).map((area) => `${area}_ACTUAL_SIGNOFF_MISSING`)
  ];
  if (missing.length) return { status: 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF', failures: [], missing, routeDisableRequired: false, productionGo: false };
  if (confirmation !== SIGNOFF_RESUME_CONFIRMATION) return { status: 'READY_WAIT_SIGNOFF_RESUME_CONFIRMATION', failures: [], missing: [], routeDisableRequired: false, productionGo: false };
  return { status: 'READY_FOR_SAME_RUN_UAT_SIGNOFF_RESUME', failures: [], missing: [], resumeGate: 'uat_signoff', routeDisableRequired: false, productionGo: false };
}

export function runSignoffPauseResumeRehearsal() {
  const runId = '11111111-1111-4111-8111-111111111111';
  const releaseSha = 'a'.repeat(40);
  const checkedAt = '2026-09-11T12:00:00.000Z';
  const gateResults = PRE_SIGNOFF_GATES.map((gate, index) => ({ gate, result: 'PASS', evidenceRef: `${String(index + 1).padStart(4, '0')}-${gate}.json` }));
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
