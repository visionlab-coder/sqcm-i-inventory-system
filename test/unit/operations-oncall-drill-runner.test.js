const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-oncall-drill-runner.mjs');

function manifest(overrides = {}) {
  return {
    schemaVersion: 1, environment: 'production', activationState: 'actual', approved: true,
    apiContract: 'SQCM_I_ONCALL_DRILL_V1', providerRef: 'provider://approved-oncall',
    channelRef: 'channel://operations-oncall', drillId: 'oncall-drill-20260912-001',
    endpoint: 'https://oncall.example.com/v1/drills', primaryMaxAckSeconds: 300, escalationMaxAckSeconds: 900,
    schedule: {
      scheduleRef: 'schedule://production-2026-q3', timezone: 'Asia/Seoul', continuousCoverage: true,
      effectiveFrom: '2026-09-11T00:00:00.000Z', effectiveUntil: '2026-10-31T00:00:00.000Z',
      primaryOwnerRef: 'identity://operations-primary', escalationOwnerRef: 'identity://operations-escalation',
      primaryAcceptedAt: '2026-09-11T01:00:00.000Z', escalationAcceptedAt: '2026-09-11T01:05:00.000Z'
    }, ...overrides
  };
}

function results(overrides = {}) {
  return ['PRIMARY', 'ESCALATION'].map((role, index) => ({
    schemaVersion: 1, environment: 'production', test: true, drillId: 'oncall-drill-20260912-001', role,
    providerRef: 'provider://approved-oncall', channelRef: 'channel://operations-oncall',
    ownerRef: index === 0 ? 'identity://operations-primary' : 'identity://operations-escalation',
    idempotencyKey: `sqcmi:p7-oncall:oncall-drill-20260912-001:${role.toLowerCase()}`,
    acknowledgementStatus: 'ACKNOWLEDGED', receiptId: `receipt-${role.toLowerCase()}-001`,
    triggeredAt: index === 0 ? '2026-09-12T01:00:00.000Z' : '2026-09-12T01:06:00.000Z',
    acknowledgedAt: index === 0 ? '2026-09-12T01:04:00.000Z' : '2026-09-12T01:20:00.000Z',
    ...overrides
  }));
}

test('P6 actual·P7 활성화·Production GO 전에는 message·secret·write를 열지 않는다', async () => {
  const { evaluateOnCallDrillGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOnCallDrillGate(value);
    assert.equal(result.externalMessageAllowed, false);
    assert.equal(result.secretReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
  }
});

test('manifest·credential·output·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOnCallDrillGate } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.deepEqual(evaluateOnCallDrillGate(active).missing, ['providerManifest', 'credentialReference', 'output']);
  const ready = { ...active, manifestPresent: true, credentialReferencePresent: true, outputConfigured: true };
  assert.equal(evaluateOnCallDrillGate(ready).status, 'PASS_ONCALL_DRILL_DRY_RUN_READY');
  assert.equal(evaluateOnCallDrillGate({ ...ready, execute: true }).status, 'READY_WAIT_ONCALL_DRILL_CONFIRMATION');
  assert.equal(evaluateOnCallDrillGate({ ...ready, execute: true, confirmed: true }).externalMessageAllowed, true);
});

test('manifest는 승인·당번표·별도 책임자·공개 HTTPS·5/15분 한도를 요구한다', async () => {
  const { validateOnCallDrillProviderManifest } = await modulePromise;
  assert.equal(validateOnCallDrillProviderManifest(manifest()).approved, true);
  assert.throws(() => validateOnCallDrillProviderManifest(manifest({ approved: false, endpoint: 'http://127.0.0.1/drill', primaryMaxAckSeconds: 301 })), /approved.*endpoint.*primaryMaxAckSeconds/);
  assert.throws(() => validateOnCallDrillProviderManifest(manifest({ endpoint: 'https://[::1]/drill' })), /endpoint/);
  const same = manifest(); same.schedule.escalationOwnerRef = same.schedule.primaryOwnerRef;
  assert.throws(() => validateOnCallDrillProviderManifest(same), /distinctOwners/);
});

test('동일 drill과 역할은 항상 같은 idempotency key를 사용한다', async () => {
  const { onCallDrillIdempotencyKey } = await modulePromise;
  assert.equal(onCallDrillIdempotencyKey('oncall-drill-20260912-001', 'PRIMARY'), 'sqcmi:p7-oncall:oncall-drill-20260912-001:primary');
  assert.throws(() => onCallDrillIdempotencyKey('short', 'OTHER'), /INVALID/);
});

test('primary·escalation ACK를 on-call compiler 호환 export로 만든다', async () => {
  const { buildOnCallHandoverExport } = await modulePromise;
  const { compileOperationsOnCallEvidence } = await import('../../src/operations/operations-oncall-evidence.mjs');
  const checkedAt = '2026-09-12T01:21:00.000Z';
  const output = buildOnCallHandoverExport({ manifest: manifest(), acknowledgementResults: results(), checkedAt });
  assert.equal(output.drill.escalationReceiptId, 'receipt-escalation-001');
  assert.equal(compileOperationsOnCallEvidence(output, { checkedAt, sourceSha256: 'a'.repeat(64) }).status, 'PASS_ONCALL_EVIDENCE_COMPILED');
});

test('역할 순서·provenance·멱등·중복 receipt·지연·미래 ACK를 거부한다', async () => {
  const { buildOnCallHandoverExport } = await modulePromise;
  const value = results(); value.reverse();
  value[0].receiptId = value[1].receiptId;
  value[0].providerRef = 'provider://other';
  value[0].idempotencyKey = 'wrong-key';
  value[0].acknowledgementStatus = 'QUEUED';
  value[0].acknowledgedAt = '2026-09-12T02:00:00.000Z';
  assert.throws(() => buildOnCallHandoverExport({ manifest: manifest(), acknowledgementResults: value, checkedAt: '2026-09-12T01:21:00.000Z' }), /roleOrder.*provenance.*idempotencyKey.*acknowledgementStatus.*acknowledgementWindow.*futureAcknowledgement/);
});

test('handover export는 원자적으로 한 번만 쓰고 덮어쓰지 않는다', async (t) => {
  const { buildOnCallHandoverExport, writeOnCallHandoverExportOnce } = await modulePromise;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-oncall-drill-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'handover.json');
  const value = buildOnCallHandoverExport({ manifest: manifest(), acknowledgementResults: results(), checkedAt: '2026-09-12T01:21:00.000Z' });
  writeOnCallHandoverExportOnce(outputPath, value, { processId: 700 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).drill.drillId, 'oncall-drill-20260912-001');
  assert.throws(() => writeOnCallHandoverExportOnce(outputPath, value, { processId: 701 }), /OUTPUT_ALREADY_EXISTS/);
});
