const test = require('node:test');
const assert = require('node:assert/strict');
const finalizerModule = import('../../src/operations/operations-handover-finalizer.mjs');

function actualEvidence() {
  const domains = {};
  for (const name of ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue']) {
    domains[name] = { status: 'PASS', evidenceRef: `evidence://production/${name}` };
  }
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    p6Gate: { status: 'PASS', evidenceRef: 'evidence://production/p6-cutover' },
    domains,
    operationsSignoff: {
      status: 'APPROVED',
      evidenceRef: 'evidence://production/operations-signoff',
      signedByRef: 'identity://operations-owner',
      signedAt: '2026-09-11T22:30:00+09:00'
    }
  };
}

test('8개 운영 영역과 P6·서명의 실제 Production 증거만 PASS한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const result = validateActualOperationsHandoverEvidence(actualEvidence());
  assert.equal(result.status, 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE');
  assert.equal(result.requiredDomainCount, 8);
  assert.equal(result.p7CompletionReady, true);
});

test('template 증거를 거부한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.template = true;
  const result = validateActualOperationsHandoverEvidence(evidence);
  assert.equal(result.status, 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID');
});

test('staging·loopback·baseline provenance를 거부한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.domains.alerting.evidenceRef = 'evidence://staging/loopback-baseline';
  const result = validateActualOperationsHandoverEvidence(evidence);
  assert.match(result.failures.join(','), /alerting/);
  assert.equal(result.p7CompletionReady, false);
});

test('운영 책임자 서명과 P6 실제 전환 증거를 강제한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const evidence = actualEvidence();
  evidence.p6Gate.status = 'PENDING';
  evidence.operationsSignoff.signedByRef = 'plain-name';
  const result = validateActualOperationsHandoverEvidence(evidence);
  assert.equal(result.status, 'BLOCKED_ACTUAL_HANDOVER_EVIDENCE_INVALID');
  assert.equal(result.failures.length, 2);
});
