const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-cutover-process-runner.mjs');
const adapterModulePromise = import('../../src/operations/production-cutover-gate-adapters.mjs');

test('cutover child 환경은 step별 allowlist만 전달하고 관련 없는 Secret을 제거한다', async () => {
  const { buildCutoverStepChildEnvironment } = await modulePromise;
  const { CUTOVER_GATE_ADAPTER_PLAN, CUTOVER_ROUTE_DISABLE_ADAPTER, CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER } = await adapterModulePromise;
  const steps = [
    ...Object.entries(CUTOVER_GATE_ADAPTER_PLAN).flatMap(([gate, entries]) => entries.map((step) => ({ gate, ...step }))),
    { gate: 'route_disable', ...CUTOVER_ROUTE_DISABLE_ADAPTER },
    { gate: 'ingress_orphan_recovery', ...CUTOVER_INGRESS_ORPHAN_RECOVERY_ADAPTER }
  ];
  const sourceEnvironment = {
    Path: 'C:\\Windows\\System32', SYSTEMROOT: 'C:\\Windows', TEMP: 'C:\\Temp',
    MIGRATION_DATABASE_URL: 'postgres://reference-only', DATABASE_URL: 'postgres://fallback-reference', DB_MIGRATION_HISTORY_MODE: 'application',
    CLOUDFLARE_PRODUCTION_DNS_API_TOKEN_FILE: 'D:\\secrets\\cloudflare.token',
    PRODUCTION_INGRESS_CONFIRMATION: 'confirmed', PRODUCTION_ROUTE_DISABLE_CONFIRMATION: 'confirmed',
    PRODUCTION_UAT_ACTOR_APPROVAL_FILE: 'D:\\secrets\\approval.json',
    PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE: 'D:\\secrets\\admin.json', PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE: 'D:\\secrets\\manager.json', PRODUCTION_UAT_USER_CREDENTIAL_FILE: 'D:\\secrets\\user.json',
    PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION: 'confirmed', PRODUCTION_PUBLIC_ROLE_SMOKE_CONFIRMATION: 'confirmed', PRODUCTION_UAT_WRITE_CONFIRMATION: 'confirmed',
    PRODUCTION_PUBLIC_NONFUNCTIONAL_CONFIRMATION: 'confirmed', PRODUCTION_PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION: 'confirmed',
    PRODUCTION_UAT_ADMIN_RESULT_FILE: 'D:\\results\\admin.json', PRODUCTION_UAT_MANAGER_RESULT_FILE: 'D:\\results\\manager.json', PRODUCTION_UAT_USER_RESULT_FILE: 'D:\\results\\user.json',
    PRODUCTION_BUSINESS_SIGNOFF_FILE: 'D:\\signoff\\business.json', PRODUCTION_SECURITY_SIGNOFF_FILE: 'D:\\signoff\\security.json', PRODUCTION_OPERATIONS_SIGNOFF_FILE: 'D:\\signoff\\operations.json',
    PRODUCTION_INGRESS_ORPHAN_RECOVERY_CONFIRMATION: 'confirmed',
    GITHUB_TOKEN: 'must-not-pass', NODE_OPTIONS: '--require attacker.js', UNRELATED_SECRET: 'must-not-pass'
  };
  for (const step of steps) {
    const childEnvironment = buildCutoverStepChildEnvironment(step, sourceEnvironment);
    assert.equal(childEnvironment.GITHUB_TOKEN, undefined, step.id);
    assert.equal(childEnvironment.NODE_OPTIONS, undefined, step.id);
    assert.equal(childEnvironment.UNRELATED_SECRET, undefined, step.id);
    assert.equal(childEnvironment.PATH, 'C:\\Windows\\System32', step.id);
    assert.deepEqual(
      Object.keys(childEnvironment).sort(),
      ['PATH', 'SYSTEMROOT', 'TEMP', ...step.environment].sort(),
      step.id
    );
  }
});

test('process runner는 canonical step 환경만 spawn에 전달하고 변조 step은 실행 전에 거부한다', async () => {
  const { createProcessStepRunner } = await modulePromise;
  const { CUTOVER_GATE_ADAPTER_PLAN } = await adapterModulePromise;
  const step = { gate: 'health_readiness', ...CUTOVER_GATE_ADAPTER_PLAN.health_readiness[0] };
  const calls = [];
  const run = createProcessStepRunner({
    sourceEnvironment: { PATH: 'safe', PRODUCTION_INGRESS_CONFIRMATION: 'yes', UNRELATED_SECRET: 'no' },
    writeReceipt: async () => 'receipt.json',
    spawnStep: async (input) => { calls.push(input); return { exitCode: 0, stdout: '{"status":"PASS_INGRESS_PUBLISHED_READY_FOR_TLS_PROBE"}', stderr: '' }; }
  });
  await run(step);
  assert.deepEqual(calls[0].environment, { PATH: 'safe', PRODUCTION_INGRESS_CONFIRMATION: 'yes' });
  await assert.rejects(() => run({ ...step, script: 'scripts/attacker.mjs' }), /CUTOVER_CHILD_STEP_CONTRACT_INVALID/);
  assert.equal(calls.length, 1);
});

