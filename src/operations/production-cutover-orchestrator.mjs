export const CUTOVER_GATE_SEQUENCE = Object.freeze([
  'artifact','backup_restore','migration_review','provider_preflight',
  'health_readiness','core_smoke','csrf_idempotency','logs_5xx',
  'nonfunctional','operational_health','rollback','uat_signoff'
]);

export const CUTOVER_GATE_COMMANDS = Object.freeze({
  artifact: 'verify immutable candidate SHA and remote CI',
  backup_restore: 'npm.cmd run db:backup and verified restore evidence',
  migration_review: 'npm.cmd run db:verify',
  provider_preflight: 'npm.cmd run production:provider-preflight',
  health_readiness: 'npm.cmd run production:ingress-publication -- --execute then npm.cmd run production:public-probe',
  core_smoke: 'npm.cmd run production:uat-actor-provision -- --execute then npm.cmd run production:role-core-smoke -- --public',
  csrf_idempotency: 'npm.cmd run production:authenticated-idempotency -- --public',
  logs_5xx: 'npm.cmd run production:log-gate',
  nonfunctional: 'npm.cmd run production:nonfunctional-baseline -- --public',
  operational_health: 'npm.cmd run production:operational-health-baseline -- --public',
  rollback: 'npm.cmd run production:rollback-readiness then npm.cmd run production:route-disable -- --execute on any required failure',
  uat_signoff: 'npm.cmd run production:signoff-preflight then production:cutover-evidence'
});

export function evaluateCutoverOrchestrator(input) {
  const failures = [];
  const sequence = input.sequence || [];
  if (sequence.length !== 12 || new Set(sequence).size !== 12) failures.push('GATE_COUNT_OR_UNIQUENESS_INVALID');
  if (JSON.stringify(sequence) !== JSON.stringify(CUTOVER_GATE_SEQUENCE)) failures.push('GATE_ORDER_INVALID');
  if (input.rollbackCutoff >= input.windowEnd || input.windowStart >= input.rollbackCutoff) failures.push('CHANGE_WINDOW_ORDER_INVALID');
  if (input.rollbackAction !== 'disable-public-route') failures.push('ROLLBACK_ROUTE_ACTION_INVALID');
  if (input.preserveLoopback !== true || input.productionGo !== false) failures.push('FAIL_CLOSED_INVARIANT_INVALID');
  if (failures.length) return { status:'FAIL_CUTOVER_ORCHESTRATOR_CONTRACT',failures,productionGo:false };
  if (!input.execute) return { status:'PASS_CUTOVER_ORCHESTRATOR_DRY_RUN',failures:[],productionGo:false };
  if (!input.insideWindow) return { status:'FAIL_OUTSIDE_APPROVED_CHANGE_WINDOW',failures:['OUTSIDE_APPROVED_CHANGE_WINDOW'],productionGo:false };
  if (!input.externalActionConfirmed) return { status:'READY_WAIT_EXTERNAL_CUTOVER_ACTION_CONFIRMATION',failures:[],productionGo:false };
  return { status:'READY_FOR_CHANGE_WINDOW_ORCHESTRATION',failures:[],productionGo:false };
}

export function evaluateCutoverGateExecution({ gateResults = [], routeDisableStatus = null } = {}) {
  const failures = [];
  if (!Array.isArray(gateResults) || gateResults.length !== CUTOVER_GATE_SEQUENCE.length) {
    failures.push('GATE_RESULT_COUNT_INVALID');
  }
  const gateNames = Array.isArray(gateResults) ? gateResults.map((item) => item?.gate) : [];
  if (JSON.stringify(gateNames) !== JSON.stringify(CUTOVER_GATE_SEQUENCE)) failures.push('GATE_RESULT_ORDER_INVALID');
  if (Array.isArray(gateResults) && !gateResults.every((item) => item?.result === 'PASS' || item?.result === 'FAIL')) {
    failures.push('GATE_RESULT_VALUE_INVALID');
  }
  if (failures.length > 0) {
    return {
      status: 'FAIL_CUTOVER_GATE_EXECUTION_CONTRACT', failures, executedGates: [], skippedGates: [],
      failedGate: null, routeDisableRequired: false, routeDisableVerified: false, productionGo: false
    };
  }

  const failureIndex = gateResults.findIndex((item) => item.result === 'FAIL');
  if (failureIndex === -1) {
    return {
      status: 'PASS_ALL_CUTOVER_GATES_REHEARSAL_NO_GO', failures: [],
      executedGates: [...CUTOVER_GATE_SEQUENCE], skippedGates: [], failedGate: null,
      routeDisableRequired: false, routeDisableVerified: false, productionGo: false
    };
  }

  const routeDisableVerified = routeDisableStatus === 'PASS_PUBLIC_ROUTE_DISABLED';
  return {
    status: routeDisableVerified ? 'PASS_CUTOVER_GATE_FAILURE_CONTAINED' : 'BLOCKED_CUTOVER_GATE_FAILURE_NOT_CONTAINED',
    failures: routeDisableVerified ? [] : ['PUBLIC_ROUTE_DISABLE_NOT_VERIFIED'],
    executedGates: CUTOVER_GATE_SEQUENCE.slice(0, failureIndex + 1),
    skippedGates: CUTOVER_GATE_SEQUENCE.slice(failureIndex + 1),
    failedGate: CUTOVER_GATE_SEQUENCE[failureIndex],
    routeDisableRequired: true,
    routeDisableVerified,
    productionGo: false
  };
}

