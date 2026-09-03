const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-certificate-evidence.mjs');

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_TLS_CERTIFICATE_OBSERVATION',
    targetUrl: 'https://inventory.safe-link.co.kr',
    hostname: 'inventory.safe-link.co.kr',
    renewalOwnerRef: 'identity://operations-owner',
    certificateProviderRef: 'provider://cloudflare-managed-tls',
    observation: {
      observedAt: '2026-09-12T00:00:00.000Z',
      tlsValid: true,
      hostnameVerified: true,
      chainVerified: true,
      protocol: 'TLSv1.3',
      serialNumber: '01:23:45:67:89:AB:CD:EF',
      fingerprintSha256: 'b'.repeat(64),
      validFrom: '2026-09-01T00:00:00.000Z',
      validTo: '2026-12-31T00:00:00.000Z',
      healthStatus: 200,
      readinessStatus: 200
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 certificate 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsCertificateEvidenceCompiler } = await modulePromise;
  const refs = { inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsCertificateEvidenceCompiler(refs).status, 'READY_WAIT_P6_COMPLETION_AND_CERTIFICATE_OBSERVATION');
  assert.equal(evaluateOperationsCertificateEvidenceCompiler({ ...refs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsCertificateEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsCertificateEvidenceCompiler(active).missing, ['input', 'output']);
  const ready = { ...active, inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsCertificateEvidenceCompiler(ready).status, 'PASS_CERTIFICATE_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsCertificateEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_CERTIFICATE_EVIDENCE_CONFIRMATION');
});

test('최근 actual Production TLS 관측을 certificate 도메인 문서로 컴파일한다', async () => {
  const { compileOperationsCertificateEvidence } = await modulePromise;
  const result = compileOperationsCertificateEvidence(source(), { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_CERTIFICATE_EVIDENCE_COMPILED');
  assert.equal(result.evidence.metrics.hostname, 'inventory.safe-link.co.kr');
  assert.equal(result.evidence.metrics.tlsValid, true);
  assert.equal(result.evidence.metrics.daysRemaining, 110);
  assert.equal(result.evidence.provenance.observationAgeMinutes, 20);
});

test('template·staging·loopback·다른 hostname과 provenance 누락을 거부한다', async () => {
  const { compileOperationsCertificateEvidence } = await modulePromise;
  const result = compileOperationsCertificateEvidence(source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300', hostname: 'example.test', renewalOwnerRef: 'person', certificateProviderRef: 'cloudflare' }), { sourceSha256: 'x' });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /hostname must match Production/);
  assert.match(result.failures.join(','), /renewalOwnerRef/);
  assert.match(result.failures.join(','), /certificateProviderRef/);
});

test('TLS·hostname·chain·protocol·fingerprint·health 검증 누락을 거부한다', async () => {
  const { compileOperationsCertificateEvidence } = await modulePromise;
  const value = source();
  Object.assign(value.observation, { tlsValid: false, hostnameVerified: false, chainVerified: false, protocol: 'TLSv1.0', serialNumber: 'bad', fingerprintSha256: 'bad', healthStatus: 503, readinessStatus: 401 });
  const result = compileOperationsCertificateEvidence(value, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /TLS must be valid/);
  assert.match(result.failures.join(','), /hostname must be verified/);
  assert.match(result.failures.join(','), /chain must be verified/);
  assert.match(result.failures.join(','), /protocol/);
  assert.match(result.failures.join(','), /fingerprint/);
  assert.match(result.failures.join(','), /health and readiness/);
});

test('오래된 관측·미개시·만료·30일 미만 인증서를 거부한다', async () => {
  const { compileOperationsCertificateEvidence } = await modulePromise;
  const stale = source();
  stale.observation.observedAt = '2026-09-11T20:00:00.000Z';
  const staleResult = compileOperationsCertificateEvidence(stale, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(staleResult.failures.join(','), /within 60 minutes/);
  const invalid = source();
  invalid.observation.validFrom = '2026-09-13T00:00:00.000Z';
  invalid.observation.validTo = '2026-09-20T00:00:00.000Z';
  const invalidResult = compileOperationsCertificateEvidence(invalid, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(invalidResult.failures.join(','), /already be valid/);
  assert.match(invalidResult.failures.join(','), /at least 30 full days/);
  const expired = source();
  expired.observation.validTo = '2026-09-11T00:00:00.000Z';
  const expiredResult = compileOperationsCertificateEvidence(expired, { checkedAt: '2026-09-12T00:20:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(expiredResult.failures.join(','), /must not be expired/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsCertificateEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-certificate-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'certificate.json');
  writeOperationsCertificateEvidenceOnce(outputPath, { domain: 'certificate' }, { processId: 400 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).domain, 'certificate');
  assert.throws(() => writeOperationsCertificateEvidenceOnce(outputPath, { domain: 'other' }, { processId: 401 }), /OUTPUT_ALREADY_EXISTS/);
});
