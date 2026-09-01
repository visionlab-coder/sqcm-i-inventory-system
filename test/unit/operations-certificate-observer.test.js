const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-certificate-observer.mjs');

const completeGate = {
  p6EvidenceComplete: true,
  p7InProgress: true,
  productionGo: true,
  outputPresent: true,
  renewalOwnerRef: 'identity://operations-owner',
  certificateProviderRef: 'provider://cloudflare-managed-tls',
  execute: true,
  confirmed: true
};

test('P6 actual 완료와 P7 활성화·Production GO 전에는 TLS probe와 write를 열지 않는다', async () => {
  const { evaluateOperationsCertificateObserverGate } = await modulePromise;
  const beforeP6 = evaluateOperationsCertificateObserverGate({ ...completeGate, p6EvidenceComplete: false });
  assert.equal(beforeP6.status, 'READY_WAIT_P6_ACTUAL_CUTOVER');
  assert.equal(beforeP6.externalHttpReadAllowed, false);
  assert.equal(beforeP6.localEvidenceWriteAllowed, false);

  const beforeP7 = evaluateOperationsCertificateObserverGate({ ...completeGate, p7InProgress: false });
  assert.equal(beforeP7.status, 'READY_WAIT_P7_ACTIVATION');
  assert.equal(beforeP7.externalHttpReadAllowed, false);

  const noGo = evaluateOperationsCertificateObserverGate({ ...completeGate, productionGo: false });
  assert.equal(noGo.status, 'READY_WAIT_PRODUCTION_GO');
  assert.equal(noGo.localEvidenceWriteAllowed, false);
});

test('출력·책임자·공급자·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateOperationsCertificateObserverGate } = await modulePromise;
  const missing = evaluateOperationsCertificateObserverGate({ p6EvidenceComplete: true, p7InProgress: true, productionGo: true });
  assert.deepEqual(missing.missing, ['output', 'renewalOwnerRef', 'certificateProviderRef']);
  assert.equal(missing.status, 'READY_WAIT_CERTIFICATE_OBSERVATION_INPUTS');

  const dryRun = evaluateOperationsCertificateObserverGate({ ...completeGate, execute: false });
  assert.equal(dryRun.status, 'PASS_CERTIFICATE_OBSERVER_DRY_RUN_READY');
  assert.equal(dryRun.externalHttpReadAllowed, false);

  const unconfirmed = evaluateOperationsCertificateObserverGate({ ...completeGate, confirmed: false });
  assert.equal(unconfirmed.status, 'READY_WAIT_CERTIFICATE_OBSERVATION_CONFIRMATION');
  assert.equal(unconfirmed.externalHttpReadAllowed, false);
});

test('검증된 exact Production TLS와 health/readiness만 compiler 입력으로 정규화한다', async () => {
  const { buildCertificateObservation } = await modulePromise;
  const result = buildCertificateObservation({
    hostname: 'inventory.safe-link.co.kr',
    targetUrl: 'https://inventory.safe-link.co.kr',
    observedAt: '2026-09-12T00:00:00.000Z',
    authorized: true,
    peerConsistent: true,
    protocol: 'TLSv1.3',
    serialNumber: '01:23:45:67:89:AB:CD:EF',
    fingerprint256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    validFrom: 'Sep  1 00:00:00 2026 GMT',
    validTo: 'Dec 31 00:00:00 2026 GMT',
    healthStatus: 200,
    readinessStatus: 200,
    renewalOwnerRef: 'identity://operations-owner',
    certificateProviderRef: 'provider://cloudflare-managed-tls'
  });
  assert.equal(result.evidenceType, 'PRODUCTION_TLS_CERTIFICATE_OBSERVATION');
  assert.equal(result.observation.fingerprintSha256, 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899');
  assert.equal(result.observation.hostnameVerified, true);
  assert.equal(result.observation.chainVerified, true);
});

test('다른 host·검증 실패·비허용 TLS·비200 endpoint를 거부한다', async () => {
  const { buildCertificateObservation } = await modulePromise;
  const base = {
    hostname: 'inventory.safe-link.co.kr', targetUrl: 'https://inventory.safe-link.co.kr',
    observedAt: '2026-09-12T00:00:00.000Z', authorized: true, peerConsistent: true, protocol: 'TLSv1.3',
    serialNumber: '01:23:45:67:89:AB:CD:EF', fingerprint256: 'AA:'.repeat(31) + 'AA',
    validFrom: 'Sep  1 00:00:00 2026 GMT', validTo: 'Dec 31 00:00:00 2026 GMT',
    healthStatus: 200, readinessStatus: 200,
    renewalOwnerRef: 'identity://operations-owner', certificateProviderRef: 'provider://cloudflare-managed-tls'
  };
  for (const patch of [
    { hostname: 'staging.safe-link.co.kr' },
    { authorized: false },
    { peerConsistent: false },
    { protocol: 'TLSv1.0' },
    { healthStatus: 503 },
    { readinessStatus: 401 }
  ]) assert.throws(() => buildCertificateObservation({ ...base, ...patch }), /CERTIFICATE_OBSERVATION_INVALID/);
});

test('관측 파일은 원자적으로 한 번만 쓰고 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeCertificateObservationOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-certificate-observer-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'observation.json');
  writeCertificateObservationOnce(outputPath, { hostname: 'inventory.safe-link.co.kr' }, { processId: 501 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).hostname, 'inventory.safe-link.co.kr');
  assert.throws(() => writeCertificateObservationOnce(outputPath, { hostname: 'other' }, { processId: 502 }), /OUTPUT_ALREADY_EXISTS/);
});
