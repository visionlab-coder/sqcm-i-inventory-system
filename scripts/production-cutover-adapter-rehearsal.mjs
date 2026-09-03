import {
  CUTOVER_GATE_ADAPTER_PLAN,
  createCutoverGateHandlers,
  createCutoverRouteDisableHandler
} from '../src/operations/production-cutover-gate-adapters.mjs';
import { executeCutoverGateSequence } from '../src/operations/production-cutover-orchestrator.mjs';

const calls = [];
const runStep = async ({ gate, id, acceptedStatuses }) => {
  calls.push(`${gate}:${id}`);
  return { exitCode: 0, status: acceptedStatuses[0], evidenceRef: `synthetic://step/${gate}/${id}` };
};
const recordGateEvidence = async ({ gate }) => `synthetic://gate/${gate}`;
const gateHandlers = createCutoverGateHandlers({ runStep, recordGateEvidence });
const routeDisableHandler = createCutoverRouteDisableHandler({ runStep, recordGateEvidence });
const result = await executeCutoverGateSequence({
  gateHandlers,
  routeDisableHandler,
  windowStart: 1,
  rollbackCutoff: 3,
  windowEnd: 4,
  now: () => 2,
  externalActionConfirmed: true
});
const expectedStepCount = Object.values(CUTOVER_GATE_ADAPTER_PLAN).flat().length;
const pass = result.status === 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION'
  && calls.length === expectedStepCount
  && result.gateResults.length === 12
  && result.productionGo === false;
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  mode: 'synthetic-cutover-adapter-rehearsal',
  status: pass ? 'PASS_CUTOVER_GATE_ADAPTER_REHEARSAL' : 'FAIL_CUTOVER_GATE_ADAPTER_REHEARSAL',
  gateCount: result.gateResults.length,
  stepCount: calls.length,
  expectedStepCount,
  actualCutoverExecuted: false,
  externalMutationPerformed: false,
  secretValuesReadOrRecorded: false,
  productionGo: false
}, null, 2));
if (!pass) process.exitCode = 1;
