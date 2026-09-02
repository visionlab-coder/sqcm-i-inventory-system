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
const receiptFileName = ({ sequence, kind, gate, step, time = checkedAt }) => `${time.replace(/[:.]/g, '-')}-${String(sequence).padStart(4, '0')}-${kind}-${gate}-${step}.json`;

async function completeInput() {
  const { CUTOVER_GATE_ADAPTER_PLAN } = await adapterPromise;
  const receiptDocuments = [];
  let sequence = 0;
  for (const [gate, steps] of Object.entries(CUTOVER_GATE_ADAPTER_PLAN)) {
    const refs = [];
    for (const step of steps) {
      sequence += 1;
      const fileName = receiptFileName({ sequence, kind: 'step', gate, step: step.id });
      refs.push(fileName);
      receiptDocuments.push({ fileName, sha256: sha(fileName), value: { schemaVersion: 1, runId, checkedAt, sequence, kind: 'step', gate, step: step.id, status: step.acceptedStatuses[0], exitCode: 0, evidenceRefs: [], cutoverBundleSha256, productionGo: false } });
    }
    sequence += 1;
    const fileName = receiptFileName({ sequence, kind: 'gate', gate, step: 'summary' });
    receiptDocuments.push({ fileName, sha256: sha(fileName), value: { schemaVersion: 1, runId, checkedAt, sequence, kind: 'gate', gate, step: 'summary', status: 'PASS', exitCode: 0, evidenceRefs: refs, cutoverBundleSha256, productionGo: false } });
  }
  const coreGateSha = receiptDocuments.find((document) => document.value.kind === 'gate' && document.value.gate === 'core_smoke').sha256;
  const roleStepSha = receiptDocuments.find((document) => document.value.kind === 'step' && document.value.step === 'role-core-smoke').sha256;
  const rollbackGateSha = receiptDocuments.find((document) => document.value.kind === 'gate' && document.value.gate === 'rollback').sha256;
  const resultSetPublicationId = sha(JSON.stringify({ runId, releaseSha, coreGateSha, roleStepSha, checkedAt }));
  const signoffRequestPreparedAt = checkedAt;
  const signoffRequestSetId = sha(JSON.stringify({
    runId, releaseSha, coreGateSha, rollbackGateSha, resultSetPublicationId,
    preparedAt: signoffRequestPreparedAt
  }));
  const signoffRequestBundleSha256 = sha('signoff-request-bundle');
  const roleResultDocuments = Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, {
    fileName: `${role}.json`, sha256: sha(role), value: { schemaVersion: 1, template: false, evidenceType: 'P6_ROLE_UAT_RESULT_ACTUAL', environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr', releaseTag, runId, role, status: 'PASS', actualProduction: true, resultSetPublicationId, coreSmokeGateReceiptSha256: coreGateSha, roleSmokeStepReceiptSha256: roleStepSha, checkedAt }
  }]));
  const signoffDocuments = Object.fromEntries(['BUSINESS', 'SECURITY', 'OPERATIONS'].map((area) => [area, {
    fileName: `${area}.json`, sha256: sha(area), value: { schemaVersion: 1, template: false, evidenceType: 'P6_CUTOVER_SIGNOFF_ACTUAL', environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr', releaseTag, runId, area, decision: 'APPROVED', signedByRef: `identity://${area.toLowerCase()}-owner`, signedAt: checkedAt, coreSmokeGateReceiptSha256: coreGateSha, roleResultSetPublicationId: resultSetPublicationId, preSignoffRollbackGateReceiptSha256: rollbackGateSha, signoffRequestSetId, signoffRequestPreparedAt, signoffRequestBundleSha256 }
  }]));
  const signoffPayloads = Object.fromEntries(['BUSINESS', 'SECURITY', 'OPERATIONS'].map((area) => [area, {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_ACTUAL', environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr', releaseTag, runId, area, decision: 'NOT_RUN', signedByRef: null, signedAt: null, coreSmokeGateReceiptSha256: coreGateSha, roleResultSetPublicationId: resultSetPublicationId, preSignoffRollbackGateReceiptSha256: rollbackGateSha, signoffRequestSetId, signoffRequestPreparedAt, signoffRequestBundleSha256: null
  }]));
  const signoffRequestBundleDocument = {
    fileName: 'signoff-request-bundle.json', sha256: signoffRequestBundleSha256,
    value: { schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_REQUEST_SET', environment: 'production', activationState: 'request', targetUrl: 'https://inventory.safe-link.co.kr', releaseSha, releaseTag, runId, requestSetId: signoffRequestSetId, preparedAt: signoffRequestPreparedAt, roleResultSetPublicationId: resultSetPublicationId, preSignoffRollbackGateReceiptSha256: rollbackGateSha, signoffPayloads, signerInstructions: { setTemplateFalse: true, setDecisionApproved: true, fillOnly: ['signedByRef', 'signedAt', 'signoffRequestBundleSha256'], preserveProvenanceFields: true }, externalSignatureCreated: false, productionGo: false }
  };
  return { receiptDocuments, roleResultDocuments, signoffDocuments, signoffRequestBundleDocument, runId, releaseSha };
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

test('실제 서명은 검토한 물리 unsigned request bundle SHA-256에 결박된다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const tamperedBundle = await completeInput();
  tamperedBundle.signoffRequestBundleDocument.value.signoffPayloads.SECURITY.area = 'BUSINESS';
  const tamperedResult = assembleActualCutoverEvidence(tamperedBundle);
  assert.equal(tamperedResult.productionGo, false);
  assert.match(tamperedResult.failures.join(','), /SIGNOFF_REQUEST_BUNDLE_INVALID/);

  const mismatchedReference = await completeInput();
  mismatchedReference.signoffDocuments.OPERATIONS.value.signoffRequestBundleSha256 = 'f'.repeat(64);
  const mismatchedResult = assembleActualCutoverEvidence(mismatchedReference);
  assert.equal(mismatchedResult.productionGo, false);
  assert.match(mismatchedResult.failures.join(','), /OPERATIONS_ACTUAL_SIGNOFF_INVALID/);
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

test('receipt 순번 교환 또는 중복은 실제 Gate 실행 순서 증거가 될 수 없다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const swapped = await completeInput();
  const firstSequence = swapped.receiptDocuments[0].value.sequence;
  swapped.receiptDocuments[0].value.sequence = swapped.receiptDocuments[1].value.sequence;
  swapped.receiptDocuments[1].value.sequence = firstSequence;
  const swappedResult = assembleActualCutoverEvidence(swapped);
  assert.ok(swappedResult.failures.includes('CUTOVER_RECEIPT_SEQUENCE_INVALID'));
  assert.equal(swappedResult.productionGo, false);

  const duplicated = await completeInput();
  duplicated.receiptDocuments[1].value.sequence = duplicated.receiptDocuments[0].value.sequence;
  const duplicatedResult = assembleActualCutoverEvidence(duplicated);
  assert.ok(duplicatedResult.failures.includes('CUTOVER_RECEIPT_SEQUENCE_INVALID'));
  assert.equal(duplicatedResult.productionGo, false);
});

test('receipt 파일명은 payload 시각·순번·kind·Gate·step과 정확히 일치해야 한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  for (const mutate of [
    (document) => { document.fileName = document.fileName.replace('-0001-', '-0026-'); },
    (document) => { document.fileName = document.fileName.replace('2026-09-11T12-00-00-000Z', '2026-09-11T12-00-01-000Z'); },
    (document) => { document.fileName = document.fileName.replace('-step-', '-gate-'); }
  ]) {
    const input = await completeInput();
    mutate(input.receiptDocuments[0]);
    const result = assembleActualCutoverEvidence(input);
    assert.ok(result.failures.includes('CUTOVER_RECEIPT_FILENAME_PAYLOAD_MISMATCH'));
    assert.equal(result.productionGo, false);
  }
});

