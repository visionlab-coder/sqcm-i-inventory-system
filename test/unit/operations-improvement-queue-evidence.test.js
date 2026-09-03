const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-improvement-queue-evidence.mjs');

function source(overrides = {}) {
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_IMPROVEMENT_QUEUE_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    queue: {
      provider: 'GITHUB_ISSUES',
      repository: 'visionlab-coder/sqcm-i-inventory-system',
      queueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues?label=operations',
      triageOwnerRef: 'identity://operations-triage-owner',
      triageReceiptId: 'triage-receipt-20260912',
      exportedAt: '2026-09-12T00:30:00.000Z',
      lastTriagedAt: '2026-09-12T00:00:00.000Z',
      nextTriageAt: '2026-09-19T00:00:00.000Z',
      untrackedFindingCount: 0,
      openItemCount: 2,
      items: [
        {
          issueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues/101',
          source: 'security', severity: 'P2', status: 'IN_PROGRESS',
          ownerRef: 'identity://security-owner', acceptanceRef: 'acceptance://issue-101',
          createdAt: '2026-09-10T00:00:00.000Z', triagedAt: '2026-09-12T00:00:00.000Z', nextActionAt: '2026-09-20T00:00:00.000Z'
        },
        {
          issueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues/102',
          source: 'user_feedback', severity: 'P3', status: 'TODO',
          ownerRef: 'identity://product-owner', acceptanceRef: 'acceptance://issue-102',
          createdAt: '2026-09-11T00:00:00.000Z', triagedAt: '2026-09-12T00:00:00.000Z', nextActionAt: '2026-09-25T00:00:00.000Z'
        }
      ]
    },
    ...overrides
  };
}

test('P6 완료와 P7 활성화 전에는 improvement queue 컴파일을 열지 않는다', async () => {
  const { evaluateOperationsImprovementQueueEvidenceCompiler } = await modulePromise;
  const refs = { inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsImprovementQueueEvidenceCompiler(refs).status, 'READY_WAIT_P6_COMPLETION_AND_IMPROVEMENT_QUEUE_EXPORT');
  assert.equal(evaluateOperationsImprovementQueueEvidenceCompiler({ ...refs, p6EvidenceComplete: true }).status, 'READY_WAIT_P7_ACTIVATION');
});

test('입력·출력 누락과 dry-run·확인 문자열을 fail-closed한다', async () => {
  const { evaluateOperationsImprovementQueueEvidenceCompiler } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true };
  assert.deepEqual(evaluateOperationsImprovementQueueEvidenceCompiler(active).missing, ['input', 'output']);
  const ready = { ...active, inputPresent: true, outputPresent: true };
  assert.equal(evaluateOperationsImprovementQueueEvidenceCompiler(ready).status, 'PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILER_DRY_RUN_READY');
  assert.equal(evaluateOperationsImprovementQueueEvidenceCompiler({ ...ready, execute: true }).status, 'READY_WAIT_IMPROVEMENT_QUEUE_EVIDENCE_CONFIRMATION');
});

test('실제 triage된 운영 개선 큐를 improvementQueue 문서로 컴파일한다', async () => {
  const { compileOperationsImprovementQueueEvidence } = await modulePromise;
  const result = compileOperationsImprovementQueueEvidence(source(), { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.equal(result.status, 'PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILED');
  assert.deepEqual(result.evidence.metrics, {
    queueRef: 'github://visionlab-coder/sqcm-i-inventory-system/issues?label=operations',
    triageOwnerRef: 'identity://operations-triage-owner'
  });
  assert.equal(result.evidence.provenance.openItemCount, 2);
});

test('template·staging·loopback·다른 provider와 저장소를 거부한다', async () => {
  const { compileOperationsImprovementQueueEvidence } = await modulePromise;
  const value = source({ template: true, environment: 'staging', targetUrl: 'http://127.0.0.1:3300' });
  value.queue.provider = 'LOCAL_FILE';
  value.queue.repository = 'other/repo';
  value.queue.queueRef = 'file://queue.json';
  const result = compileOperationsImprovementQueueEvidence(value, { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /template must be false/);
  assert.match(result.failures.join(','), /environment must be production/);
  assert.match(result.failures.join(','), /targetUrl must match Production/);
  assert.match(result.failures.join(','), /provider must be GITHUB_ISSUES/);
  assert.match(result.failures.join(','), /repository mismatch/);
  assert.match(result.failures.join(','), /queueRef/);
});

test('운영자·receipt·최근 triage·다음 일정·미추적 finding을 강제한다', async () => {
  const { compileOperationsImprovementQueueEvidence } = await modulePromise;
  const value = source();
  value.queue.triageOwnerRef = 'person';
  value.queue.triageReceiptId = 'short';
  value.queue.exportedAt = '2026-09-01T00:00:00.000Z';
  value.queue.lastTriagedAt = '2026-09-01T00:00:00.000Z';
  value.queue.nextTriageAt = '2026-10-01T00:00:00.000Z';
  value.queue.untrackedFindingCount = 1;
  const result = compileOperationsImprovementQueueEvidence(value, { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /triageOwnerRef/);
  assert.match(result.failures.join(','), /triageReceiptId/);
  assert.match(result.failures.join(','), /last 24 hours/);
  assert.match(result.failures.join(','), /last 7 days/);
  assert.match(result.failures.join(','), /within 7 days/);
  assert.match(result.failures.join(','), /must be zero/);
});

test('count·중복 issue·분류·담당자·수용조건·기한·blocker를 검증한다', async () => {
  const { compileOperationsImprovementQueueEvidence } = await modulePromise;
  const value = source();
  value.queue.openItemCount = 3;
  value.queue.items[1].issueRef = value.queue.items[0].issueRef;
  value.queue.items[0].source = 'other';
  value.queue.items[0].severity = 'HIGH';
  value.queue.items[0].status = 'BLOCKED';
  value.queue.items[0].ownerRef = 'person';
  value.queue.items[0].acceptanceRef = 'text';
  value.queue.items[0].triagedAt = '2026-09-01T00:00:00.000Z';
  value.queue.items[0].nextActionAt = '2027-01-01T00:00:00.000Z';
  const result = compileOperationsImprovementQueueEvidence(value, { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) });
  assert.match(result.failures.join(','), /openItemCount/);
  assert.match(result.failures.join(','), /issueRefs must be unique/);
  assert.match(result.failures.join(','), /source is invalid/);
  assert.match(result.failures.join(','), /severity is invalid/);
  assert.match(result.failures.join(','), /ownerRef/);
  assert.match(result.failures.join(','), /acceptanceRef/);
  assert.match(result.failures.join(','), /triage must follow creation/);
  assert.match(result.failures.join(','), /within 30 days/);
  assert.match(result.failures.join(','), /requires blockerRef/);
});

test('증거는 원자적으로 한 번만 쓰며 기존 파일을 덮어쓰지 않는다', async (t) => {
  const { writeOperationsImprovementQueueEvidenceOnce } = await modulePromise;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-improvement-queue-evidence-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'improvement-queue.json');
  writeOperationsImprovementQueueEvidenceOnce(outputPath, { domain: 'improvementQueue' }, { processId: 700 });
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).domain, 'improvementQueue');
  assert.throws(() => writeOperationsImprovementQueueEvidenceOnce(outputPath, { domain: 'other' }, { processId: 701 }), /OUTPUT_ALREADY_EXISTS/);
});
