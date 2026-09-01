import { CUTOVER_GATE_SEQUENCE, evaluateCutoverOrchestrator } from '../src/operations/production-cutover-orchestrator.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';

const execute = process.argv.includes('--execute');
const now = new Date();
const start = new Date(PRODUCTION_CHANGE_WINDOW.start);
const cutoff = new Date(PRODUCTION_CHANGE_WINDOW.rollbackCutoff);
const end = new Date(PRODUCTION_CHANGE_WINDOW.end);
const insideWindow = now >= start && now <= end;
const externalActionConfirmed = process.env.PRODUCTION_CUTOVER_CONFIRMATION === 'ACK-2026-09-11-P6-G4';
const commands = Object.freeze({
  artifact:'verify immutable candidate SHA and remote CI',
  backup_restore:'npm.cmd run db:backup and verified restore evidence',
  migration_review:'npm.cmd run db:verify',
  provider_preflight:'npm.cmd run production:provider-preflight',
  health_readiness:'npm.cmd run production:public-probe',
  core_smoke:'npm.cmd run production:role-core-smoke',
  csrf_idempotency:'npm.cmd run production:authenticated-idempotency',
  logs_5xx:'npm.cmd run production:log-gate',
  nonfunctional:'npm.cmd run production:nonfunctional-baseline against public HTTPS',
  operational_health:'npm.cmd run production:operational-health-baseline after cutover',
  rollback:'npm.cmd run production:rollback-readiness then disable public route on any required failure',
  uat_signoff:'npm.cmd run production:signoff-preflight then production:cutover-evidence'
});
const result = evaluateCutoverOrchestrator({
  sequence:CUTOVER_GATE_SEQUENCE,
  windowStart:start.getTime(),rollbackCutoff:cutoff.getTime(),windowEnd:end.getTime(),
  rollbackAction:'disable-public-route',preserveLoopback:true,productionGo:false,
  execute,insideWindow,externalActionConfirmed
});
console.log(JSON.stringify({
  checkedAt:now.toISOString(),mode:execute?'execute-preflight':'dry-run',insideWindow,
  changeWindow:PRODUCTION_CHANGE_WINDOW,
  sequence:CUTOVER_GATE_SEQUENCE.map((gate,index)=>({order:index+1,gate,action:commands[gate]})),
  haltPolicy:{requiredGateFailure:'disable-public-route',cutoff:'22:00 KST',preserve:'loopback services and named volumes'},
  externalMutationPerformed:false,
  ...result
},null,2));
if (result.status.startsWith('FAIL_')) process.exitCode=1;
