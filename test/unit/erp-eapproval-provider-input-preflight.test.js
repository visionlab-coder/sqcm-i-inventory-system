const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const preflightModule = import('../../src/operations/erp-eapproval-provider-input-preflight.mjs');

function completeInput() {
  const outbound = ['eventId', 'type', 'aggregateType', 'aggregateId', 'occurredAt', 'idempotencyKey', 'payloadSha256'];
  return {
    approvalQueue: {
      status: 'APPROVED_FOR_STAGING_UAT',
      approverName: '승인 담당자',
      evidenceRef: 'approval-receipt-001',
      approvedScopes: ['STAGING_UAT', 'ROLLBACK']
    },
    providerProduct: {
      productName: 'Synthetic ERP',
      vendor: 'Synthetic Vendor',
      apiVersion: '2026-09',
      evidenceRef: 'provider-contract-001'
    },
    httpsEndpoint: {
      url: 'https://uat.erp.invalid.test/events',
      environment: 'staging',
      method: 'POST',
      evidenceRef: 'endpoint-approval-001'
    },
    fieldMapping: {
      evidenceRef: 'field-map-001',
      rows: [
        ...outbound.map((field) => ({ sqcmField: field, providerField: `erp_${field}`, direction: 'outbound', classification: 'metadata' })),
        { sqcmField: 'receiptId', providerField: 'receipt_id', direction: 'receipt', classification: 'identifier' },
        { sqcmField: 'receiptStatus', providerField: 'status', direction: 'receipt', classification: 'business' }
      ]
    },
    secretReference: {
      reference: '/run/secrets/erp-eapproval-signing-key',
      evidenceRef: 'secret-custody-001',
      rotationOwner: '보안 운영 책임자',
      revocationProcedureRef: 'runbook-secret-revoke'
    },
    testOwner: {
      name: '시험 책임자',
      title: 'UAT 책임자',
      evidenceRef: 'uat-owner-001',
      responsibilities: ['execute', 'result-signoff', 'rollback']
    }
  };
}

test('현재 입력 계약은 5항목 누락과 조건부 승인으로 외부 실행을 차단한다', async () => {
  const { evaluateErpEapprovalProviderInputs } = await preflightModule;
  const input = JSON.parse(fs.readFileSync('agent docs/harness/PE_C5_G4_PROVIDER_INPUT_CONTRACT.json', 'utf8'));
  const result = evaluateErpEapprovalProviderInputs(input);
  assert.equal(result.status, 'HOLD_EXTERNAL_INPUT');
  assert.deepEqual(result.failures, [
    'PROVIDER_PRODUCT_NOT_EVIDENCED',
    'HTTPS_ENDPOINT_NOT_EVIDENCED',
    'FIELD_MAPPING_NOT_EVIDENCED',
    'SECRET_REFERENCE_NOT_EVIDENCED',
    'TEST_OWNER_NOT_EVIDENCED',
    'APPROVAL_QUEUE_NOT_RELEASED'
  ]);
  assert.equal(result.externalCallsMade, false);
  assert.equal(result.deploymentsMade, false);
});

test('5항목과 staging UAT 승인 영수증이 모두 결박되면 READY만 반환한다', async () => {
  const { evaluateErpEapprovalProviderInputs } = await preflightModule;
  const result = evaluateErpEapprovalProviderInputs(completeInput());
  assert.equal(result.status, 'READY_FOR_STAGING_CONTRACT_UAT');
  assert.deepEqual(result.failures, []);
  assert.equal(result.mappingCoverage.missingOutbound.length, 0);
  assert.equal(result.mappingCoverage.missingReceipt.length, 0);
});

test('Secret 원문처럼 보이는 키는 다른 항목이 완전해도 차단한다', async () => {
  const { evaluateErpEapprovalProviderInputs } = await preflightModule;
  const input = completeInput();
  input.secretReference.secretValue = 'not-a-real-secret';
  const result = evaluateErpEapprovalProviderInputs(input);
  assert.equal(result.status, 'HOLD_EXTERNAL_INPUT');
  assert.ok(result.failures.includes('RAW_SECRET_MATERIAL_KEY_PRESENT'));
  assert.deepEqual(result.rawSecretKeys, ['$.secretReference.secretValue']);
});

test('example·query·credential 포함 endpoint와 불완전 필드 매핑을 거부한다', async () => {
  const { evaluateErpEapprovalProviderInputs } = await preflightModule;
  const input = completeInput();
  input.httpsEndpoint.url = 'https://user:pass@erp.example.com/events?token=x';
  input.fieldMapping.rows = input.fieldMapping.rows.filter((row) => row.sqcmField !== 'payloadSha256');
  const result = evaluateErpEapprovalProviderInputs(input);
  assert.ok(result.failures.includes('HTTPS_ENDPOINT_NOT_EVIDENCED'));
  assert.ok(result.failures.includes('FIELD_MAPPING_NOT_EVIDENCED'));
  assert.deepEqual(result.mappingCoverage.missingOutbound, ['payloadSha256']);
});
