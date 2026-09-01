import {
  CUTOVER_GATE_COMMANDS,
  CUTOVER_GATE_SEQUENCE,
  evaluateCutoverOrchestrator
} from '../src/operations/production-cutover-orchestrator.mjs';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';

const execute = process.argv.includes('--execute');
const now = new Date();
const start = new Date(PRODUCTION_CHANGE_WINDOW.start);
const cutoff = new Date(PRODUCTION_CHANGE_WINDOW.rollbackCutoff);
const end = new Date(PRODUCTION_CHANGE_WINDOW.end);
const insideWindow = now >= start && now <= end;
const externalActionConfirmed = process.env.PRODUCTION_CUTOVER_CONFIRMATION === 'ACK-2026-09-11-P6-G4';
const result = evaluateCutoverOrchestrator({
  sequence:CUTOVER_GATE_SEQUENCE,
  windowStart:start.getTime(),rollbackCutoff:cutoff.getTime(),windowEnd:end.getTime(),
  rollbackAction:'disable-public-route',preserveLoopback:true,productionGo:false,
  execute,insideWindow,externalActionConfirmed
});
console.log(JSON.stringify({
  checkedAt:now.toISOString(),mode:execute?'execute-preflight':'dry-run',insideWindow,
  changeWindow:PRODUCTION_CHANGE_WINDOW,
  sequence:CUTOVER_GATE_SEQUENCE.map((gate,index)=>({order:index+1,gate,action:CUTOVER_GATE_COMMANDS[gate]})),
  haltPolicy:{requiredGateFailure:'disable-public-route',cutoff:'22:00 KST',preserve:'loopback services and named volumes'},
  externalMutationPerformed:false,
  ...result
},null,2));
if (result.status.startsWith('FAIL_')) process.exitCode=1;
