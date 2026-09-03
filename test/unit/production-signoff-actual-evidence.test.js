const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const modulePromise = import('../../src/operations/production-signoff-actual-evidence.mjs');

const areas = ['BUSINESS', 'SECURITY', 'OPERATIONS'];
const runId = '77777777-7777-4777-8777-777777777777';
const releaseSha = 'a'.repeat(40);
const bundleSha = 'b'.repeat(64);
const preparedAt = '2026-09-03T02:01:00.000Z';

function fixture() {
  const coreGateSha = 'd'.repeat(64);
  const rollbackGateSha = 'f'.repeat(64);
  const resultSetPublicationId = 'e'.repeat(64);
  const signoffRequestSetId = createHash('sha256').update(JSON.stringify({
    runId, releaseSha, coreGateSha, rollbackGateSha, resultSetPublicationId, preparedAt
  })).digest('hex');
  const common = {
    environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr',
    releaseTag: `sha-${releaseSha}`, runId
  };
  const signoffPayloads = Object.fromEntries(areas.map((area) => [area, {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_ACTUAL', ...common,
    area, decision: 'NOT_RUN', signedByRef: null, signedAt: null,
    coreSmokeGateReceiptSha256: coreGateSha, roleResultSetPublicationId: resultSetPublicationId,
    preSignoffRollbackGateReceiptSha256: rollbackGateSha, signoffRequestSetId,
    signoffRequestPreparedAt: preparedAt, signoffRequestBundleSha256: null, approvalReceiptSha256: null
  }]));
  const approvalReceiptPayloads = Object.fromEntries(areas.map((area) => [area, {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_APPROVAL_RECEIPT_ACTUAL', ...common,
    area, decision: 'NOT_RUN', signedByRef: null, signedAt: null, receiptId: null,
    authentication: { method: 'MFA', providerRef: null, verified: false },
    signoffRequestSetId, signoffRequestBundleSha256: null
  }]));
  const requestBundleDocument = { sha256: bundleSha, value: {
    schemaVersion: 1, template: true, evidenceType: 'P6_CUTOVER_SIGNOFF_REQUEST_SET',
    environment: 'production', activationState: 'request', targetUrl: common.targetUrl,
    releaseSha, releaseTag: common.releaseTag, runId, requestSetId: signoffRequestSetId,
    preparedAt, roleResultSetPublicationId: resultSetPublicationId,
    preSignoffRollbackGateReceiptSha256: rollbackGateSha, signoffPayloads, approvalReceiptPayloads,
    signerInstructions: {
      setTemplateFalse: true, setDecisionApproved: true,
      fillOnly: ['signedByRef', 'signedAt', 'signoffRequestBundleSha256', 'approvalReceiptSha256'],
      approvalReceiptFillOnly: ['signedByRef', 'signedAt', 'receiptId', 'authentication.providerRef', 'authentication.verified', 'signoffRequestBundleSha256'],
      preserveProvenanceFields: true
    }, externalSignatureCreated: false, productionGo: false
  }};
  const approvalReceiptDocuments = Object.fromEntries(areas.map((area, index) => [area, {
    sha256: String(index + 1).repeat(64), value: {
      ...approvalReceiptPayloads[area], template: false, decision: 'APPROVED',
      signedByRef: 'identity://sqcm-i-owner', signedAt: `2026-09-03T02:0${index + 2}:00.000Z`,
      receiptId: `mfa-receipt-${area.toLowerCase()}`,
      authentication: { method: 'MFA', providerRef: 'identity://approved-mfa-provider', verified: true },
      signoffRequestBundleSha256: bundleSha
    }
  }]));
  return { requestBundleDocument, approvalReceiptDocuments };
}

test('변경창과 명시 확인 전에는 실제 문서를 읽거나 쓰지 않는다', async () => {
  const { evaluateProductionActualSignoffGate } = await modulePromise;
  for (const input of [{}, { insideWindow: true }, {
    insideWindow: true, inputReferencesReady: true, outputsConfigured: true, assemble: true
  }]) {
    const result = evaluateProductionActualSignoffGate(input);
    assert.equal(result.inputReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.externalApprovalCreated, false);
    assert.equal(result.productionGo, false);
  }
});

test('MFA 영수증 3건을 비서명 요청 payload에 결박해 actual 서명 문서 3건을 조립한다', async () => {
  const { assembleProductionActualSignoffDocuments } = await modulePromise;
  const result = assembleProductionActualSignoffDocuments(fixture());
  assert.equal(result.status, 'PASS_PRODUCTION_ACTUAL_SIGNOFF_DOCUMENTS_ASSEMBLED');
  assert.deepEqual(Object.keys(result.documents), areas);
  for (const area of areas) {
    const document = result.documents[area];
    assert.equal(document.template, false);
    assert.equal(document.decision, 'APPROVED');
    assert.equal(document.signoffRequestBundleSha256, bundleSha);
    assert.equal(document.approvalReceiptSha256, fixture().approvalReceiptDocuments[area].sha256);
  }
  assert.equal(result.externalApprovalCreated, false);
  assert.equal(result.productionGo, false);
});

test('다른 요청 번들 영수증과 중복 MFA receipt ID는 fail-closed로 거부한다', async () => {
  const { assembleProductionActualSignoffDocuments } = await modulePromise;
  const mismatch = fixture();
  mismatch.approvalReceiptDocuments.SECURITY.value.signoffRequestBundleSha256 = '9'.repeat(64);
  assert.throws(() => assembleProductionActualSignoffDocuments(mismatch), /APPROVAL_RECEIPT_INVALID/);
  const duplicate = fixture();
  duplicate.approvalReceiptDocuments.SECURITY.value.receiptId = duplicate.approvalReceiptDocuments.BUSINESS.value.receiptId;
  assert.throws(() => assembleProductionActualSignoffDocuments(duplicate), /APPROVAL_RECEIPT_IDS_NOT_UNIQUE/);
});

test('세 출력은 외부 물리 경로에 create-only로 게시하고 사전 충돌 시 0건을 쓴다', async (t) => {
  const { assembleProductionActualSignoffDocuments, writeProductionActualSignoffDocuments } = await modulePromise;
  const result = assembleProductionActualSignoffDocuments(fixture());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-actual-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outputs = Object.fromEntries(areas.map((area) => [area, path.join(root, `${area}.json`)]));
  fs.writeFileSync(outputs.SECURITY, '{"owner":"existing"}\n', { flag: 'wx' });
  assert.throws(() => writeProductionActualSignoffDocuments(outputs, result.documents, {
    repositoryRoot: path.join(root, 'repository')
  }), /ACTUAL_SIGNOFF_OUTPUT_ALREADY_EXISTS/);
  assert.equal(fs.existsSync(outputs.BUSINESS), false);
  assert.equal(fs.existsSync(outputs.OPERATIONS), false);
});

test('Goal Harness는 실제 서명 조립기 dry-run을 검증 목록에 포함한다', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts', 'goal-harness.mjs'), 'utf8');
  assert.match(source, /\['production-signoff-actual-evidence', 'npm\.cmd', \['run', 'production:signoff-actual-evidence'\]\]/);
});
