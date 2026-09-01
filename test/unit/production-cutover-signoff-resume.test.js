const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-cutover-signoff-resume.mjs');
const adapterPromise = import('../../src/operations/production-cutover-gate-adapters.mjs');

const runId = '11111111-1111-4111-8111-111111111111';
const releaseSha = 'a'.repeat(40);
const checkedAt = '2026-09-11T12:00:00.000Z';
const gateNames = ['artifact','backup_restore','migration_review','provider_preflight','health_readiness','core_smoke','csrf_idempotency','logs_5xx','nonfunctional','operational_health','rollback'];
const results = () => gateNames.map((gate, index) => ({ gate, result: 'PASS', evidenceRef: `${index + 1}-${gate}.json`, evidenceSha256: String(index + 1).padStart(64, '0') }));

test('Gate 1~11 PASS만 같은 run signoff pause checkpoint가 된다', async () => {
  const { createSignoffPauseCheckpoint } = await modulePromise;
  const result = createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults: results() });
  assert.equal(result.status, 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF');
  assert.equal(result.checkpoint.completedGates.length, 11);
  assert.equal(result.productionGo, false);
});

test('누락·FAIL·경로 evidence와 변경창 밖 checkpoint를 거부한다', async () => {
  const { createSignoffPauseCheckpoint } = await modulePromise;
  for (const gateResults of [results().slice(0, 10), results().map((item, index) => index === 5 ? { ...item, result: 'FAIL' } : item), results().map((item, index) => index === 2 ? { ...item, evidenceRef: '../bad.json' } : item)]) {
    assert.equal(createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults }).status, 'FAIL_SIGNOFF_PAUSE_CHECKPOINT');
  }
  assert.equal(createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt: '2026-09-01T00:00:00.000Z', gateResults: results() }).status, 'FAIL_SIGNOFF_PAUSE_CHECKPOINT');
});

test('역할 3건·서명 3건·exact 확인 뒤에만 Gate 12 재개를 허용한다', async () => {
  const { createSignoffPauseCheckpoint, evaluateSignoffResume, SIGNOFF_RESUME_CONFIRMATION } = await modulePromise;
  const checkpoint = createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults: results() }).checkpoint;
  const references = { ADMIN: true, MANAGER: true, USER: true, BUSINESS: true, SECURITY: true, OPERATIONS: true };
  const waiting = evaluateSignoffResume({ checkpoint, runId, releaseSha, checkedAt, roleResultReferences: {}, signoffReferences: {} });
  assert.equal(waiting.status, 'READY_WAIT_ACTUAL_ROLE_RESULTS_AND_SIGNOFF');
  const confirm = evaluateSignoffResume({ checkpoint, runId, releaseSha, checkedAt, roleResultReferences: references, signoffReferences: references });
  assert.equal(confirm.status, 'READY_WAIT_SIGNOFF_RESUME_CONFIRMATION');
  const ready = evaluateSignoffResume({ checkpoint, runId, releaseSha, checkedAt, confirmation: SIGNOFF_RESUME_CONFIRMATION, roleResultReferences: references, signoffReferences: references });
  assert.equal(ready.status, 'READY_FOR_SAME_RUN_UAT_SIGNOFF_RESUME');
  assert.equal(ready.resumeGate, 'uat_signoff');
});

test('교차 run·SHA와 cutoff 이후 재개는 route disable 필수로 차단한다', async () => {
  const { createSignoffPauseCheckpoint, evaluateSignoffResume } = await modulePromise;
  const checkpoint = createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults: results() }).checkpoint;
  for (const input of [
    { runId: '22222222-2222-4222-8222-222222222222', releaseSha, checkedAt },
    { runId, releaseSha: 'b'.repeat(40), checkedAt },
    { runId, releaseSha, checkedAt: '2026-09-11T13:01:00.000Z' }
  ]) {
    const result = evaluateSignoffResume({ checkpoint, ...input });
    assert.equal(result.status, 'FAIL_SIGNOFF_RESUME_CONTRACT');
    assert.equal(result.routeDisableRequired, true);
  }
});

