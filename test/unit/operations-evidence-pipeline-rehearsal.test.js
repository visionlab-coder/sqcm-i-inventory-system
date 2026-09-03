const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-evidence-pipeline-rehearsal.mjs');

test('8개 compiler 출력과 서명·assembler·finalizer가 종단 호환된다', async () => {
  const { runOperationsEvidencePipelineRehearsal } = await modulePromise;
  const result = runOperationsEvidencePipelineRehearsal();
  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_EVIDENCE_PIPELINE_REHEARSAL');
  assert.equal(result.compilerCount, 8);
  assert.equal(result.domainCount, 8);
  assert.equal(result.verifiedDocumentCount, 10);
  assert.equal(result.manifestSchemaVersion, 2);
});

test('리허설 결과는 실제 증거와 Production GO로 승격되지 않는다', async () => {
  const { runOperationsEvidencePipelineRehearsal } = await modulePromise;
  const result = runOperationsEvidencePipelineRehearsal();
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.actualEvidenceCreated, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});

test('manifest 조립 뒤 단일 도메인 파일 변조를 SHA 검증이 차단한다', async () => {
  const { runOperationsEvidencePipelineRehearsal } = await modulePromise;
  const result = runOperationsEvidencePipelineRehearsal({ tamperDomain: 'backup' });
  assert.equal(result.status, 'BLOCKED_SYNTHETIC_OPERATIONS_EVIDENCE_PIPELINE_REHEARSAL');
  assert.match(result.failures.join(','), /backup evidence sha256 mismatch/);
});

test('성공·차단 리허설 모두 임시 디렉터리를 남기지 않는다', async (t) => {
  const { runOperationsEvidencePipelineRehearsal } = await modulePromise;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-rehearsal-root-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  runOperationsEvidencePipelineRehearsal({ tempRoot });
  runOperationsEvidencePipelineRehearsal({ tempRoot, tamperDomain: 'certificate' });
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});
