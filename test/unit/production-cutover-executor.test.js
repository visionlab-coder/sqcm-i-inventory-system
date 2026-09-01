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
