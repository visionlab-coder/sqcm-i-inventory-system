const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-cutover-executor.mjs');

const beforeWindow = () => Date.parse('2026-09-01T00:00:00.000Z');
const insideWindow = () => Date.parse('2026-09-11T12:00:00.000Z');

test('dry-run과 변경창 밖 execute는 receipt root나 process dependency를 만들지 않는다', async () => {
  const { executeProductionCutover } = await modulePromise;
  for (const input of [{ execute: false, now: beforeWindow }, { execute: true, externalActionConfirmed: true, now: beforeWindow }]) {
    let ensureCount = 0; let writerCount = 0; let runnerCount = 0;
    const result = await executeProductionCutover({
      ...input,
      ensureReceiptRoot: () => { ensureCount += 1; return 'x'; },
      createWriter: () => { writerCount += 1; return async () => 'x'; },
      createRunner: () => { runnerCount += 1; return async () => ({}); }
    });
    assert.equal(ensureCount, 0); assert.equal(writerCount, 0); assert.equal(runnerCount, 0);
    assert.equal(result.actualCutoverExecuted, false); assert.equal(result.productionGo, false);
  }
});

test('변경창 안에서도 exact 외부 확인 전에는 파일·process 준비가 0건이다', async () => {
  const { executeProductionCutover } = await modulePromise;
  let ensureCount = 0;
  const result = await executeProductionCutover({ execute: true, now: insideWindow, externalActionConfirmed: false, ensureReceiptRoot: () => { ensureCount += 1; } });
  assert.equal(result.status, 'READY_WAIT_EXTERNAL_CUTOVER_ACTION_CONFIRMATION');
  assert.equal(ensureCount, 0);
});

test('receipt root 준비 실패는 child process 전에 fail-closed 한다', async () => {
  const { executeProductionCutover } = await modulePromise;
  let runnerCount = 0;
  const result = await executeProductionCutover({
    execute: true, now: insideWindow, externalActionConfirmed: true,
    ensureReceiptRoot: () => { throw new Error('reparse'); },
    createRunner: () => { runnerCount += 1; }
  });
  assert.equal(result.status, 'FAIL_CUTOVER_RECEIPT_ROOT_PREPARATION');
  assert.equal(runnerCount, 0);
});

test('물리 parent 아래 receipt root만 새로 준비한다', async () => {
  const { ensureCutoverReceiptRoot } = await modulePromise;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-root-'));
  const root = path.join(parent, 'receipts');
  try {
    assert.equal(ensureCutoverReceiptRoot({ root }), path.resolve(root));
    assert.equal(fs.lstatSync(root).isDirectory(), true);
    assert.equal(ensureCutoverReceiptRoot({ root }), path.resolve(root));
  } finally { fs.rmSync(parent, { recursive: true }); }
});

