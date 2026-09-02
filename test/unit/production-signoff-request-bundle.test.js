const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-signoff-request-bundle.mjs');

const runId = '22222222-2222-4222-8222-222222222222';
const releaseSha = 'a'.repeat(40);
const coreGateSha = 'b'.repeat(64);
const rollbackGateSha = 'c'.repeat(64);
const resultSetPublicationId = 'd'.repeat(64);
const roleCheckedAt = '2026-09-11T12:00:00.000Z';
const preparedAt = '2026-09-11T12:01:00.000Z';

function roles(overrides = {}) {
  return Object.fromEntries(['ADMIN', 'MANAGER', 'USER'].map((role) => [role, {
    schemaVersion: 1, template: false, evidenceType: 'P6_ROLE_UAT_RESULT_ACTUAL',
    environment: 'production', activationState: 'actual', targetUrl: 'https://inventory.safe-link.co.kr',
    releaseTag: `sha-${releaseSha}`, runId, role, status: 'PASS', actualProduction: true,
    resultSetPublicationId, coreSmokeGateReceiptSha256: coreGateSha,
    roleSmokeStepReceiptSha256: 'e'.repeat(64), checkedAt: roleCheckedAt,
    ...overrides
  }]));
}

test('입력과 변경창 전에는 signoff request input read와 write를 열지 않는다', async () => {
  const { evaluateProductionSignoffRequestBundleGate } = await modulePromise;
  for (const input of [{}, { insideWindow: true }, { insideWindow: true, inputReferencesReady: true }]) {
    const result = evaluateProductionSignoffRequestBundleGate(input);
    assert.equal(result.inputReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.externalSignatureCreated, false);
  }
});

test('동일 역할 결과 세트와 rollback Gate를 세 비서명 payload에 결박한다', async () => {
  const { buildProductionSignoffRequestBundle } = await modulePromise;
  const result = buildProductionSignoffRequestBundle({
    runId, releaseSha, coreGateSha, rollbackGateSha, roleResultDocuments: roles(), preparedAt
  });
  assert.equal(result.evidenceType, 'P6_CUTOVER_SIGNOFF_REQUEST_SET');
  assert.equal(result.externalSignatureCreated, false);
  assert.deepEqual(Object.keys(result.signoffPayloads), ['BUSINESS', 'SECURITY', 'OPERATIONS']);
  for (const payload of Object.values(result.signoffPayloads)) {
    assert.equal(payload.template, true);
    assert.equal(payload.decision, 'NOT_RUN');
    assert.equal(payload.signedByRef, null);
    assert.equal(payload.roleResultSetPublicationId, resultSetPublicationId);
    assert.equal(payload.preSignoffRollbackGateReceiptSha256, rollbackGateSha);
    assert.equal(payload.signoffRequestSetId, result.requestSetId);
    assert.equal(payload.signoffRequestPreparedAt, preparedAt);
  }
});

test('혼합 역할 결과 세트와 인과시간 역전을 거부한다', async () => {
  const { buildProductionSignoffRequestBundle } = await modulePromise;
  const mixed = roles();
  mixed.USER.resultSetPublicationId = 'f'.repeat(64);
  assert.throws(() => buildProductionSignoffRequestBundle({
    runId, releaseSha, coreGateSha, rollbackGateSha, roleResultDocuments: mixed, preparedAt
  }), /ROLE_RESULT_SET_INVALID/);
  assert.throws(() => buildProductionSignoffRequestBundle({
    runId, releaseSha, coreGateSha, rollbackGateSha, roleResultDocuments: roles(), preparedAt: '2026-09-11T11:59:59.999Z'
  }), /PREPARED_AT_INVALID/);
});

test('request bundle은 저장소 밖에 create-only로 한 번만 기록한다', async (t) => {
  const { buildProductionSignoffRequestBundle, writeProductionSignoffRequestBundle } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p6-signoff-request-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'request.json');
  const value = buildProductionSignoffRequestBundle({
    runId, releaseSha, coreGateSha, rollbackGateSha, roleResultDocuments: roles(), preparedAt
  });
  writeProductionSignoffRequestBundle(output, value, { repositoryRoot: path.join(root, 'repository'), processId: 701 });
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).externalSignatureCreated, false);
  assert.throws(() => writeProductionSignoffRequestBundle(output, value, { repositoryRoot: path.join(root, 'repository'), processId: 702 }), /SIGNOFF_REQUEST_BUNDLE_ALREADY_EXISTS/);
});

test('CLI는 검증과 조립에 동일한 receipt snapshot 한 건만 사용한다', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts', 'production-signoff-request-bundle.mjs'), 'utf8');
  assert.equal((source.match(/loadRunReceiptDocuments\(/g) || []).length, 1);
  assert.match(source, /validateSignoffResumeReceiptDocuments\(/);
  assert.doesNotMatch(source, /validateSignoffResumeReceipts\(/);
});
