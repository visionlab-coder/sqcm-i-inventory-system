const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-slo-evidence.mjs');

function source(overrides = {}) {
  const start = Date.parse('2026-09-12T00:00:00.000Z');
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    measurementType: 'PRODUCTION_HTTPS_MONITORING_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    measurementStart: '2026-09-12T00:00:00.000Z',
    measurementEnd: '2026-10-12T00:00:00.000Z',
    samples: Array.from({ length: 30 }, (_, index) => ({
      timestamp: new Date(start + index * 24 * 60 * 60 * 1000).toISOString(),
      available: true,
      latencyMs: 100 + index
    })),
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 실제 SLO 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsSloEvidenceCompiler } = await modulePromise;
  assert.equal(evaluateOperationsSloEvidenceCompiler({ inputPresent: true, outputPresent: true }).status, 'READY_WAIT_P6_COMPLETION_AND_SLO_INPUT');
  assert.equal(evaluateOperationsSloEvidenceCompiler({ p6EvidenceComplete: true, inputPresent: true, outputPresent: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsSloEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsSloEvidenceCompiler(active).missing, ['input', 'output']);
  assert.equal(evaluateOperationsSloEvidenceCompiler({ ...active, inputPresent: true, outputPresent: true }).status, 'PASS_SLO_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsSloEvidenceCompiler({ ...active, inputPresent: true, outputPresent: true, execute: true }).status, 'READY_WAIT_SLO_EVIDENCE_CONFIRMATION');
});

test('30일 Production 측정에서 가용성과 p95를 직접 계산한다', async () => {
  const { compileOperationsSloEvidence } = await modulePromise;
  const result = compileOperationsSloEvidence(source(), { checkedAt: '2026-10-12T00:01:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_SLO_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.metrics, { availabilityPercent: 100, p95Ms: 128, measurementWindowDays: 30, sampleCount: 30 });
  assert.equal(result.evidence.provenance.targetUrl, 'https://inventory.safe-link.co.kr');
});

test('staging·짧은 기간·불충분한 날짜 커버리지를 거부한다', async () => {
  const { compileOperationsSloEvidence } = await modulePromise;
  const base = source();
  const value = source({ environment: 'staging', measurementEnd: '2026-09-20T00:00:00.000Z', samples: base.samples.slice(0, 8) });
  const result = compileOperationsSloEvidence(value, { sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /environment/);
  assert.match(result.failures.join(','), /30 days/);
  assert.match(result.failures.join(','), /distinct UTC dates/);
});

test('계약 template과 다른 측정 유형을 actual 증거로 승격하지 않는다', async () => {
  const { compileOperationsSloEvidence } = await modulePromise;
  const result = compileOperationsSloEvidence(source({ template: true, measurementType: 'LOOPBACK_TEST' }), { sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /measurementType mismatch/);
});

test('SLO 임계치 미달과 중복·무효 샘플을 거부한다', async () => {
  const { compileOperationsSloEvidence } = await modulePromise;
  const value = source();
  value.samples[0].available = false;
  value.samples[1].timestamp = value.samples[2].timestamp;
  value.samples[3].latencyMs = 1500;
  value.samples[4].latencyMs = 1500;
  value.samples[5].latencyMs = 1500;
  const result = compileOperationsSloEvidence(value, { sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /availability target/);
  assert.match(result.failures.join(','), /timestamps must be unique/);
  assert.match(result.failures.join(','), /p95 target/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsSloEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-slo-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'slo.json');
  writeOperationsSloEvidenceOnce(outputPath, { schemaVersion: 1 }, { processId: 100 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).schemaVersion, 1);
  assert.throws(() => writeOperationsSloEvidenceOnce(outputPath, { schemaVersion: 2 }, { processId: 101 }), /OUTPUT_ALREADY_EXISTS/);
});