test('process runner는 step bundle이 실행 전후 바뀌면 receipt 성공을 만들지 않는다', async () => {
  const { createProcessStepRunner } = await modulePromise;
  const { CUTOVER_GATE_ADAPTER_PLAN } = await adapterModulePromise;
  const step = { gate: 'health_readiness', ...CUTOVER_GATE_ADAPTER_PLAN.health_readiness[0] };
  const expected = 'a'.repeat(64); let current = expected; let receiptCount = 0; let spawnCount = 0;
  const run = createProcessStepRunner({
    expectedStepBundleSha256: { 'health_readiness:ingress-publication': expected },
    inspectStepBundle: () => current,
    writeReceipt: async () => { receiptCount += 1; return 'receipt.json'; },
    spawnStep: async () => { spawnCount += 1; current = 'b'.repeat(64); return { exitCode: 0, stdout: '{"status":"PASS_INGRESS_PUBLISHED_READY_FOR_TLS_PROBE"}', stderr: '' }; }
  });
  await assert.rejects(() => run(step), /CUTOVER_CHILD_BUNDLE_CHANGED/);
  assert.equal(spawnCount, 1);
  assert.equal(receiptCount, 0);

  current = 'c'.repeat(64); spawnCount = 0;
  await assert.rejects(() => run(step), /CUTOVER_CHILD_BUNDLE_CHANGED/);
  assert.equal(spawnCount, 0);
});

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

test('receipt는 bundle SHA만 남기고 stdout stderr Secret을 기록하지 않으며 기존 파일을 덮어쓰지 않는다', async () => {
  const { createProcessStepRunner, createRuntimeReceiptWriter } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-receipt-'));
  try {
    const clock = () => new Date('2026-09-11T11:00:00.000Z');
    const writeReceipt = createRuntimeReceiptWriter({ root, clock, runId: '11111111-1111-4111-8111-111111111111', cutoverBundleSha256: 'a'.repeat(64) });
    const run = createProcessStepRunner({ writeReceipt, spawnStep: async () => ({ exitCode: 0, stdout: '{"status":"PASS"}', stderr: 'SECRET_VALUE' }) });
    const outcome = await run({ gate: 'artifact', id: 'cutover-preflight', script: 'scripts/production-cutover-preflight.mjs', args: [], acceptedStatuses: ['READY_FOR_CHANGE_WINDOW_EXECUTION', 'READY_FOR_CUTOVER_SIGNOFF'], environment: [] });
    const raw = fs.readFileSync(outcome.evidenceRef, 'utf8');
    assert.equal(outcome.status, 'PASS');
    assert.equal(JSON.parse(raw).runId, '11111111-1111-4111-8111-111111111111');
    assert.equal(JSON.parse(raw).cutoverBundleSha256, 'a'.repeat(64));
    assert.doesNotMatch(raw, /stdout|stderr|SECRET_VALUE/);
    const secondWriter = createRuntimeReceiptWriter({ root, clock, runId: '11111111-1111-4111-8111-111111111111', cutoverBundleSha256: 'a'.repeat(64) });
    await assert.rejects(() => secondWriter({ kind: 'step', gate: 'artifact', step: 'cutover-preflight', status: 'PASS', exitCode: 0 }), /CUTOVER_RECEIPT_ALREADY_EXISTS/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('receipt 게시 경쟁 시 선점 bytes를 보존하고 임시파일을 제거한다', async (t) => {
  const { createRuntimeReceiptWriter } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-receipt-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(sourcePath, outputPath) {
      fs.writeFileSync(outputPath, '{"owner":"competing-run"}\n', { flag: 'wx' });
      return realLink(sourcePath, outputPath);
    }
  };
  const writer = createRuntimeReceiptWriter({
    root, io, processId: 1600,
    clock: () => new Date('2026-09-11T11:00:00.000Z'),
    runId: '11111111-1111-4111-8111-111111111111'
  });
  await assert.rejects(
    () => writer({ kind: 'step', gate: 'artifact', step: 'preflight', status: 'PASS', exitCode: 0 }),
    /CUTOVER_RECEIPT_ALREADY_EXISTS/
  );
  const files = fs.readdirSync(root);
  assert.equal(files.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, files[0]), 'utf8')), { owner: 'competing-run' });
  assert.equal(files.some((name) => name.endsWith('.tmp')), false);
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
