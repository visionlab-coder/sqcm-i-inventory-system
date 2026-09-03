const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-alert-delivery-runner.mjs');

const signals = ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'];
function manifest(overrides = {}) {
  return {
    schemaVersion: 1, environment: 'production', activationState: 'actual', approved: true,
    apiContract: 'SQCM_I_ALERT_TEST_V1', providerRef: 'provider://approved-alerting',
    channelRef: 'channel://operations-primary', recipientRef: 'identity://operations-recipient',
    ownerRef: 'identity://operations-owner', deliveryRunId: 'alert-drill-20260912-001',
    endpoint: 'https://alerts.example.com/v1/test-deliveries', maxDeliverySeconds: 300, ...overrides
  };
}
function results(overrides = {}) {
  return signals.map((signalId, index) => ({
    schemaVersion: 1, environment: 'production', test: true, signalId,
    deliveryRunId: 'alert-drill-20260912-001', providerRef: 'provider://approved-alerting',
    channelRef: 'channel://operations-primary', recipientRef: 'identity://operations-recipient',
    idempotencyKey: `sqcmi:p7-alert:alert-drill-20260912-001:${signalId}`,
    deliveryStatus: 'DELIVERED', receiptId: `receipt-${signalId}-001`,
    triggeredAt: `2026-09-12T01:0${index}:00.000Z`, receivedAt: `2026-09-12T01:0${index}:05.000Z`,
    ...overrides
  }));
}

test('P6 actual·P7 활성화·Production GO 전에는 message·secret·write를 열지 않는다', async () => {
  const { evaluateAlertDeliveryGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateAlertDeliveryGate(value);
    assert.equal(result.externalMessageAllowed, false);
    assert.equal(result.secretReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
  }
});

test('manifest·credential·output·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateAlertDeliveryGate } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.deepEqual(evaluateAlertDeliveryGate(active).missing, ['providerManifest', 'credentialReference', 'output']);
  const ready = { ...active, manifestPresent: true, credentialReferencePresent: true, outputConfigured: true };
  assert.equal(evaluateAlertDeliveryGate(ready).status, 'PASS_ALERT_DELIVERY_DRY_RUN_READY');
  assert.equal(evaluateAlertDeliveryGate({ ...ready, execute: true }).status, 'READY_WAIT_ALERT_DELIVERY_CONFIRMATION');
  assert.equal(evaluateAlertDeliveryGate({ ...ready, execute: true, confirmed: true }).externalMessageAllowed, true);
});

test('provider manifest는 승인·provenance·공개 HTTPS·5분 이하 delivery를 요구한다', async () => {
  const { validateAlertDeliveryProviderManifest } = await modulePromise;
  assert.equal(validateAlertDeliveryProviderManifest(manifest()).approved, true);
  assert.throws(() => validateAlertDeliveryProviderManifest(manifest({ approved: false, endpoint: 'http://127.0.0.1:3000/alerts', maxDeliverySeconds: 301 })), /approved.*endpoint.*maxDeliverySeconds/);
  assert.throws(() => validateAlertDeliveryProviderManifest(manifest({ endpoint: 'https://[::1]/alerts' })), /endpoint/);
  assert.throws(() => validateAlertDeliveryProviderManifest(manifest({ endpoint: 'https://intranet/alerts' })), /endpoint/);
});

test('동일 run과 signal은 항상 같은 idempotency key를 사용한다', async () => {
  const { alertIdempotencyKey } = await modulePromise;
  assert.equal(alertIdempotencyKey('alert-drill-20260912-001', 'availability'), 'sqcmi:p7-alert:alert-drill-20260912-001:availability');
  assert.throws(() => alertIdempotencyKey('short', 'other'), /INVALID/);
});

test('5종 DELIVERED receipt를 alert compiler 호환 export로 만든다', async () => {
  const { buildAlertReceiptExport } = await modulePromise;
  const { compileOperationsAlertingEvidence } = await import('../../src/operations/operations-alerting-evidence.mjs');
  const output = buildAlertReceiptExport({ manifest: manifest(), deliveryResults: results(), checkedAt: '2026-09-12T01:10:00.000Z' });
  assert.deepEqual(output.signals.map((item) => item.id), signals);
  assert.equal(compileOperationsAlertingEvidence(output, { checkedAt: '2026-09-12T01:10:00.000Z', sourceSha256: 'a'.repeat(64) }).status, 'PASS_ALERTING_EVIDENCE_COMPILED');
});

test('순서·중복·provenance·멱등·미수신·지연 receipt를 거부한다', async () => {
  const { buildAlertReceiptExport } = await modulePromise;
  const value = results();
  value.reverse();
  value[0].receiptId = value[1].receiptId;
  value[0].providerRef = 'provider://other';
  value[0].idempotencyKey = 'wrong-key';
  value[0].deliveryStatus = 'QUEUED';
  value[0].receivedAt = '2026-09-12T02:00:00.000Z';
  assert.throws(() => buildAlertReceiptExport({ manifest: manifest(), deliveryResults: value, checkedAt: '2026-09-12T02:01:00.000Z' }), /signalOrder.*provenance.*idempotencyKey.*deliveryStatus.*deliveryWindow/);
});

test('receipt export는 원자적으로 한 번만 쓰고 덮어쓰지 않는다', async (t) => {
  const { buildAlertReceiptExport, writeAlertReceiptExportOnce } = await modulePromise;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-alert-delivery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'receipts.json');
  const value = buildAlertReceiptExport({ manifest: manifest(), deliveryResults: results(), checkedAt: '2026-09-12T01:10:00.000Z' });
  writeAlertReceiptExportOnce(outputPath, value, { processId: 700 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).signals.length, 5);
  assert.throws(() => writeAlertReceiptExportOnce(outputPath, value, { processId: 701 }), /OUTPUT_ALREADY_EXISTS/);
});
