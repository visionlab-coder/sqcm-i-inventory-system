const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const modulePromise = import('../../src/operations/production-cutover-actual-evidence.mjs');
const adapterPromise = import('../../src/operations/production-cutover-gate-adapters.mjs');

const runId = '22222222-2222-4222-8222-222222222222';
const releaseSha = 'a'.repeat(40);
const releaseTag = `sha-${releaseSha}`;
const checkedAt = '2026-09-11T12:00:00.000Z';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cutoverBundleSha256 = 'c'.repeat(64);

async function completeInput() {
  const { CUTOVER_GATE_ADAPTER_PLAN } = await adapterPromise;
  const receiptDocuments = [];
  let sequence = 0;
  for (const [gate, steps] of Object.entries(CUTOVER_GATE_ADAPTER_PLAN)) {
    const refs = [];
    for (const step of steps) {
      sequence += 1;
      const fileName = `${sequence}-${gate}-${step.id}.json`;
      refs.push(fileName);
      receiptDocuments.push({ fileName, sha256: sha(fileName), value: { schemaVersion: 1, runId, checkedAt, kind: 'step', gate, step: step.id, status: step.acceptedStatuses[0], exitCode: 0, evidenceRefs: [], cutoverBundleSha256, productionGo: false } });
    }
    const fileName = `${gate}-summary.json`;
    receiptDocuments.push({ fileName, sha256: sha(fileName), value: { schemaVersion: 1, runId, checkedAt, kind: 'gate', gate, step: 'summary', status: 'PASS', exitCode: 0, evidenceRefs: refs, cutoverBundleSha256, productionGo: false } });
  }
  const coreGateSha = receiptDocuments.find((document) => document.value.kind === 'gate' && document.value.gate === 'core_smoke').sha256;
  const roleStepSha = receiptDocuments.find((document) => document.value.kind === 'step' && document.value.step === 'role-core-smoke').sha256;
  const resultSetPublicationId = sha(JSON.stringify({ runId, releaseSha, coreGateSha, roleStepSha, checkedAt }));
  const roleResultDocuments = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, {
    fileName: `${role}.json`, sha256: sha(role), value: { schemaVersion: 1, template: false, evidenceType: 'P6_ROLE_UAT_RESULT_ACTUAL', environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr', releaseTag, runId, role, status: 'PASS', actualProduction: true, resultSetPublicationId, coreSmokeGateReceiptSha256: coreGateSha, roleSmokeStepReceiptSha256: roleStepSha, checkedAt }
  }]));
  const signoffDocuments = Object.fromEntries(['BUSINESS', 'SECURITY', 'OPERATIONS'].map((area) => [area, {
    fileName: `${area}.json`, sha256: sha(area), value: { schemaVersion: 1, template: false, evidenceType: 'P6_CUTOVER_SIGNOFF_ACTUAL', environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr', releaseTag, runId, area, decision: 'APPROVED', signedByRef: `identity://${area.toLowerCase()}-owner`, signedAt: checkedAt, coreSmokeGateReceiptSha256: coreGateSha }
  }]));
  return { receiptDocuments, roleResultDocuments, signoffDocuments, runId, releaseSha };
}

test('동일 run의 12 Gate·14 step·3 역할·3 서명을 actual P6 증거로 조립한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const result = assembleActualCutoverEvidence(await completeInput());
  assert.equal(result.status, 'PASS_ACTUAL_CUTOVER_EVIDENCE_ASSEMBLY');
  assert.equal(result.evidence.gates.length, 12);
  assert.equal(result.evidence.pilot.roleResults.length, 3);
  assert.equal(result.evidence.evidenceType, 'P6_CUTOVER_ACTUAL');
  assert.equal(result.evidence.releaseSha, releaseSha);
  assert.equal(result.productionGo, true);
});

test('step 누락과 Gate reference 변조를 fail-closed 한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  input.receiptDocuments = input.receiptDocuments.filter((document) => document.value.step !== 'public-probe');
  input.receiptDocuments.find((document) => document.value.kind === 'gate' && document.value.gate === 'core_smoke').value.evidenceRefs = [];
  const result = assembleActualCutoverEvidence(input);
  assert.equal(result.productionGo, false);
  assert.match(result.failures.join(','), /STEP_RECEIPTS|required|REFERENCES_INVALID/i);
});

test('서로 다른 cutover bundle receipt를 한 actual 실행 증거로 혼합하지 않는다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  input.receiptDocuments[0].value.cutoverBundleSha256 = 'd'.repeat(64);
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('CUTOVER_BUNDLE_PROVENANCE_INVALID'));
  assert.equal(result.productionGo, false);
});

