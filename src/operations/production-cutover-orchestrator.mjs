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
  health_readiness: 'npm.cmd run production:public-probe',
  core_smoke: 'npm.cmd run production:role-core-smoke -- --public',
  csrf_idempotency: 'npm.cmd run production:authenticated-idempotency',
  logs_5xx: 'npm.cmd run production:log-gate',
  nonfunctional: 'npm.cmd run production:nonfunctional-baseline -- --public',
  operational_health: 'npm.cmd run production:operational-health-baseline -- --public',
  rollback: 'npm.cmd run production:rollback-readiness then disable public route on any required failure',
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