test('변경창·확인·root가 맞으면 12 Gate 14 step을 합성 실행하되 GO로 승격하지 않는다', async () => {
  const { executeProductionCutover } = await modulePromise;
  let stepCount = 0; let receiptCount = 0;
  const result = await executeProductionCutover({
    execute: true, now: insideWindow, externalActionConfirmed: true,
    ensureReceiptRoot: () => 'synthetic-root',
    createWriter: () => async ({ kind, gate, step }) => { receiptCount += 1; return `synthetic://${kind}/${gate}/${step}/${receiptCount}`; },
    createRunner: ({ writeReceipt }) => async (step) => {
      stepCount += 1;
      return { exitCode: 0, status: step.acceptedStatuses[0], evidenceRef: await writeReceipt({ kind: 'step', gate: step.gate, step: step.id, status: step.acceptedStatuses[0] }) };
    }
  });
  assert.equal(result.status, 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION');
  assert.equal(result.executedGates.length, 12);
  assert.equal(stepCount, 14);
  assert.equal(receiptCount, 26);
  assert.equal(result.productionGo, false);
});

function syntheticWriter(runId = '11111111-1111-4111-8111-111111111111') {
  let count = 0;
  const writer = async ({ kind, gate, step }) => `C:\\runtime\\${String(++count).padStart(4, '0')}-${kind}-${gate}-${step}.json`;
  Object.defineProperty(writer, 'runId', { value: runId });
  return writer;
}

test('Gate 1~11 뒤 물리 checkpoint 계약을 기록하고 Gate 12를 실행하지 않는다', async () => {
  const { executeProductionCutover } = await modulePromise;
  let persisted = null; let stepCount = 0;
  const writer = syntheticWriter();
  const result = await executeProductionCutover({
    execute: true, now: insideWindow, externalActionConfirmed: true, pauseBeforeSignoff: true, releaseSha: 'a'.repeat(40),
    ensureReceiptRoot: () => 'C:\\runtime', createWriter: () => writer,
    createRunner: ({ writeReceipt }) => async (step) => {
      stepCount += 1;
      return { exitCode: 0, status: step.acceptedStatuses[0], evidenceRef: await writeReceipt({ kind: 'step', gate: step.gate, step: step.id }) };
    },
    hashReceipt: () => 'b'.repeat(64),
    persistCheckpoint: (target, checkpoint) => { persisted = { target, checkpoint }; return target; }
  });
  assert.equal(result.status, 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF');
  assert.equal(result.executedGates.length, 11);
  assert.equal(result.skippedGates[0], 'uat_signoff');
  assert.equal(stepCount, 13);
  assert.equal(persisted.checkpoint.completedGates.length, 11);
  assert.match(persisted.target, /\.checkpoint$/);
});

test('동일 run 역할·서명 6건 뒤 Gate 12만 재개한다', async () => {
  const { resumeProductionCutoverSignoff, SIGNOFF_RESUME_CONFIRMATION } = await modulePromise;
  const checkpoint = {
    schemaVersion: 1, evidenceType: 'P6_CUTOVER_SIGNOFF_PAUSE_CHECKPOINT', runId: '11111111-1111-4111-8111-111111111111', releaseSha: 'a'.repeat(40),
    checkedAt: '2026-09-11T12:00:00.000Z', pausedBeforeGate: 'uat_signoff', productionGo: false,
    completedGates: ['artifact','backup_restore','migration_review','provider_preflight','health_readiness','core_smoke','csrf_idempotency','logs_5xx','nonfunctional','operational_health','rollback'].map((gate, index) => ({ gate, evidenceRef: `${index + 1}-${gate}.json`, evidenceSha256: 'b'.repeat(64) }))
  };
  let stepCount = 0;
  const references = { ADMIN: true, MANAGER: true, USER: true, BUSINESS: true, SECURITY: true, OPERATIONS: true };
  const result = await resumeProductionCutoverSignoff({
    execute: true, confirmation: SIGNOFF_RESUME_CONFIRMATION, runId: checkpoint.runId, releaseSha: checkpoint.releaseSha,
    checkpointPath: 'checkpoint', roleResultReferences: references, signoffReferences: references, now: insideWindow,
    ensureReceiptRoot: () => 'C:\\runtime', loadCheckpoint: () => checkpoint,
    validateReceipts: () => ({ status: 'PASS_SIGNOFF_RESUME_RECEIPTS', failures: [], receiptCount: 24 }),
    createWriter: () => syntheticWriter(checkpoint.runId),
    createRunner: ({ writeReceipt }) => async (step) => {
      stepCount += 1;
      return { exitCode: 0, status: step.acceptedStatuses[0], evidenceRef: await writeReceipt({ kind: 'step', gate: step.gate, step: step.id }) };
    }
  });
  assert.equal(result.status, 'READY_FOR_CUTOVER_EVIDENCE_FINALIZATION');
  assert.deepEqual(result.executedGates, ['uat_signoff']);
  assert.equal(stepCount, 1);
  assert.equal(result.productionGo, false);
});

test('cutoff 이후 재개는 Gate 12 대신 exact route-disable을 호출한다', async () => {
  const { resumeProductionCutoverSignoff, SIGNOFF_RESUME_CONFIRMATION } = await modulePromise;
  const checkpoint = {
    schemaVersion: 1, evidenceType: 'P6_CUTOVER_SIGNOFF_PAUSE_CHECKPOINT', runId: '11111111-1111-4111-8111-111111111111', releaseSha: 'a'.repeat(40),
    checkedAt: '2026-09-11T12:00:00.000Z', pausedBeforeGate: 'uat_signoff', productionGo: false,
    completedGates: ['artifact','backup_restore','migration_review','provider_preflight','health_readiness','core_smoke','csrf_idempotency','logs_5xx','nonfunctional','operational_health','rollback'].map((gate, index) => ({ gate, evidenceRef: `${index + 1}-${gate}.json`, evidenceSha256: 'b'.repeat(64) }))
  };
  const calls = [];
  const result = await resumeProductionCutoverSignoff({
    execute: true, confirmation: SIGNOFF_RESUME_CONFIRMATION, runId: checkpoint.runId, releaseSha: checkpoint.releaseSha,
    checkpointPath: 'checkpoint', now: () => Date.parse('2026-09-11T13:01:00.000Z'),
    ensureReceiptRoot: () => 'C:\\runtime', loadCheckpoint: () => checkpoint,
    validateReceipts: () => ({ status: 'PASS_SIGNOFF_RESUME_RECEIPTS', failures: [], receiptCount: 24 }),
    createWriter: () => syntheticWriter(checkpoint.runId),
    createRunner: ({ writeReceipt }) => async (step) => {
      calls.push(step.id);
      return { exitCode: 0, status: step.acceptedStatuses[0], evidenceRef: await writeReceipt({ kind: 'step', gate: step.gate, step: step.id }) };
    }
  });
  assert.equal(result.status, 'PASS_SIGNOFF_RESUME_FAILURE_CONTAINED');
  assert.deepEqual(calls, ['route-disable']);
  assert.equal(result.routeDisableVerified, true);
});
