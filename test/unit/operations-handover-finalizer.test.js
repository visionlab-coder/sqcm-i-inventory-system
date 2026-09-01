const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const finalizerModule = import('../../src/operations/operations-handover-finalizer.mjs');

const sha = 'a'.repeat(64);
const checkedAt = '2026-09-11T22:30:00+09:00';

function reference(path) {
  return { path, sha256: sha };
}

function domainMetrics(name) {
  const values = {
    slo: { availabilityPercent: 99.9, p95Ms: 250, measurementWindowDays: 30, sampleCount: 50 },
    alerting: { signals: ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'].map((id) => ({ id, received: true, receiptId: `receipt-${id}` })) },
    backup: { offsite: true, checksumVerified: true, ageMinutes: 30 },
    restore: { isolatedTarget: true, rowCountsMatch: true, rtoMinutes: 40 },
    certificate: { hostname: 'inventory.safe-link.co.kr', tlsValid: true, daysRemaining: 80 },
    onCall: { primaryOwnerRef: 'identity://primary-owner', escalationOwnerRef: 'identity://escalation-owner' },
    maintenance: { contractRef: 'docs/maintenance.md', executionPassed: true, executedAt: checkedAt },
    improvementQueue: { queueRef: 'github://issues/operations', triageOwnerRef: 'identity://triage-owner' }
  };
  return values[name];
}

function actualEvidenceBundle() {
  const domains = {};
  const documents = {
    p6Gate: { actualSha256: sha, value: { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P6_CUTOVER_ACTUAL', domain: 'p6-cutover', status: 'PASS', checkedAt, productionGo: true, targetUrl: 'https://inventory.safe-link.co.kr', releaseSha: 'b'.repeat(40) } },
    operationsSignoff: { actualSha256: sha, value: { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_SIGNOFF_ACTUAL', domain: 'operations-signoff', status: 'APPROVED', checkedAt, signedByRef: 'identity://operations-owner', signedAt: checkedAt } }
  };
  for (const name of ['slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue']) {
    domains[name] = { status: 'PASS', evidenceRef: reference(`${name}.json`) };
    documents[name] = { actualSha256: sha, value: { schemaVersion: 1, environment: 'production', activationState: 'actual', evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL', domain: name, status: 'PASS', checkedAt, metrics: domainMetrics(name) } };
  }
  return {
    evidence: {
      schemaVersion: 2,
      template: false,
      environment: 'production',
      activationState: 'actual',
      p6Gate: { status: 'PASS', evidenceRef: reference('p6-cutover.json') },
      domains,
      operationsSignoff: { status: 'APPROVED', evidenceRef: reference('operations-signoff.json'), signedByRef: 'identity://operations-owner', signedAt: checkedAt }
    },
    documents
  };
}

test('10개 실제 파일·SHA와 도메인 측정값이 모두 맞아야 PASS한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const bundle = actualEvidenceBundle();
  const result = validateActualOperationsHandoverEvidence(bundle.evidence, { documents: bundle.documents });
  assert.equal(result.status, 'PASS_ACTUAL_OPERATIONS_HANDOVER_EVIDENCE');
  assert.equal(result.verifiedDocumentCount, 10);
  assert.equal(result.p7CompletionReady, true);
});

test('문자열-only 참조와 존재하지 않는 파일은 거부한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const bundle = actualEvidenceBundle();
  bundle.evidence.domains.alerting.evidenceRef = 'evidence://production/alerting';
  bundle.documents.backup = { loadError: 'missing' };
  const result = validateActualOperationsHandoverEvidence(bundle.evidence, { documents: bundle.documents });
  assert.match(result.failures.join(','), /alerting evidence reference/);
  assert.match(result.failures.join(','), /backup evidence file/);
});

test('파일 SHA 변조와 staging provenance를 거부한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const bundle = actualEvidenceBundle();
  bundle.documents.restore.actualSha256 = 'c'.repeat(64);
  bundle.documents.certificate.value.environment = 'staging';
  const result = validateActualOperationsHandoverEvidence(bundle.evidence, { documents: bundle.documents });
  assert.match(result.failures.join(','), /restore evidence sha256 mismatch/);
  assert.match(result.failures.join(','), /certificate evidence environment/);
});

test('도메인 임계치와 운영 책임자 서명 일치를 강제한다', async () => {
  const { validateActualOperationsHandoverEvidence } = await finalizerModule;
  const bundle = actualEvidenceBundle();
  bundle.documents.slo.value.metrics.p95Ms = 1500;
  bundle.documents.operationsSignoff.value.signedByRef = 'identity://different-owner';
  const result = validateActualOperationsHandoverEvidence(bundle.evidence, { documents: bundle.documents });
  assert.match(result.failures.join(','), /slo metrics/);
  assert.match(result.failures.join(','), /signoff identity/);
  assert.equal(result.p7CompletionReady, false);
});

test('실제 상대경로 JSON 파일의 SHA를 계산하고 누락 파일은 차단한다', async (t) => {
  const { loadActualOperationsEvidenceDocument } = await finalizerModule;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-handover-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const raw = Buffer.from(JSON.stringify({ schemaVersion: 1, environment: 'production' }));
  fs.writeFileSync(path.join(tempDir, 'evidence.json'), raw);
  const loaded = loadActualOperationsEvidenceDocument({ path: 'evidence.json' }, { baseDir: tempDir });
  assert.equal(loaded.actualSha256, crypto.createHash('sha256').update(raw).digest('hex'));
  assert.equal(loaded.value.environment, 'production');
  assert.match(loadActualOperationsEvidenceDocument({ path: 'missing.json' }, { baseDir: tempDir }).loadError, /missing/);
});