test('receipt sequence가 증가하는 동안 checkedAt은 역행할 수 없다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const input = await completeInput();
  const document = input.receiptDocuments[1];
  document.value.checkedAt = '2026-09-11T11:59:59.999Z';
  document.fileName = receiptFileName({ ...document.value, time: document.value.checkedAt });
  const result = assembleActualCutoverEvidence(input);
  assert.ok(result.failures.includes('CUTOVER_RECEIPT_TIME_SEQUENCE_INVALID'));
  assert.equal(result.productionGo, false);
});

test('역할 결과 시각은 role smoke receipt와 같고 서명은 pre-signoff 이후·signoff receipt 이전이어야 한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  const roleMismatch = await completeInput();
  const roleCheckedAt = '2026-09-11T11:59:00.000Z';
  const { coreSmokeGateReceiptSha256: coreGateSha, roleSmokeStepReceiptSha256: roleStepSha } = roleMismatch.roleResultDocuments.ADMIN.value;
  const publicationId = sha(JSON.stringify({ runId, releaseSha, coreGateSha, roleStepSha, checkedAt: roleCheckedAt }));
  for (const document of Object.values(roleMismatch.roleResultDocuments)) {
    document.value.checkedAt = roleCheckedAt;
    document.value.resultSetPublicationId = publicationId;
  }
  const roleResult = assembleActualCutoverEvidence(roleMismatch);
  assert.ok(roleResult.failures.includes('ROLE_RESULT_RECEIPT_TIME_MISMATCH'));
  assert.equal(roleResult.productionGo, false);

  for (const signedAt of ['2026-09-11T11:59:00.000Z', '2026-09-11T12:01:00.000Z']) {
    const signoffMismatch = await completeInput();
    signoffMismatch.signoffDocuments.OPERATIONS.value.signedAt = signedAt;
    const signoffResult = assembleActualCutoverEvidence(signoffMismatch);
    assert.ok(signoffResult.failures.includes('SIGNOFF_CAUSAL_TIME_INVALID'));
    assert.equal(signoffResult.productionGo, false);
  }
});