test('다른 run 역할 결과와 서명 identity 오류를 거부한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  input.roleResultDocuments.ADMIN.value.runId = '33333333-3333-4333-8333-333333333333';
  input.signoffDocuments.SECURITY.value.signedByRef = 'person-name';
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('ADMIN_ACTUAL_ROLE_RESULT_INVALID'));
  assert.ok(result.failures.includes('SECURITY_ACTUAL_SIGNOFF_INVALID'));
});

test('서로 다른 publication set의 역할 결과를 혼합하면 actual P6 증거로 승격하지 않는다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  input.roleResultDocuments.MANAGER.value.resultSetPublicationId = 'f'.repeat(64);
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('ROLE_RESULT_SET_PROVENANCE_INVALID'));
  assert.equal(result.productionGo, false);
});

test('rollback cutoff 이후 step 또는 Gate receipt는 actual P6 증거로 승격하지 않는다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  for (const kind of ['step', 'gate']) {
    const input = await completeInput();
    input.receiptDocuments.find((document) => document.value.kind === kind).value.checkedAt = '2026-09-11T13:00:00.001Z';
    const result = assembleActualCutoverEvidence(input);
    assert.ok(result.failures.includes('CUTOVER_RECEIPT_DOCUMENT_INVALID'), kind);
    assert.equal(result.productionGo, false, kind);
  }
});

test('rollback cutoff 이후 역할 결과와 서명은 actual P6 증거로 승격하지 않는다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  const afterCutoff = '2026-09-11T13:00:00.001Z';
  const coreGateSha = input.roleResultDocuments.ADMIN.value.coreSmokeGateReceiptSha256;
  const roleStepSha = input.roleResultDocuments.ADMIN.value.roleSmokeStepReceiptSha256;
  const resultSetPublicationId = sha(JSON.stringify({ runId, releaseSha, coreGateSha, roleStepSha, checkedAt: afterCutoff }));
  for (const document of Object.values(input.roleResultDocuments)) {
    document.value.checkedAt = afterCutoff;
    document.value.resultSetPublicationId = resultSetPublicationId;
  }
  for (const document of Object.values(input.signoffDocuments)) document.value.signedAt = afterCutoff;
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('ADMIN_ACTUAL_ROLE_RESULT_INVALID'));
  assert.ok(result.failures.includes('BUSINESS_ACTUAL_SIGNOFF_INVALID'));
  assert.equal(result.productionGo, false);
});

test('contract template은 actual 역할 결과나 서명으로 승격하지 않는다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  input.roleResultDocuments.USER.value.template = true;
  input.signoffDocuments.BUSINESS.value.template = true;
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('USER_ACTUAL_ROLE_RESULT_INVALID'));
  assert.ok(result.failures.includes('BUSINESS_ACTUAL_SIGNOFF_INVALID'));
});

test('actual 증거는 저장소 밖 물리 경로에 create-only로 한 번만 쓴다', async () => {
  const { assembleActualCutoverEvidence, writeActualCutoverEvidence } = await modulePromise;
  const result = assembleActualCutoverEvidence(await completeInput());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-actual-cutover-'));
  const output = path.join(root, 'actual.json');
  try {
    assert.equal(writeActualCutoverEvidence(output, result.evidence, { repositoryRoot: path.join(root, 'different-repo') }), output);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).productionGo, true);
    assert.throws(() => writeActualCutoverEvidence(output, result.evidence, { repositoryRoot: path.join(root, 'different-repo') }), /ACTUAL_CUTOVER_EVIDENCE_ALREADY_EXISTS/);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('actual 증거 게시 경쟁 시 선점 bytes를 보존하고 임시파일을 제거한다', async (t) => {
  const { assembleActualCutoverEvidence, writeActualCutoverEvidence } = await modulePromise;
  const result = assembleActualCutoverEvidence(await completeInput());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-actual-cutover-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'actual.json');
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(sourcePath, outputPath) {
      fs.writeFileSync(outputPath, '{"owner":"competing-run"}\n', { flag: 'wx' });
      return realLink(sourcePath, outputPath);
    }
  };
  assert.throws(
    () => writeActualCutoverEvidence(output, result.evidence, {
      io, processId: 1400, repositoryRoot: path.join(root, 'different-repo')
    }),
    /ACTUAL_CUTOVER_EVIDENCE_ALREADY_EXISTS/
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { owner: 'competing-run' });
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.tmp')), false);
});
