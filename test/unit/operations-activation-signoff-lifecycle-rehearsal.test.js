const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-signoff-lifecycle-rehearsal.mjs');

test('같은 release와 target으로 19단계 활성화부터 10문서 운영 인수까지 연결한다', async () => {
  const { runOperationsActivationSignoffLifecycleRehearsal } = await modulePromise;
  const result = runOperationsActivationSignoffLifecycleRehearsal({
    activationBundleSha256: 'a'.repeat(64),
    releaseSha: 'b'.repeat(40),
    targetUrl: 'https://inventory.safe-link.co.kr'
  });

  assert.equal(result.status, 'PASS_SYNTHETIC_OPERATIONS_ACTIVATION_SIGNOFF_LIFECYCLE_REHEARSAL');
  assert.equal(result.releaseProvenanceMatched, true);
  assert.equal(result.targetProvenanceMatched, true);
  assert.equal(result.activationStepCount, 19);
  assert.equal(result.activationSequenceComplete, true);
  assert.equal(result.handoverVerifiedDocumentCount, 10);
  assert.equal(result.syntheticOnly, true);
  assert.equal(result.actualActivationExecuted, false);
  assert.equal(result.actualEvidenceCreated, false);
  assert.equal(result.externalMutationPerformed, false);
  assert.equal(result.productionGo, false);
});

test('release 또는 target 경계 변조를 fail closed 한다', async () => {
  const { runOperationsActivationSignoffLifecycleRehearsal } = await modulePromise;
  const releaseTamper = runOperationsActivationSignoffLifecycleRehearsal({
    activationBundleSha256: 'c'.repeat(64),
    releaseSha: 'd'.repeat(40),
    targetUrl: 'https://inventory.safe-link.co.kr',
    tamperBoundary: 'release'
  });
  const targetTamper = runOperationsActivationSignoffLifecycleRehearsal({
    activationBundleSha256: 'e'.repeat(64),
    releaseSha: 'f'.repeat(40),
    targetUrl: 'https://inventory.safe-link.co.kr',
    tamperBoundary: 'target'
  });

  assert.equal(releaseTamper.status, 'BLOCKED_SYNTHETIC_OPERATIONS_ACTIVATION_SIGNOFF_LIFECYCLE_REHEARSAL');
  assert.deepEqual(releaseTamper.failures, ['RELEASE_PROVENANCE_MISMATCH']);
  assert.equal(targetTamper.status, 'BLOCKED_SYNTHETIC_OPERATIONS_ACTIVATION_SIGNOFF_LIFECYCLE_REHEARSAL');
  assert.deepEqual(targetTamper.failures, ['TARGET_PROVENANCE_MISMATCH']);
});

test('통합 리허설은 임시 산출물과 실제 변경을 남기지 않는다', async (t) => {
  const { runOperationsActivationSignoffLifecycleRehearsal } = await modulePromise;
  const temporaryBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-lifecycle-test-'));
  t.after(() => fs.rmSync(temporaryBase, { recursive: true, force: true }));

  const result = runOperationsActivationSignoffLifecycleRehearsal({
    activationBundleSha256: '1'.repeat(64),
    releaseSha: '2'.repeat(40),
    targetUrl: 'https://inventory.safe-link.co.kr',
    temporaryBase
  });

  assert.deepEqual(fs.readdirSync(temporaryBase), []);
  assert.equal(result.temporaryArtifactsRetained, false);
  assert.equal(result.secretValuesReadOrRecorded, false);
});

test('Goal Harness는 P6와 P7 검증 봉투에서 통합 리허설을 실행한다', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/goal-harness.mjs'), 'utf8');
  const occurrences = source.match(/operations:activation-signoff-lifecycle-rehearsal/g) ?? [];
  assert.equal(occurrences.length, 2);
});