export function runCutoverFailureMatrixRehearsal() {
  const scenarios = CUTOVER_GATE_SEQUENCE.map((failedGate, failedIndex) => {
    const gateResults = CUTOVER_GATE_SEQUENCE.map((gate, index) => ({ gate, result: index === failedIndex ? 'FAIL' : 'PASS' }));
    const result = evaluateCutoverGateExecution({ gateResults, routeDisableStatus: 'PASS_PUBLIC_ROUTE_DISABLED' });
    return {
      failedGate,
      status: result.status,
      executedGateCount: result.executedGates.length,
      skippedGateCount: result.skippedGates.length,
      routeDisableVerified: result.routeDisableVerified,
      productionGo: result.productionGo
    };
  });
  const pass = scenarios.every((scenario, index) => scenario.status === 'PASS_CUTOVER_GATE_FAILURE_CONTAINED'
    && scenario.executedGateCount === index + 1
    && scenario.skippedGateCount === CUTOVER_GATE_SEQUENCE.length - index - 1
    && scenario.routeDisableVerified === true
    && scenario.productionGo === false);
  return {
    status: pass ? 'PASS_CUTOVER_12_GATE_FAILURE_MATRIX_REHEARSAL' : 'FAIL_CUTOVER_12_GATE_FAILURE_MATRIX_REHEARSAL',
    scenarioCount: scenarios.length,
    containedFailureCount: scenarios.filter((scenario) => scenario.status === 'PASS_CUTOVER_GATE_FAILURE_CONTAINED').length,
    routeDisableVerificationCount: scenarios.filter((scenario) => scenario.routeDisableVerified).length,
    scenarios,
    externalMutationPerformed: false,
    productionGo: false
  };
}

function invalidExecutionResult(status, failures) {
  return {
    status,
    failures,
    gateResults: [],
    executedGates: [],
    skippedGates: [...CUTOVER_GATE_SEQUENCE],
    failedGate: null,
    routeDisableRequired: false,
    routeDisableVerified: false,
    productionGo: false
  };
}

