const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-handover-assembler.mjs');

function presence(value = true) {
  return Object.fromEntries(['p6Gate', 'slo', 'alerting', 'backup', 'restore', 'certificate', 'onCall', 'maintenance', 'improvementQueue', 'operationsSignoff'].map((name) => [name, value]));
}

test('P6 완료 전에는 manifest 조립을 열지 않는다', async () => {
  const { evaluateOperationsHandoverAssembler } = await modulePromise;
  assert.equal(evaluateOperationsHandoverAssembler({ referencePresence: presence(), outputReferencePresent: true }).status, 'READY_WAIT_P6_COMPLETION_AND_HANDOVER_FILES');
});

test('P6 완료 뒤에도 P7 활성화 전에는 대기한다', async () => {
  const { evaluateOperationsHandoverAssembler } = await modulePromise;
  assert.equal(evaluateOperationsHandoverAssembler({ p6EvidenceComplete: true, referencePresence: presence(), outputReferencePresent: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력 10건과 output reference 누락을 정확히 보고한다', async () => {
  const { evaluateOperationsHandoverAssembler } = await modulePromise;
  const result = evaluateOperationsHandoverAssembler({ p6EvidenceComplete: true, p7InProgress: true, referencePresence: presence(false) });
  assert.equal(result.status, 'READY_WAIT_HANDOVER_EVIDENCE_FILES');
  assert.equal(result.missing.length, 11);
});

test('완전한 입력 dry-run은 파일을 만들지 않는다', async () => {
  const { evaluateOperationsHandoverAssembler } = await modulePromise;
  const result = evaluateOperationsHandoverAssembler({ p6EvidenceComplete: true, p7InProgress: true, referencePresence: presence(), outputReferencePresent: true });
  assert.equal(result.status, 'PASS_HANDOVER_ASSEMBLER_DRY_RUN_READY');
  assert.equal(result.manifestCreated, false);
});

test('execute에는 정확한 확인 문자열이 필요하다', async () => {
  const { evaluateOperationsHandoverAssembler, buildOperationsHandoverManifest } = await modulePromise;
  const base = { p6EvidenceComplete: true, p7InProgress: true, referencePresence: presence(), outputReferencePresent: true, execute: true };
  assert.equal(evaluateOperationsHandoverAssembler(base).status, 'READY_WAIT_HANDOVER_ASSEMBLY_CONFIRMATION');
  assert.equal(evaluateOperationsHandoverAssembler({ ...base, confirmed: true }).status, 'READY_HANDOVER_MANIFEST_ASSEMBLY');
  const references = Object.fromEntries(Object.keys(presence()).map((name) => [name, { path: `${name}.json`, sha256: 'a'.repeat(64) }]));
  const manifest = buildOperationsHandoverManifest({ references, documents: { operationsSignoff: { value: { signedByRef: 'identity://owner', signedAt: '2026-09-11T22:30:00+09:00' } } } });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.domains.slo.evidenceRef.path, 'slo.json');
});

test('manifest는 원자적으로 한 번만 쓰고 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsHandoverManifestOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-handover-manifest-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'actual.json');
  writeOperationsHandoverManifestOnce(outputPath, { schemaVersion: 2 }, { processId: 1234 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).schemaVersion, 2);
  assert.throws(() => writeOperationsHandoverManifestOnce(outputPath, { schemaVersion: 3 }, { processId: 1235 }), /OUTPUT_ALREADY_EXISTS/);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).schemaVersion, 2);
});
