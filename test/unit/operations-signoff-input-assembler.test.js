const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-signoff-input-assembler.mjs');

const domains = ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue'];
const duties = ['on_call', 'alert_response', 'backup_restore', 'certificate_renewal', 'daily_maintenance', 'improvement_triage'];
const releaseSha = 'b'.repeat(40);
const hashes = { p6Cutover: 'c'.repeat(64), domains: Object.fromEntries(domains.map((domain, index) => [domain, (index + 1).toString(16).repeat(64)])) };

function documents() {
  return {
    p6: { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', targetUrl: 'https://inventory.safe-link.co.kr', productionGo: true, releaseSha },
    domains: Object.fromEntries(domains.map((domain) => [domain, { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL', domain, status: 'PASS', checkedAt: '2026-10-12T00:30:00.000Z', provenance: domain === 'maintenance' ? { releaseSha } : {} }]))
  };
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'PRODUCTION_OPERATIONS_OWNER_APPROVAL_RECEIPT', targetUrl: 'https://inventory.safe-link.co.kr',
    decision: 'APPROVED', role: 'OPERATIONS_OWNER', signedByRef: 'identity://operations-owner',
    signedAt: '2026-10-12T00:55:00.000Z', receiptId: 'operations-owner-approval-20261012',
    blockingExceptionCount: 0, releaseSha, p6CutoverEvidenceSha256: hashes.p6Cutover,
    attestations: domains.map((domain) => ({ domain, status: 'PASS', evidenceSha256: hashes.domains[domain] })),
    acceptedDuties: [...duties], ...overrides
  };
}

test('P6 actual·P7 활성화·Production GO 전에는 input read·write·signature를 열지 않는다', async () => {
  const { evaluateOperationsSignoffInputAssemblyGate } = await modulePromise;
  for (const value of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateOperationsSignoffInputAssemblyGate(value);
    assert.equal(result.inputReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.externalSignatureAllowed, false);
  }
});

test('P6·8영역·approval·output·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsSignoffInputAssemblyGate } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.equal(evaluateOperationsSignoffInputAssemblyGate(active).missing.length, 11);
  const ready = { ...active, p6EvidencePresent: true, domainEvidencePresent: Object.fromEntries(domains.map((domain) => [domain, true])), approvalReceiptPresent: true, outputConfigured: true };
  assert.equal(evaluateOperationsSignoffInputAssemblyGate(ready).status, 'PASS_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_DRY_RUN_READY');
  assert.equal(evaluateOperationsSignoffInputAssemblyGate({ ...ready, outputExists: true }).status, 'READY_EXISTING_OPERATIONS_SIGNOFF_INPUT_REQUIRES_COMPILER_VALIDATION');
  assert.equal(evaluateOperationsSignoffInputAssemblyGate({ ...ready, execute: true }).status, 'READY_WAIT_OPERATIONS_SIGNOFF_INPUT_ASSEMBLY_CONFIRMATION');
  assert.equal(evaluateOperationsSignoffInputAssemblyGate({ ...ready, execute: true, confirmed: true }).inputReadAllowed, true);
});

test('P6와 8개 actual 영역·승인 receipt를 compiler 호환 signoff input으로 조립한다', async () => {
  const { buildOperationsSignoffInput } = await modulePromise;
  const { compileOperationsSignoffEvidence } = await import('../../src/operations/operations-signoff-evidence.mjs');
  const value = documents();
  const output = buildOperationsSignoffInput({ p6Document: value.p6, domainDocuments: value.domains, approvalReceipt: receipt(), hashes, checkedAt: '2026-10-12T01:00:00.000Z' });
  assert.equal(output.signoff.attestations.length, 8);
  assert.equal(compileOperationsSignoffEvidence(output, { checkedAt: '2026-10-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) }).status, 'PASS_OPERATIONS_SIGNOFF_EVIDENCE_COMPILED');
});

test('template·staging·비actual·잘못된 domain 증거를 거부한다', async () => {
  const { buildOperationsSignoffInput } = await modulePromise;
  const value = documents(); value.p6.environment = 'staging'; value.domains.slo.activationState = 'template'; value.domains.alerting.domain = 'other';
  assert.throws(() => buildOperationsSignoffInput({ p6Document: value.p6, domainDocuments: value.domains, approvalReceipt: receipt(), hashes, checkedAt: '2026-10-12T01:00:00.000Z' }), /p6:provenance.*slo:provenance.*alerting:contract/);
});

test('Production GO·release·P6/domain SHA 불일치를 거부한다', async () => {
  const { buildOperationsSignoffInput } = await modulePromise;
  const value = documents(); value.p6.productionGo = false; value.domains.maintenance.provenance.releaseSha = 'd'.repeat(40);
  const altered = receipt({ releaseSha: 'e'.repeat(40), p6CutoverEvidenceSha256: 'f'.repeat(64) }); altered.attestations[0].evidenceSha256 = 'f'.repeat(64);
  assert.throws(() => buildOperationsSignoffInput({ p6Document: value.p6, domainDocuments: value.domains, approvalReceipt: altered, hashes, checkedAt: '2026-10-12T01:00:00.000Z' }), /p6:productionGo.*maintenance:releaseShaMismatch.*receipt:releaseSha.*receipt:p6CutoverEvidenceSha256.*receipt:sloAttestation/);
});

test('identity·24시간·8영역 순서·고유 SHA·6업무·차단 예외를 강제한다', async () => {
  const { buildOperationsSignoffInput } = await modulePromise;
  const value = documents(); const altered = receipt({ signedByRef: 'person', signedAt: '2026-10-10T00:00:00.000Z', blockingExceptionCount: 1, acceptedDuties: duties.slice(0, 5) });
  altered.attestations.reverse(); altered.attestations[1].evidenceSha256 = altered.attestations[0].evidenceSha256;
  assert.throws(() => buildOperationsSignoffInput({ p6Document: value.p6, domainDocuments: value.domains, approvalReceipt: altered, hashes, checkedAt: '2026-10-12T01:00:00.000Z' }), /signedByRef.*blockingExceptionCount.*acceptedDuties.*attestationOrder.*Attestation.*uniqueAttestationHashes.*freshness/);
});

test('signoff input은 원자적으로 한 번만 쓰고 덮어쓰지 않는다', async (t) => {
  const { buildOperationsSignoffInput, writeOperationsSignoffInputOnce } = await modulePromise;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-input-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const value = documents(); const outputPath = path.join(directory, 'signoff-input.json');
  const output = buildOperationsSignoffInput({ p6Document: value.p6, domainDocuments: value.domains, approvalReceipt: receipt(), hashes, checkedAt: '2026-10-12T01:00:00.000Z' });
  writeOperationsSignoffInputOnce(outputPath, output, { processId: 800 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).signoff.role, 'OPERATIONS_OWNER');
  assert.throws(() => writeOperationsSignoffInputOnce(outputPath, output, { processId: 801 }), /OUTPUT_ALREADY_EXISTS/);
});
