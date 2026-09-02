import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeProductionCutover, resumeProductionCutoverSignoff, SIGNOFF_RESUME_CONFIRMATION } from './production-cutover-executor.mjs';
import { createRuntimeReceiptWriter } from './production-cutover-process-runner.mjs';

const CHECKED_AT = '2026-09-11T12:00:00.000Z';
const RELEASE_SHA = 'a'.repeat(40);

function syntheticRunner({ writeReceipt, calls }) {
  return async (step) => {
    calls.push(step.id);
    const status = step.acceptedStatuses[0];
    const evidenceRef = await writeReceipt({ kind: 'step', gate: step.gate, step: step.id, status, exitCode: 0 });
    return { exitCode: 0, status, evidenceRef };
  };
}

export async function runSignoffResumeRuntimeRehearsal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-runtime-'));
  const calls = [];
  try {
    const createWriter = ({ root: target, runId, startSequence = 0, cutoverBundleSha256 = null } = {}) => createRuntimeReceiptWriter({
      root: target,
      runId,
      startSequence,
      cutoverBundleSha256,
      clock: () => new Date(CHECKED_AT)
    });
    const initial = await executeProductionCutover({
      execute: true,
      externalActionConfirmed: true,
      pauseBeforeSignoff: true,
      releaseSha: RELEASE_SHA,
      now: () => Date.parse(CHECKED_AT),
      receiptRoot: root,
      ensureReceiptRoot: () => root,
      createWriter,
      createRunner: ({ writeReceipt }) => syntheticRunner({ writeReceipt, calls })
    });
    const refs = { ADMIN: true, MANAGER: true, USER: true, BUSINESS: true, SECURITY: true, OPERATIONS: true };
    const resumed = await resumeProductionCutoverSignoff({
      execute: true,
      confirmation: SIGNOFF_RESUME_CONFIRMATION,
      runId: initial.runId,
      releaseSha: RELEASE_SHA,
      checkpointPath: initial.checkpointPath,
      roleResultReferences: refs,
      signoffReferences: refs,
      now: () => Date.parse(CHECKED_AT),
      receiptRoot: root,
      ensureReceiptRoot: () => root,
      createWriter,
      createRunner: ({ writeReceipt }) => syntheticRunner({ writeReceipt, calls })
    });
    const receiptCount = fs.readdirSync(root).filter((name) => name.endsWith('.json')).length;
    const checkpointCount = fs.readdirSync(root).filter((name) => name.endsWith('.checkpoint')).length;
    const pass = initial.status === 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF'
      && initial.executedGates.length === 11 && initial.skippedGates.length === 1
      && resumed.status === 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION'
      && JSON.stringify(resumed.executedGates) === JSON.stringify(['uat_signoff'])
      && receiptCount === 26 && checkpointCount === 1 && calls.length === 14;
    return {
      status: pass ? 'PASS_SIGNOFF_RESUME_RUNTIME_REHEARSAL' : 'FAIL_SIGNOFF_RESUME_RUNTIME_REHEARSAL',
      runIdentityCount: initial.runId === resumed.runId ? 1 : 2,
      initialGateCount: initial.executedGates.length,
      resumedGateCount: resumed.executedGates.length,
      stepCount: calls.length,
      receiptCount,
      checkpointCount,
      checkpointPhysical: Boolean(initial.checkpointPath && fs.lstatSync(initial.checkpointPath).isFile()),
      externalMutationPerformed: false,
      productionGo: false
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