test('합성 중단·재개 계약 리허설이 통과한다', async () => {
  const { runSignoffPauseResumeRehearsal } = await modulePromise;
  const result = runSignoffPauseResumeRehearsal();
  assert.equal(result.status, 'PASS_SIGNOFF_PAUSE_RESUME_CONTRACT_REHEARSAL');
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});

test('checkpoint는 물리 .checkpoint 파일에 한 번만 기록한다', async () => {
  const { createSignoffPauseCheckpoint, loadSignoffPauseCheckpoint, writeSignoffPauseCheckpoint } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-checkpoint-'));
  const output = path.join(root, 'run.checkpoint');
  try {
    const checkpoint = createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults: results() }).checkpoint;
    writeSignoffPauseCheckpoint(output, checkpoint);
    assert.equal(loadSignoffPauseCheckpoint(output).runId, runId);
    assert.throws(() => writeSignoffPauseCheckpoint(output, checkpoint), /EEXIST/);
    assert.throws(() => writeSignoffPauseCheckpoint(path.join(root, 'run.json'), checkpoint), /PATH_INVALID/);
    assert.throws(() => writeSignoffPauseCheckpoint(path.join(process.cwd(), 'run.checkpoint'), checkpoint), /MUST_BE_EXTERNAL/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('동일 run의 Gate 1~11·step 13개 receipt와 SHA를 물리 검증한다', async () => {
  const { CUTOVER_GATE_ADAPTER_PLAN } = await adapterPromise;
  const { createSignoffPauseCheckpoint, sha256PhysicalFile, validateSignoffResumeReceipts } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-receipts-'));
  const gateResults = [];
  let sequence = 0;
  try {
    for (const gate of gateNames) {
      const evidenceRefs = [];
      for (const step of CUTOVER_GATE_ADAPTER_PLAN[gate]) {
        const name = `${String(++sequence).padStart(4, '0')}-step-${gate}-${step.id}.json`;
        fs.writeFileSync(path.join(root, name), JSON.stringify({ schemaVersion: 1, runId, checkedAt, kind: 'step', gate, step: step.id, status: step.acceptedStatuses[0], exitCode: 0, evidenceRefs: [], productionGo: false }));
        evidenceRefs.push(name);
      }
      const name = `${String(++sequence).padStart(4, '0')}-gate-${gate}.json`;
      fs.writeFileSync(path.join(root, name), JSON.stringify({ schemaVersion: 1, runId, checkedAt, kind: 'gate', gate, step: 'summary', status: 'PASS', exitCode: 0, evidenceRefs, productionGo: false }));
      gateResults.push({ gate, result: 'PASS', evidenceRef: name, evidenceSha256: sha256PhysicalFile(path.join(root, name)) });
    }
    const checkpoint = createSignoffPauseCheckpoint({ runId, releaseSha, checkedAt, gateResults }).checkpoint;
    const pass = validateSignoffResumeReceipts({ root, checkpoint });
    assert.equal(pass.status, 'PASS_SIGNOFF_RESUME_RECEIPTS');
    assert.equal(pass.receiptCount, 24);
    const firstStep = fs.readdirSync(root).find((name) => name.includes('-step-'));
    fs.copyFileSync(path.join(root, firstStep), path.join(root, `duplicate-${firstStep}`));
    assert.equal(validateSignoffResumeReceipts({ root, checkpoint }).status, 'FAIL_SIGNOFF_RESUME_RECEIPTS');
    fs.rmSync(path.join(root, `duplicate-${firstStep}`));
    const value = JSON.parse(fs.readFileSync(path.join(root, firstStep), 'utf8'));
    fs.writeFileSync(path.join(root, firstStep), JSON.stringify({ ...value, status: 'READY_WAIT_TAMPERED' }));
    assert.equal(validateSignoffResumeReceipts({ root, checkpoint }).status, 'FAIL_SIGNOFF_RESUME_RECEIPTS');
  } finally { fs.rmSync(root, { recursive: true }); }
});
