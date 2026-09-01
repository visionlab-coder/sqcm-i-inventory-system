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