test('서명은 검토한 역할 결과 세트와 pre-signoff rollback Gate receipt에 결합돼야 한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  for (const [field, value] of [
    ['roleResultSetPublicationId', 'f'.repeat(64)],
    ['preSignoffRollbackGateReceiptSha256', 'e'.repeat(64)]
  ]) {
    const input = await completeInput();
    input.signoffDocuments.SECURITY.value[field] = value;
    const result = assembleActualCutoverEvidence(input);
    assert.ok(result.failures.includes('SECURITY_ACTUAL_SIGNOFF_INVALID'));
    assert.equal(result.productionGo, false);
  }
});

test('서명은 동일한 unsigned request set과 preparedAt provenance에 결합돼야 한다', async () => {
  const { assembleActualCutoverEvidence } = await modulePromise;
  for (const [field, value] of [
    ['signoffRequestSetId', 'f'.repeat(64)],
    ['signoffRequestPreparedAt', '2026-09-11T12:00:00.001Z']
  ]) {
    const input = await completeInput();
    input.signoffDocuments.OPERATIONS.value[field] = value;
    const result = assembleActualCutoverEvidence(input);
    assert.ok(result.failures.includes('OPERATIONS_ACTUAL_SIGNOFF_INVALID'));
    assert.equal(result.productionGo, false);
  }

  const afterSignoff = await completeInput();
  const preparedAt = '2026-09-11T12:00:00.001Z';
  const first = afterSignoff.signoffDocuments.BUSINESS.value;
  const requestSetId = sha(JSON.stringify({
    runId, releaseSha,
    coreGateSha: first.coreSmokeGateReceiptSha256,
    rollbackGateSha: first.preSignoffRollbackGateReceiptSha256,
    resultSetPublicationId: first.roleResultSetPublicationId,
    preparedAt
  }));
  for (const document of Object.values(afterSignoff.signoffDocuments)) {
    document.value.signoffRequestPreparedAt = preparedAt;
    document.value.signoffRequestSetId = requestSetId;
  }
  const result = assembleActualCutoverEvidence(afterSignoff);
  assert.ok(result.failures.includes('SIGNOFF_REQUEST_SET_PROVENANCE_INVALID'));
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
