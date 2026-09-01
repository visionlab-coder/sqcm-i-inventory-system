const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-activation-orchestrator.mjs');

function p6() { return { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P6_CUTOVER_ACTUAL', status: 'PASS', productionGo: true, targetUrl: 'https://inventory.safe-link.co.kr', releaseSha: 'a'.repeat(40) }; }
async function approval(overrides = {}) {
  const { OPERATIONS_ACTIVATION_ACTIONS, OPERATIONS_ACTIVATION_STEPS } = await modulePromise;
  return { schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', approved: true, targetUrl: 'https://inventory.safe-link.co.kr', runId: 'p7-activation-20261012-001', releaseSha: 'a'.repeat(40), authorizedByRef: 'identity://operations-owner', approvedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z', allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id), authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS], ...overrides };
}
async function receipt(stepId, outcome = 'PASS', overrides = {}) {
  const { OPERATIONS_ACTIVATION_STEPS } = await modulePromise; const index = OPERATIONS_ACTIVATION_STEPS.findIndex((step) => step.id === stepId); const step = OPERATIONS_ACTIVATION_STEPS[index];
  return { schemaVersion: 1, environment: 'production', activationState: 'actual', runId: 'p7-activation-20261012-001', stepId, sequence: index + 1, attempt: 1, outcome, status: outcome === 'PASS' ? step.pass[0] : outcome === 'WAIT' ? 'READY_WAIT_INPUT' : 'FAIL_TEST', exitCode: outcome === 'FAIL' ? 1 : 0, checkedAt: '2026-10-12T01:00:00.000Z', command: { executable: 'node', script: step.script, args: [...step.args] }, stdoutSha256: 'a'.repeat(64), stderrSha256: 'b'.repeat(64), secretValuesRecorded: false, ...overrides };
}

test('P6 actual·P7·Production GO 전에는 child·approval read·receipt write를 열지 않는다', async () => {
  const { evaluateOperationsActivationGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsActivationGate(value); assert.equal(result.childProcessAllowed, false); assert.equal(result.approvalReadAllowed, false); assert.equal(result.receiptWriteAllowed, false);
  }
});

test('P6 evidence·approval·root·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsActivationGate } = await modulePromise; const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.deepEqual(evaluateOperationsActivationGate(active).missing, ['p6CutoverEvidence', 'activationApproval', 'receiptRoot']);
  const ready = { ...active, p6EvidencePresent: true, approvalPresent: true, receiptRootPresent: true };
  assert.equal(evaluateOperationsActivationGate(ready).status, 'PASS_OPERATIONS_ACTIVATION_DRY_RUN_READY');
  assert.equal(evaluateOperationsActivationGate({ ...ready, execute: true }).status, 'READY_WAIT_OPERATIONS_ACTIVATION_CONFIRMATION');
  assert.equal(evaluateOperationsActivationGate({ ...ready, execute: true, confirmed: true }).childProcessAllowed, true);
});

test('approval은 exact 19 steps·10 actions·P6 release·identity·유효기간을 요구한다', async () => {
  const { validateOperationsActivationApproval } = await modulePromise;
  assert.equal(validateOperationsActivationApproval(await approval(), { p6Document: p6(), checkedAt: '2026-10-12T01:00:00.000Z' }).approved, true);
  const altered = await approval({ releaseSha: 'b'.repeat(40), authorizedByRef: 'person', expiresAt: '2027-01-01T00:00:00.000Z', allowedSteps: [], authorizedActions: [] });
  assert.throws(() => validateOperationsActivationApproval(altered, { p6Document: p6(), checkedAt: '2026-10-12T01:00:00.000Z' }), /releaseSha.*authorizedByRef.*approvalWindow.*allowedSteps.*authorizedActions/);
});

test('PASS·WAIT·FAIL 상태를 exit code와 exact allowlist로 판정한다', async () => {
  const { OPERATIONS_ACTIVATION_STEPS, classifyOperationsActivationStep } = await modulePromise; const slo = OPERATIONS_ACTIVATION_STEPS[0];
  assert.equal(classifyOperationsActivationStep(slo, { exitCode: 0, summary: { status: 'PASS_P7_SLO_30_DAY_EXPORT_CREATED' } }), 'PASS');
  assert.equal(classifyOperationsActivationStep(slo, { exitCode: 0, summary: { status: 'PASS_SLO_SAMPLE_APPENDED' } }), 'WAIT');
  assert.equal(classifyOperationsActivationStep(slo, { exitCode: 0, summary: { status: 'READY_WAIT_SLO_COLLECTION_PATHS' } }), 'WAIT');
  assert.equal(classifyOperationsActivationStep(slo, { exitCode: 1, summary: { status: 'PASS_P7_SLO_30_DAY_EXPORT_CREATED' } }), 'FAIL');
});

test('한 시점에는 첫 미완료 단계 하나만 선택하고 PASS receipt만 다음으로 이동한다', async () => {
  const { selectNextOperationsActivationStep } = await modulePromise;
  assert.equal(selectNextOperationsActivationStep([]).step.id, 'slo-collect');
  const passReceipt = await receipt('slo-collect');
  assert.equal(selectNextOperationsActivationStep([passReceipt]).step.id, 'slo-compile');
  assert.equal(selectNextOperationsActivationStep([await receipt('slo-collect', 'WAIT')]).step.id, 'slo-collect');
});

test('sequence·command·digest·runId가 변조된 receipt는 거부한다', async () => {
  const { selectNextOperationsActivationStep } = await modulePromise;
  for (const altered of [
    await receipt('slo-collect', 'PASS', { sequence: 19 }),
    await receipt('slo-collect', 'PASS', { command: { executable: 'node', script: 'other.mjs', args: [] } }),
    await receipt('slo-collect', 'PASS', { stdoutSha256: 'bad' })
  ]) assert.throws(() => selectNextOperationsActivationStep([altered]), /OPERATIONS_ACTIVATION_RECEIPT_INVALID/);
  const mixedRuns = [await receipt('slo-collect'), await receipt('slo-compile', 'WAIT', { runId: 'p7-activation-other-run' })];
  assert.throws(() => selectNextOperationsActivationStep(mixedRuns), /OPERATIONS_ACTIVATION_RECEIPT_INVALID/);
  const mismatchedOutcome = await receipt('slo-collect', 'PASS', { status: 'READY_WAIT_INPUT' });
  const skippedFirstStep = await receipt('slo-compile');
  const skippedAttempt = await receipt('slo-collect', 'FAIL', { attempt: 2 });
  for (const altered of [[mismatchedOutcome], [skippedFirstStep], [skippedAttempt]]) {
    assert.throws(() => selectNextOperationsActivationStep(altered), /OPERATIONS_ACTIVATION_RECEIPT_INVALID/);
  }
});

test('동일 단계 FAIL 3회면 PAUSED하고 child 재실행을 선택하지 않는다', async () => {
  const { selectNextOperationsActivationStep } = await modulePromise;
  const receipts = await Promise.all(Array.from({ length: 3 }, (_, index) => receipt('slo-collect', 'FAIL', { attempt: index + 1, checkedAt: `2026-10-12T01:0${index}:00.000Z` })));
  const result = selectNextOperationsActivationStep(receipts); assert.equal(result.status, 'PAUSED_OPERATIONS_ACTIVATION_STEP_FAILED_THREE_TIMES'); assert.equal(result.failedAttempts, 3);
});

test('receipt는 stdout/stderr 원문 없이 SHA만 원자적으로 한 번 기록한다', async (t) => {
  const { OPERATIONS_ACTIVATION_STEPS, buildOperationsActivationReceipt, writeOperationsActivationReceiptOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = buildOperationsActivationReceipt({ approval: await approval(), step: OPERATIONS_ACTIVATION_STEPS[0], attempt: 1, result: { exitCode: 0, summary: { status: 'PASS_P7_SLO_30_DAY_EXPORT_CREATED' }, stdout: 'sensitive stdout', stderr: 'sensitive stderr' }, checkedAt: '2026-10-12T01:00:00.000Z' });
  const output = writeOperationsActivationReceiptOnce(root, receipt, { processId: 900 }); const raw = fs.readFileSync(output, 'utf8');
  assert.equal(JSON.parse(raw).outcome, 'PASS'); assert.doesNotMatch(raw, /sensitive/); assert.throws(() => writeOperationsActivationReceiptOnce(root, receipt, { processId: 901 }), /RECEIPT_ALREADY_EXISTS/);
});

test('single-writer lease는 동시 두 번째 실행을 차단하고 정상 해제 뒤 재개한다', async (t) => {
  const { acquireOperationsActivationLease, releaseOperationsActivationLease } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-lease-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = acquireOperationsActivationLease(root, 'p7-activation-20261012-001', { processId: 901, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-first-0001' });
  assert.equal(fs.existsSync(first.path), true);
  assert.throws(() => acquireOperationsActivationLease(root, 'p7-activation-20261012-001', { processId: 902, checkedAt: '2026-10-12T01:00:01.000Z', leaseId: 'lease-second-0002' }), /OPERATIONS_ACTIVATION_LEASE_HELD/);
  assert.equal(releaseOperationsActivationLease(first), true); assert.equal(fs.existsSync(first.path), false);
  const resumed = acquireOperationsActivationLease(root, 'p7-activation-20261012-001', { processId: 903, checkedAt: '2026-10-12T01:00:02.000Z', leaseId: 'lease-resumed-0003' });
  assert.equal(releaseOperationsActivationLease(resumed), true);
});

test('다른 owner의 release 시도와 crash stale lease는 자동 삭제하지 않는다', async (t) => {
  const { acquireOperationsActivationLease, releaseOperationsActivationLease } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-stale-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lease = acquireOperationsActivationLease(root, 'p7-activation-20261012-001', { processId: 910, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-owner-0010' });
  assert.throws(() => releaseOperationsActivationLease({ ...lease, leaseId: 'lease-other-0011' }), /OPERATIONS_ACTIVATION_LEASE_OWNERSHIP_MISMATCH/);
  assert.equal(fs.existsSync(lease.path), true);
  assert.throws(() => acquireOperationsActivationLease(root, 'p7-activation-20261012-001', { processId: 912, checkedAt: '2026-10-13T01:00:00.000Z', leaseId: 'lease-later-0012' }), /OPERATIONS_ACTIVATION_LEASE_HELD/);
  assert.equal(fs.existsSync(lease.path), true); releaseOperationsActivationLease(lease);
});

test('장기 WAIT는 100회 이후에도 정렬 가능한 4자리 receipt 이름을 사용한다', async (t) => {
  const { OPERATIONS_ACTIVATION_STEPS, buildOperationsActivationReceipt, writeOperationsActivationReceiptOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-long-wait-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = buildOperationsActivationReceipt({ approval: await approval(), step: OPERATIONS_ACTIVATION_STEPS[0], attempt: 100, result: { exitCode: 0, summary: { status: 'PASS_SLO_SAMPLE_APPENDED' }, stdout: '', stderr: '' }, checkedAt: '2026-10-12T01:00:00.000Z' });
  const output = writeOperationsActivationReceiptOnce(root, value, { processId: 920 });
  assert.equal(path.basename(output), '01-slo-collect-attempt-0100.json');
});
