const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-activation-orchestrator.mjs');

function p6() { return { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P6_CUTOVER_ACTUAL', status: 'PASS', productionGo: true, targetUrl: 'https://inventory.safe-link.co.kr', releaseSha: 'a'.repeat(40), approvals: { operations: { status: 'APPROVED', signedBy: 'identity://operations-owner', signedAt: '2026-09-11T12:30:00.000Z', evidence: `production operations approval sha256:${'e'.repeat(64)}` } } }; }
async function approval(overrides = {}) {
  const { OPERATIONS_ACTIVATION_ACTIONS, OPERATIONS_ACTIVATION_STEPS } = await modulePromise;
  return { schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', approved: true, targetUrl: 'https://inventory.safe-link.co.kr', runId: 'p7-activation-20261012-001', releaseSha: 'a'.repeat(40), activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64), p6OperationsApprovalSha256: 'e'.repeat(64), approvalReceiptSha256: 'd'.repeat(64), authorizedByRef: 'identity://operations-owner', approvedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z', allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id), authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS], ...overrides };
}
async function activationApprovalReceipt(overrides = {}) {
  const { OPERATIONS_ACTIVATION_ACTIONS, OPERATIONS_ACTIVATION_STEPS } = await modulePromise;
  return { schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_ACTIVATION_APPROVAL_RECEIPT', targetUrl: 'https://inventory.safe-link.co.kr', decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: 'identity://operations-owner', signedAt: '2026-10-12T00:00:00.000Z', receiptId: 'p7-activation-approval-receipt-001', runId: 'p7-activation-20261012-001', releaseSha: 'a'.repeat(40), activationBundleSha256: 'c'.repeat(64), p6CutoverEvidenceSha256: 'f'.repeat(64), p6OperationsApprovalSha256: 'e'.repeat(64), allowedSteps: OPERATIONS_ACTIVATION_STEPS.map((step) => step.id), authorizedActions: [...OPERATIONS_ACTIVATION_ACTIONS], mfaVerified: true, blockingExceptionCount: 0, ...overrides };
}
async function receipt(stepId, outcome = 'PASS', overrides = {}) {
  const { OPERATIONS_ACTIVATION_STEPS, operationsActivationApprovalSha256 } = await modulePromise; const index = OPERATIONS_ACTIVATION_STEPS.findIndex((step) => step.id === stepId); const step = OPERATIONS_ACTIVATION_STEPS[index];
  const activationApproval = await approval();
  return { schemaVersion: 2, environment: 'production', activationState: 'actual', runId: activationApproval.runId, releaseSha: activationApproval.releaseSha, approvalSha256: operationsActivationApprovalSha256(activationApproval), stepId, sequence: index + 1, attempt: 1, outcome, status: outcome === 'PASS' ? step.pass[0] : outcome === 'WAIT' ? 'READY_WAIT_INPUT' : 'FAIL_TEST', exitCode: outcome === 'FAIL' ? 1 : 0, checkedAt: '2026-10-12T01:00:00.000Z', command: { executable: 'node', script: step.script, args: [...step.args] }, stdoutSha256: 'a'.repeat(64), stderrSha256: 'b'.repeat(64), secretValuesRecorded: false, ...overrides };
}

test('P6 actual·P7·Production GO 전에는 child·approval read·receipt write를 열지 않는다', async () => {
  const { evaluateOperationsActivationGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsActivationGate(value); assert.equal(result.childProcessAllowed, false); assert.equal(result.approvalReadAllowed, false); assert.equal(result.receiptWriteAllowed, false);
  }
});

test('P6 evidence·approval·root·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsActivationGate } = await modulePromise; const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.deepEqual(evaluateOperationsActivationGate(active).missing, ['p6CutoverEvidence', 'activationApproval', 'activationApprovalReceipt', 'receiptRoot']);
  const ready = { ...active, p6EvidencePresent: true, approvalPresent: true, approvalReceiptPresent: true, receiptRootPresent: true };
  assert.equal(evaluateOperationsActivationGate(ready).status, 'PASS_OPERATIONS_ACTIVATION_DRY_RUN_READY');
  assert.equal(evaluateOperationsActivationGate({ ...ready, execute: true }).status, 'READY_WAIT_OPERATIONS_ACTIVATION_CONFIRMATION');
  assert.equal(evaluateOperationsActivationGate({ ...ready, execute: true, confirmed: true }).childProcessAllowed, true);
});

test('approval은 exact 19 steps·10 actions·P6 release·identity·유효기간을 요구한다', async () => {
  const { validateOperationsActivationApproval } = await modulePromise;
  const receipt = await activationApprovalReceipt();
  assert.equal(validateOperationsActivationApproval(await approval(), { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), approvalReceipt: receipt, approvalReceiptSha256: 'd'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' }).approved, true);
  const altered = await approval({ releaseSha: 'b'.repeat(40), authorizedByRef: 'person', expiresAt: '2027-01-01T00:00:00.000Z', allowedSteps: [], authorizedActions: [] });
  assert.throws(() => validateOperationsActivationApproval(altered, { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), approvalReceipt: receipt, approvalReceiptSha256: 'd'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' }), /releaseSha.*authorizedByRef.*approvalWindow.*allowedSteps.*authorizedActions/);
});

test('activation approval receipt는 P6 운영 서명·MFA·exact 실행 계약을 증명한다', async () => {
  const { validateOperationsActivationApprovalReceipt } = await modulePromise;
  assert.equal(validateOperationsActivationApprovalReceipt(await activationApprovalReceipt(), { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' }).decision, 'APPROVED');
  const altered = await activationApprovalReceipt({ mfaVerified: false, signedByRef: 'identity://other-owner', p6OperationsApprovalSha256: '0'.repeat(64), allowedSteps: [] });
  assert.throws(() => validateOperationsActivationApprovalReceipt(altered, { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' }), /signedByRef.*p6OperationsApprovalSha256.*allowedSteps.*mfaVerified/);
});

test('activation manifest는 exact approval receipt SHA와 동일 승인 내용을 요구한다', async () => {
  const { validateOperationsActivationApproval } = await modulePromise; const receipt = await activationApprovalReceipt();
  const altered = await approval({ approvalReceiptSha256: '0'.repeat(64), authorizedByRef: 'identity://other-owner' });
  assert.throws(() => validateOperationsActivationApproval(altered, { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), activationBundleSha256: 'c'.repeat(64), approvalReceipt: receipt, approvalReceiptSha256: 'd'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' }), /approvalReceiptSha256.*approvalReceiptContent/);
});

test('approval은 현재 19단계 실행 번들의 exact SHA-256을 요구한다', async () => {
  const { validateOperationsActivationApproval } = await modulePromise; const value = await approval(); const receipt = await activationApprovalReceipt();
  const options = { p6Document: p6(), p6EvidenceSha256: 'f'.repeat(64), approvalReceipt: receipt, approvalReceiptSha256: 'd'.repeat(64), checkedAt: '2026-10-12T01:00:00.000Z' };
  assert.throws(() => validateOperationsActivationApproval(value, { ...options, activationBundleSha256: 'd'.repeat(64) }), /activationBundleSha256/);
  assert.throws(() => validateOperationsActivationApproval(value, options), /activationBundleSha256/);
});

test('실행 번들 SHA-256은 exact 파일 경로와 byte 변경을 구분한다', async (t) => {
  const { OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS, computeOperationsActivationBundleSha256, resolveOperationsActivationBundleFiles } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-bundle-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [index, relativePath] of OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS.entries()) {
    const output = path.join(root, ...relativePath.split('/')); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `file-${index}\n`, 'utf8');
  }
  const dependency = path.join(root, 'src', 'operations', 'bundle-dependency.mjs'); fs.writeFileSync(dependency, 'export const marker = 1;\n', 'utf8');
  fs.appendFileSync(path.join(root, ...OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS[0].split('/')), "import '../src/operations/bundle-dependency.mjs';\n", 'utf8');
  const original = computeOperationsActivationBundleSha256(root);
  assert.match(original, /^[a-f0-9]{64}$/); assert.equal(computeOperationsActivationBundleSha256(root), original);
  assert.equal(resolveOperationsActivationBundleFiles(root).includes('src/operations/bundle-dependency.mjs'), true);
  fs.appendFileSync(dependency, 'changed\n', 'utf8');
  assert.notEqual(computeOperationsActivationBundleSha256(root), original);
});

test('approval digest는 JSON key 순서와 무관하고 승인 내용 변경을 구분한다', async () => {
  const { operationsActivationApprovalSha256 } = await modulePromise;
  const original = await approval(); const reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(operationsActivationApprovalSha256(original), operationsActivationApprovalSha256(reordered));
  assert.notEqual(operationsActivationApprovalSha256(original), operationsActivationApprovalSha256({ ...original, approvedAt: '2026-10-12T00:01:00.000Z' }));
});

test('19단계 child는 각 단계에 필요한 환경변수만 명시한다', async () => {
  const { OPERATIONS_ACTIVATION_STEPS } = await modulePromise;
  const expected = {
    'slo-collect': ['P7_SLO_LEDGER_FILE', 'P7_SLO_MEASUREMENT_INPUT_FILE', 'P7_SLO_COLLECTION_CONFIRMATION'],
    'slo-compile': ['P7_SLO_MEASUREMENT_INPUT_FILE', 'P7_SLO_EVIDENCE_OUTPUT_FILE', 'P7_SLO_EVIDENCE_CONFIRMATION'],
    'alert-deliver': ['P7_ALERT_DELIVERY_PROVIDER_MANIFEST_FILE', 'P7_ALERT_DELIVERY_API_TOKEN_FILE', 'P7_ALERT_RECEIPT_INPUT_FILE', 'P7_ALERT_DELIVERY_CONFIRMATION'],
    'alert-compile': ['P7_ALERT_RECEIPT_INPUT_FILE', 'P7_ALERTING_EVIDENCE_OUTPUT_FILE', 'P7_ALERTING_EVIDENCE_CONFIRMATION'],
    'backup-restore-run': ['P7_OFFSITE_BACKUP_ROOT', 'P7_OFFSITE_STORAGE_ATTESTATION_FILE', 'P7_BACKUP_RESTORE_DRILL_INPUT_FILE', 'P7_BACKUP_RESTORE_RUNNER_CONFIRMATION'],
    'backup-restore-compile': ['P7_BACKUP_RESTORE_DRILL_INPUT_FILE', 'P7_BACKUP_EVIDENCE_OUTPUT_FILE', 'P7_RESTORE_EVIDENCE_OUTPUT_FILE', 'P7_BACKUP_RESTORE_EVIDENCE_CONFIRMATION'],
    'certificate-observe': ['P7_CERTIFICATE_OBSERVATION_INPUT_FILE', 'P7_CERTIFICATE_RENEWAL_OWNER_REF', 'P7_CERTIFICATE_PROVIDER_REF', 'P7_CERTIFICATE_OBSERVATION_CONFIRMATION'],
    'certificate-compile': ['P7_CERTIFICATE_OBSERVATION_INPUT_FILE', 'P7_CERTIFICATE_EVIDENCE_OUTPUT_FILE', 'P7_CERTIFICATE_EVIDENCE_CONFIRMATION'],
    'oncall-drill': ['P7_ONCALL_DRILL_PROVIDER_MANIFEST_FILE', 'P7_ONCALL_DRILL_API_TOKEN_FILE', 'P7_ONCALL_HANDOVER_INPUT_FILE', 'P7_ONCALL_DRILL_CONFIRMATION'],
    'oncall-compile': ['P7_ONCALL_HANDOVER_INPUT_FILE', 'P7_ONCALL_EVIDENCE_OUTPUT_FILE', 'P7_ONCALL_EVIDENCE_CONFIRMATION'],
    'maintenance-run': ['P7_MAINTENANCE_EXECUTION_INPUT_FILE', 'P7_MAINTENANCE_OPERATOR_REF', 'P7_MAINTENANCE_SCHEDULE_REF', 'P7_MAINTENANCE_NEXT_SCHEDULED_AT', 'P7_MAINTENANCE_RUNNER_CONFIRMATION'],
    'maintenance-compile': ['P7_MAINTENANCE_EXECUTION_INPUT_FILE', 'P7_MAINTENANCE_EVIDENCE_OUTPUT_FILE', 'P7_MAINTENANCE_EVIDENCE_CONFIRMATION'],
    'improvement-collect': ['P7_GITHUB_API_TOKEN_FILE', 'P7_IMPROVEMENT_QUEUE_TRIAGE_ATTESTATION_FILE', 'P7_IMPROVEMENT_QUEUE_INPUT_FILE', 'P7_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION'],
    'improvement-compile': ['P7_IMPROVEMENT_QUEUE_INPUT_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_OUTPUT_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_CONFIRMATION'],
    'signoff-input-assemble': ['P7_P6_CUTOVER_EVIDENCE_FILE', 'P7_OPERATIONS_OWNER_APPROVAL_RECEIPT_FILE', 'P7_OPERATIONS_SIGNOFF_INPUT_FILE', 'P7_SLO_EVIDENCE_FILE', 'P7_ALERTING_EVIDENCE_FILE', 'P7_BACKUP_EVIDENCE_FILE', 'P7_RESTORE_EVIDENCE_FILE', 'P7_CERTIFICATE_EVIDENCE_FILE', 'P7_ONCALL_EVIDENCE_FILE', 'P7_MAINTENANCE_EVIDENCE_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE', 'P7_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION'],
    'signoff-compile': ['P7_OPERATIONS_SIGNOFF_INPUT_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_OUTPUT_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_CONFIRMATION'],
    'handover-assemble': ['P7_P6_CUTOVER_EVIDENCE_FILE', 'P7_SLO_EVIDENCE_FILE', 'P7_ALERTING_EVIDENCE_FILE', 'P7_BACKUP_EVIDENCE_FILE', 'P7_RESTORE_EVIDENCE_FILE', 'P7_CERTIFICATE_EVIDENCE_FILE', 'P7_ONCALL_EVIDENCE_FILE', 'P7_MAINTENANCE_EVIDENCE_FILE', 'P7_IMPROVEMENT_QUEUE_EVIDENCE_FILE', 'P7_OPERATIONS_SIGNOFF_EVIDENCE_FILE', 'P7_HANDOVER_MANIFEST_OUTPUT_FILE', 'P7_HANDOVER_ASSEMBLY_CONFIRMATION'],
    'handover-finalize': ['OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE'],
    'phase-complete': ['OPERATIONS_HANDOVER_ACTUAL_EVIDENCE_FILE', 'P7_COMPLETION_CONFIRMATION']
  };
  assert.deepEqual(Object.fromEntries(OPERATIONS_ACTIVATION_STEPS.map((step) => [step.id, step.environment])), expected);
});

test('child 환경은 안전한 runtime과 현재 단계 allowlist만 전달한다', async () => {
  const { OPERATIONS_ACTIVATION_STEPS, buildOperationsActivationChildEnvironment } = await modulePromise;
  const step = OPERATIONS_ACTIVATION_STEPS.find((item) => item.id === 'alert-deliver');
  const output = buildOperationsActivationChildEnvironment(step, {
    Path: 'C:\\Windows\\System32', TEMP: 'C:\\Temp',
    P7_ALERT_DELIVERY_PROVIDER_MANIFEST_FILE: 'D:\\runtime\\manifest.json',
    P7_ALERT_DELIVERY_API_TOKEN_FILE: 'D:\\runtime\\token', P7_ALERT_RECEIPT_INPUT_FILE: 'D:\\runtime\\receipt.json',
    P7_ALERT_DELIVERY_CONFIRMATION: 'confirmed', GITHUB_TOKEN: 'x', NODE_OPTIONS: '--x', UNRELATED_SECRET: 'x'
  });
  assert.deepEqual(Object.keys(output).sort(), ['P7_ALERT_DELIVERY_API_TOKEN_FILE', 'P7_ALERT_DELIVERY_CONFIRMATION', 'P7_ALERT_DELIVERY_PROVIDER_MANIFEST_FILE', 'P7_ALERT_RECEIPT_INPUT_FILE', 'Path', 'TEMP'].sort());
  assert.equal(output.GITHUB_TOKEN, undefined); assert.equal(output.NODE_OPTIONS, undefined); assert.equal(output.UNRELATED_SECRET, undefined);
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
  const activationApproval = await approval();
  const first = acquireOperationsActivationLease(root, activationApproval, { processId: 901, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-first-0001' });
  assert.equal(fs.existsSync(first.path), true);
  assert.throws(() => acquireOperationsActivationLease(root, activationApproval, { processId: 902, checkedAt: '2026-10-12T01:00:01.000Z', leaseId: 'lease-second-0002' }), /OPERATIONS_ACTIVATION_LEASE_HELD/);
  assert.equal(releaseOperationsActivationLease(first), true); assert.equal(fs.existsSync(first.path), false);
  const resumed = acquireOperationsActivationLease(root, activationApproval, { processId: 903, checkedAt: '2026-10-12T01:00:02.000Z', leaseId: 'lease-resumed-0003' });
  assert.equal(releaseOperationsActivationLease(resumed), true);
});

test('receipt root는 최초 run에 영속 귀속되어 다른 run의 재사용을 차단한다', async (t) => {
  const { acquireOperationsActivationLease, releaseOperationsActivationLease } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-root-owner-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = acquireOperationsActivationLease(root, await approval(), { processId: 905, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-owner-run-0001' });
  assert.equal(releaseOperationsActivationLease(first), true);
  const differentRunApproval = await approval({ runId: 'p7-activation-20261012-002' });
  assert.throws(() => acquireOperationsActivationLease(root, differentRunApproval, { processId: 906, checkedAt: '2026-10-12T01:00:01.000Z', leaseId: 'lease-owner-run-0002' }), /OPERATIONS_ACTIVATION_RECEIPT_ROOT_RUN_MISMATCH/);
});

test('동일 run이라도 approval 또는 release가 바뀌면 receipt root 재사용을 차단한다', async (t) => {
  const { acquireOperationsActivationLease, releaseOperationsActivationLease } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-approval-owner-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const firstApproval = await approval();
  const first = acquireOperationsActivationLease(root, firstApproval, { processId: 908, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-approval-0001' });
  assert.equal(releaseOperationsActivationLease(first), true);
  const changedApproval = await approval({ releaseSha: 'b'.repeat(40), approvedAt: '2026-10-12T00:01:00.000Z' });
  assert.throws(() => acquireOperationsActivationLease(root, changedApproval, { processId: 909, checkedAt: '2026-10-12T01:00:01.000Z', leaseId: 'lease-approval-0002' }), /OPERATIONS_ACTIVATION_RECEIPT_ROOT_APPROVAL_MISMATCH/);
});

test('이전 approval·release receipt를 같은 run의 새 승인 흐름에 재사용하지 않는다', async () => {
  const { selectNextOperationsActivationStep } = await modulePromise;
  const oldReceipt = await receipt('slo-collect');
  const changedApproval = await approval({ releaseSha: 'b'.repeat(40), approvedAt: '2026-10-12T00:01:00.000Z' });
  assert.throws(() => selectNextOperationsActivationStep([oldReceipt], { approval: changedApproval }), /OPERATIONS_ACTIVATION_RECEIPT_INVALID/);
});

test('receipt 최종화 경쟁에서도 기존 증거를 덮어쓰지 않는다', async (t) => {
  const { OPERATIONS_ACTIVATION_STEPS, buildOperationsActivationReceipt, writeOperationsActivationReceiptOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-no-overwrite-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = buildOperationsActivationReceipt({ approval: await approval(), step: OPERATIONS_ACTIVATION_STEPS[0], attempt: 1, result: { exitCode: 0, summary: { status: 'PASS_P7_SLO_30_DAY_EXPORT_CREATED' }, stdout: '', stderr: '' }, checkedAt: '2026-10-12T01:00:00.000Z' });
  const output = path.join(root, '01-slo-collect-attempt-0001.json');
  fs.writeFileSync(output, '{"sentinel":true}\n', 'utf8');
  const originalExistsSync = fs.existsSync; let bypassed = false;
  fs.existsSync = (candidate) => {
    if (!bypassed && path.resolve(candidate) === path.resolve(output)) { bypassed = true; return false; }
    return originalExistsSync(candidate);
  };
  try { assert.throws(() => writeOperationsActivationReceiptOnce(root, value, { processId: 907 }), /RECEIPT_ALREADY_EXISTS/); }
  finally { fs.existsSync = originalExistsSync; }
  assert.equal(fs.readFileSync(output, 'utf8'), '{"sentinel":true}\n');
});

test('다른 owner의 release 시도와 crash stale lease는 자동 삭제하지 않는다', async (t) => {
  const { acquireOperationsActivationLease, releaseOperationsActivationLease } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-stale-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const activationApproval = await approval();
  const lease = acquireOperationsActivationLease(root, activationApproval, { processId: 910, checkedAt: '2026-10-12T01:00:00.000Z', leaseId: 'lease-owner-0010' });
  assert.throws(() => releaseOperationsActivationLease({ ...lease, leaseId: 'lease-other-0011' }), /OPERATIONS_ACTIVATION_LEASE_OWNERSHIP_MISMATCH/);
  assert.equal(fs.existsSync(lease.path), true);
  assert.throws(() => acquireOperationsActivationLease(root, activationApproval, { processId: 912, checkedAt: '2026-10-13T01:00:00.000Z', leaseId: 'lease-later-0012' }), /OPERATIONS_ACTIVATION_LEASE_HELD/);
  assert.equal(fs.existsSync(lease.path), true); releaseOperationsActivationLease(lease);
});

test('장기 WAIT는 100회 이후에도 정렬 가능한 4자리 receipt 이름을 사용한다', async (t) => {
  const { OPERATIONS_ACTIVATION_STEPS, buildOperationsActivationReceipt, writeOperationsActivationReceiptOnce } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-long-wait-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const value = buildOperationsActivationReceipt({ approval: await approval(), step: OPERATIONS_ACTIVATION_STEPS[0], attempt: 100, result: { exitCode: 0, summary: { status: 'PASS_SLO_SAMPLE_APPENDED' }, stdout: '', stderr: '' }, checkedAt: '2026-10-12T01:00:00.000Z' });
  const output = writeOperationsActivationReceiptOnce(root, value, { processId: 920 });
  assert.equal(path.basename(output), '01-slo-collect-attempt-0100.json');
});
