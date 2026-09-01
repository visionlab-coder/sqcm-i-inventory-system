const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-cutover-process-runner.mjs');

test('마지막 JSON 상태를 추출하고 migration exit 0을 명시 PASS로 정규화한다', async () => {
  const { extractLastJsonObject, normalizeStepOutcome } = await modulePromise;
  assert.deepEqual(extractLastJsonObject('noise {"status":"OLD"}\n{"status":"PASS","nested":{"x":1}} tail'), { status: 'PASS', nested: { x: 1 } });
  assert.deepEqual(normalizeStepOutcome({ exitCode: 0, stdout: 'plain', step: { id: 'migration-verify' } }), { exitCode: 0, status: 'PASS_EXIT_ZERO' });
  assert.equal(normalizeStepOutcome({ exitCode: 0, stdout: 'plain', step: { id: 'x' } }).status, 'FAIL_STATUS_NOT_RECORDED');
});

test('role smoke summary는 허용된 상태만 남기고 credential·session 값을 제거한다', async () => {
  const { buildStepReceiptSummary } = await modulePromise;
  const role = { passwordStatus: 202, mfaRequired: true, invalidMfaStatus: 401, mfaStatus: 200, actualRole: 'ADMIN', dashboard: 200, cost: 200, admin: 200, logoutStatus: 204, email: 'secret@example.com', password: 'SECRET', cookie: 'SESSION' };
  const summary = buildStepReceiptSummary({ id: 'role-core-smoke' }, { status: 'PASS_PRODUCTION_ROLE_CORE_SMOKE', targetKind: 'production-https', actualRoleCoreSmoke: 'PASS', results: { ADMIN: role, MANAGER: { ...role, actualRole: 'MANAGER', admin: 403 }, USER: { ...role, actualRole: 'USER', cost: 403, admin: 403 }, anonymousItems: 401 } });
  const raw = JSON.stringify(summary);
  assert.equal(summary.evidenceType, 'P6_ROLE_CORE_SMOKE_SUMMARY');
  assert.doesNotMatch(raw, /secret@example|SECRET|SESSION|"email"|"password"|"cookie"/i);
});

test('receipt는 stdout stderr Secret을 기록하지 않고 기존 파일을 덮어쓰지 않는다', async () => {
  const { createProcessStepRunner, createRuntimeReceiptWriter } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-receipt-'));
  try {
    const clock = () => new Date('2026-09-11T11:00:00.000Z');
    const writeReceipt = createRuntimeReceiptWriter({ root, clock, runId: '11111111-1111-4111-8111-111111111111' });
    const run = createProcessStepRunner({ writeReceipt, spawnStep: async () => ({ exitCode: 0, stdout: '{"status":"PASS"}', stderr: 'SECRET_VALUE' }) });
    const outcome = await run({ gate: 'artifact', id: 'preflight', script: 'x', args: [] });
    const raw = fs.readFileSync(outcome.evidenceRef, 'utf8');
    assert.equal(outcome.status, 'PASS');
    assert.equal(JSON.parse(raw).runId, '11111111-1111-4111-8111-111111111111');
    assert.doesNotMatch(raw, /stdout|stderr|SECRET_VALUE/);
    const secondWriter = createRuntimeReceiptWriter({ root, clock, runId: '11111111-1111-4111-8111-111111111111' });
    await assert.rejects(() => secondWriter({ kind: 'step', gate: 'artifact', step: 'preflight', status: 'PASS', exitCode: 0 }), /EEXIST/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('동일 run 재개 writer는 검증된 sequence 다음 번호부터 기록한다', async () => {
  const { createRuntimeReceiptWriter } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-resume-sequence-'));
  try {
    const writer = createRuntimeReceiptWriter({ root, clock: () => new Date('2026-09-11T12:00:00.000Z'), runId: '11111111-1111-4111-8111-111111111111', startSequence: 24 });
    const file = await writer({ kind: 'step', gate: 'uat_signoff', step: 'signoff-preflight', status: 'READY_FOR_UAT_SIGNOFF_VALIDATION' });
    assert.match(path.basename(file), /-0025-step-uat_signoff-signoff-preflight\.json$/);
    assert.throws(() => createRuntimeReceiptWriter({ root, startSequence: -1 }), /START_SEQUENCE_INVALID/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('symlink receipt root는 거부한다', async (t) => {
  if (process.platform === 'win32') return t.skip('Windows symlink privilege is environment-dependent');
  const { createRuntimeReceiptWriter } = await modulePromise;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-link-'));
  const target = path.join(base, 'target'); fs.mkdirSync(target);
  const link = path.join(base, 'link'); fs.symlinkSync(target, link, 'dir');
  try { await assert.rejects(() => createRuntimeReceiptWriter({ root: link })({ gate: 'x', step: 'y', status: 'PASS' }), /NOT_PHYSICAL/); }
  finally { fs.rmSync(base, { recursive: true }); }
});