export async function executeCutoverGateSequence({
  gateHandlers,
  routeDisableHandler,
  windowStart,
  rollbackCutoff,
  windowEnd,
  now = () => Date.now(),
  externalActionConfirmed = false
} = {}) {
  if (![windowStart, rollbackCutoff, windowEnd].every(Number.isFinite)
    || windowStart >= rollbackCutoff || rollbackCutoff >= windowEnd) {
    return invalidExecutionResult('FAIL_CUTOVER_EXECUTION_WINDOW_CONTRACT', ['CHANGE_WINDOW_ORDER_INVALID']);
  }
  const handlerKeys = gateHandlers && typeof gateHandlers === 'object' ? Object.keys(gateHandlers) : [];
  if (JSON.stringify(handlerKeys) !== JSON.stringify(CUTOVER_GATE_SEQUENCE)
    || !CUTOVER_GATE_SEQUENCE.every((gate) => typeof gateHandlers?.[gate] === 'function')
    || typeof routeDisableHandler !== 'function') {
    return invalidExecutionResult('FAIL_CUTOVER_EXECUTION_HANDLER_CONTRACT', ['GATE_HANDLER_CONTRACT_INVALID']);
  }
  const startedAt = Number(now());
  if (!Number.isFinite(startedAt) || startedAt < windowStart || startedAt > windowEnd) {
    return invalidExecutionResult('FAIL_OUTSIDE_APPROVED_CHANGE_WINDOW', ['OUTSIDE_APPROVED_CHANGE_WINDOW']);
  }
  if (!externalActionConfirmed) {
    return invalidExecutionResult('READY_WAIT_EXTERNAL_CUTOVER_ACTION_CONFIRMATION', []);
  }

  const gateResults = [];
  let failedGate = null;
  let failureReason = null;
  for (const gate of CUTOVER_GATE_SEQUENCE) {
    if (Number(now()) > rollbackCutoff) {
      failedGate = gate;
      failureReason = 'ROLLBACK_CUTOFF_EXCEEDED';
      gateResults.push({ gate, result: 'FAIL', evidenceRef: '', reason: failureReason });
      break;
    }
    try {
      const gateResult = await gateHandlers[gate]();
      const passed = gateResult?.status === 'PASS'
        && typeof gateResult.evidenceRef === 'string'
        && gateResult.evidenceRef.trim().length > 0;
      gateResults.push({
        gate,
        result: passed ? 'PASS' : 'FAIL',
        evidenceRef: passed ? gateResult.evidenceRef.trim() : '',
        reason: passed ? '' : (gateResult?.reason || 'GATE_RESULT_NOT_PASS')
      });
      if (!passed) {
        failedGate = gate;
        failureReason = gateResults.at(-1).reason;
        break;
      }
    } catch {
      failedGate = gate;
      failureReason = 'GATE_HANDLER_THROWN';
      gateResults.push({ gate, result: 'FAIL', evidenceRef: '', reason: failureReason });
      break;
    }
  }

  if (failedGate === null) {
    return {
      status: 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION',
      failures: [],
      gateResults,
      executedGates: [...CUTOVER_GATE_SEQUENCE],
      skippedGates: [],
      failedGate: null,
      routeDisableRequired: false,
      routeDisableVerified: false,
      productionGo: false
    };
  }

  let routeDisableResult = null;
  try {
    routeDisableResult = await routeDisableHandler({ failedGate, failureReason });
  } catch {
    routeDisableResult = { status: 'FAIL_PUBLIC_ROUTE_DISABLE_HANDLER_THROWN', evidenceRef: '' };
  }
  const routeDisableVerified = routeDisableResult?.status === 'PASS_PUBLIC_ROUTE_DISABLED'
    && typeof routeDisableResult.evidenceRef === 'string'
    && routeDisableResult.evidenceRef.trim().length > 0;
  const failureIndex = CUTOVER_GATE_SEQUENCE.indexOf(failedGate);
  return {
    status: routeDisableVerified
      ? 'PASS_CUTOVER_EXECUTION_FAILURE_CONTAINED'
      : 'BLOCKED_CUTOVER_EXECUTION_FAILURE_NOT_CONTAINED',
    failures: routeDisableVerified ? [] : ['PUBLIC_ROUTE_DISABLE_NOT_VERIFIED'],
    gateResults,
    executedGates: CUTOVER_GATE_SEQUENCE.slice(0, failureIndex + 1),
    skippedGates: CUTOVER_GATE_SEQUENCE.slice(failureIndex + 1),
    failedGate,
    routeDisableRequired: true,
    routeDisableVerified,
    routeDisableEvidenceRef: routeDisableVerified ? routeDisableResult.evidenceRef.trim() : '',
    productionGo: false
  };
}

export async function runCutoverExecutionEngineRehearsal() {
  const calls = [];
  const gateHandlers = Object.fromEntries(CUTOVER_GATE_SEQUENCE.map((gate) => [gate, async () => {
    calls.push(gate);
    return { status: 'PASS', evidenceRef: `synthetic://${gate}` };
  }]));
  const result = await executeCutoverGateSequence({
    gateHandlers,
    routeDisableHandler: async () => ({ status: 'PASS_PUBLIC_ROUTE_DISABLED', evidenceRef: 'synthetic://route-disabled' }),
    windowStart: 1,
    rollbackCutoff: 3,
    windowEnd: 4,
    now: () => 2,
    externalActionConfirmed: true
  });
  const pass = result.status === 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION'
    && calls.length === CUTOVER_GATE_SEQUENCE.length
    && result.gateResults.every((gate) => gate.result === 'PASS')
    && result.productionGo === false;
  return {
    status: pass ? 'PASS_CUTOVER_EXECUTION_ENGINE_REHEARSAL' : 'FAIL_CUTOVER_EXECUTION_ENGINE_REHEARSAL',
    executedGateCount: calls.length,
    gateResultCount: result.gateResults.length,
    actualCutoverExecuted: false,
    externalMutationPerformed: false,
    productionGo: false
  };
}
