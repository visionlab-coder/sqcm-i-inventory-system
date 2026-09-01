import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CUTOVER_GATE_ADAPTER_PLAN, createCutoverGateHandlers, createCutoverRouteDisableHandler } from '../src/operations/production-cutover-gate-adapters.mjs';
import { executeCutoverGateSequence } from '../src/operations/production-cutover-orchestrator.mjs';
import { createGateEvidenceRecorder, createProcessStepRunner, createRuntimeReceiptWriter } from '../src/operations/production-cutover-process-runner.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-runner-'));
let spawnCount = 0;
try {
  const writeReceipt = createRuntimeReceiptWriter({ root });
  const runStep = createProcessStepRunner({
    writeReceipt,
    spawnStep: async ({ script }) => {
      spawnCount += 1;
      const step = Object.values(CUTOVER_GATE_ADAPTER_PLAN).flat().find((item) => item.script === script);
      return { exitCode: 0, stdout: JSON.stringify({ status: step?.id === 'migration-verify' ? 'ignored' : step?.acceptedStatuses[0] }), stderr: 'synthetic-secret-must-not-be-recorded' };
    }
  });
  const recordGateEvidence = createGateEvidenceRecorder({ writeReceipt });
  const result = await executeCutoverGateSequence({
    gateHandlers: createCutoverGateHandlers({ runStep, recordGateEvidence }),
    routeDisableHandler: createCutoverRouteDisableHandler({ runStep, recordGateEvidence }),
    windowStart: 1, rollbackCutoff: 3, windowEnd: 4, now: () => 2, externalActionConfirmed: true
  });
  const receipts = fs.readdirSync(root).map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
  const expectedStepCount = Object.values(CUTOVER_GATE_ADAPTER_PLAN).flat().length;
  const pass = result.status === 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION'
    && spawnCount === expectedStepCount && receipts.length === expectedStepCount + 12
    && receipts.every((raw) => !raw.includes('stdout') && !raw.includes('stderr') && !raw.includes('synthetic-secret'));
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(), status: pass ? 'PASS_CUTOVER_PROCESS_RUNNER_REHEARSAL' : 'FAIL_CUTOVER_PROCESS_RUNNER_REHEARSAL',
    gateCount: 12, stepCount: spawnCount, receiptCount: receipts.length, actualCutoverExecuted: false,
    externalMutationPerformed: false, secretValuesReadOrRecorded: false, productionGo: false
  }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  const resolved = path.resolve(root);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && !fs.lstatSync(resolved).isSymbolicLink()) fs.rmSync(resolved, { recursive: true });
}
