const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/operations-improvement-queue-collector.mjs');

function attestation(overrides = {}) {
  return {
    schemaVersion: 1, environment: 'production', approved: true,
    repository: 'visionlab-coder/sqcm-i-inventory-system', label: 'operations',
    triageOwnerRef: 'identity://operations-owner', triageReceiptId: 'triage-receipt-20260912',
    lastTriagedAt: '2026-09-12T00:00:00.000Z', nextTriageAt: '2026-09-18T00:00:00.000Z',
    untrackedFindingCount: 0, ...overrides
  };
}

function issue(overrides = {}) {
  const metadata = {
    source: 'security', severity: 'P2', status: 'IN_PROGRESS',
    ownerRef: 'identity://security-owner', acceptanceRef: 'acceptance://issue-101',
    triagedAt: '2026-09-12T00:00:00.000Z', nextActionAt: '2026-09-20T00:00:00.000Z'
  };
  return {
    number: 101, state: 'open', created_at: '2026-09-10T00:00:00.000Z',
    labels: [{ name: 'operations' }, { name: 'source:security' }, { name: 'severity:P2' }, { name: 'status:IN_PROGRESS' }],
    body: `Human text is untrusted.\n<!-- SQCM_I_OPERATIONS_ITEM ${JSON.stringify(metadata)} -->`,
    ...overrides
  };
}

test('P6 actual·P7 활성화·Production GO 전에는 GitHub read와 write를 열지 않는다', async () => {
  const { evaluateImprovementQueueCollectionGate } = await modulePromise;
  for (const input of [{}, { p6EvidenceComplete: true }, { p6EvidenceComplete: true, p7InProgress: true }]) {
    const result = evaluateImprovementQueueCollectionGate(input);
    assert.equal(result.githubReadAllowed, false);
    assert.equal(result.localEvidenceWriteAllowed, false);
    assert.equal(result.secretReadAllowed, false);
  }
});

test('token·attestation·output·execute·exact confirmation을 fail-closed한다', async () => {
  const { evaluateImprovementQueueCollectionGate } = await modulePromise;
  const active = { p6EvidenceComplete: true, p7InProgress: true, productionGo: true };
  assert.deepEqual(evaluateImprovementQueueCollectionGate(active).missing, ['githubReadCredentialOrAnonymousApproval', 'triageAttestation', 'output']);
  const ready = { ...active, tokenReferencePresent: true, attestationPresent: true, outputConfigured: true };
  assert.equal(evaluateImprovementQueueCollectionGate(ready).status, 'PASS_IMPROVEMENT_QUEUE_COLLECTION_DRY_RUN_READY');
  assert.equal(evaluateImprovementQueueCollectionGate({ ...ready, execute: true }).status, 'READY_WAIT_IMPROVEMENT_QUEUE_COLLECTION_CONFIRMATION');
  assert.equal(evaluateImprovementQueueCollectionGate({ ...ready, execute: true, confirmed: true }).githubReadAllowed, true);
});

test('공개 repository는 token 대신 명시적 anonymous read mode를 허용하고 secret read를 열지 않는다', async () => {
  const { evaluateImprovementQueueCollectionGate } = await modulePromise;
  const ready = {
    p6EvidenceComplete: true,
    p7InProgress: true,
    productionGo: true,
    anonymousPublicReadApproved: true,
    attestationPresent: true,
    outputConfigured: true,
    execute: true,
    confirmed: true
  };
  const result = evaluateImprovementQueueCollectionGate(ready);
  assert.equal(result.status, 'READY_COLLECT_PRODUCTION_IMPROVEMENT_QUEUE');
  assert.equal(result.githubReadAllowed, true);
  assert.equal(result.secretReadAllowed, false);
});

test('triage attestation은 승인·책임자·최근/다음 7일·미추적 0건을 요구한다', async () => {
  const { validateImprovementQueueTriageAttestation } = await modulePromise;
  assert.equal(validateImprovementQueueTriageAttestation(attestation(), { checkedAt: '2026-09-12T01:00:00.000Z' }).approved, true);
  assert.throws(() => validateImprovementQueueTriageAttestation(attestation({ approved: false, untrackedFindingCount: 1, nextTriageAt: '2026-10-01T00:00:00.000Z' }), { checkedAt: '2026-09-12T01:00:00.000Z' }), /approved.*untrackedFindingCount.*nextTriageAtWindow/);
});

test('고정 labels와 단일 JSON metadata만 compiler 호환 Issue item으로 파싱한다', async () => {
  const { parseOperationsIssue } = await modulePromise;
  const item = parseOperationsIssue(issue());
  assert.equal(item.issueRef, 'github://visionlab-coder/sqcm-i-inventory-system/issues/101');
  assert.equal(item.status, 'IN_PROGRESS');
});

test('PR·중복 metadata·label 불일치·BLOCKED blocker 누락을 거부한다', async () => {
  const { parseOperationsIssue } = await modulePromise;
  assert.throws(() => parseOperationsIssue(issue({ pull_request: { url: 'x' } })), /pullRequest/);
  const duplicate = issue();
  duplicate.body += duplicate.body.match(/<!--[\s\S]+-->/)[0];
  assert.throws(() => parseOperationsIssue(duplicate), /metadataBlock/);
  const blocked = issue({ labels: [{ name: 'operations' }, { name: 'source:security' }, { name: 'severity:P2' }, { name: 'status:BLOCKED' }] });
  blocked.body = blocked.body.replace('"status":"IN_PROGRESS"', '"status":"BLOCKED"');
  assert.throws(() => parseOperationsIssue(blocked), /blockerRef/);
});

test('GitHub export는 정렬·count를 고정하고 원자적으로 한 번만 쓴다', async (t) => {
  const { buildImprovementQueueExport, writeImprovementQueueExportOnce } = await modulePromise;
  const { compileOperationsImprovementQueueEvidence } = await import('../../src/operations/operations-improvement-queue-evidence.mjs');
  const exportValue = buildImprovementQueueExport({ issues: [issue({ number: 102 }), issue()], attestation: attestation(), exportedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(exportValue.queue.openItemCount, 2);
  assert.match(exportValue.queue.items[0].issueRef, /101$/);
  assert.equal(compileOperationsImprovementQueueEvidence(exportValue, { checkedAt: '2026-09-12T01:00:00.000Z', sourceSha256: 'a'.repeat(64) }).status, 'PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILED');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-improvement-collector-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'queue.json');
  writeImprovementQueueExportOnce(output, exportValue, { processId: 700 });
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).queue.openItemCount, 2);
  assert.throws(() => writeImprovementQueueExportOnce(output, exportValue, { processId: 701 }), /OUTPUT_ALREADY_EXISTS/);
});

test('GitHub page response는 Content-Length 1MiB 초과를 body read 전에 차단한다', async () => {
  const { readBoundedGitHubIssuePage, GITHUB_ISSUE_PAGE_MAX_BYTES } = await modulePromise;
  const response = new Response('[]', { headers: { 'content-length': String(GITHUB_ISSUE_PAGE_MAX_BYTES + 1) } });
  await assert.rejects(readBoundedGitHubIssuePage(response), /GITHUB_ISSUE_RESPONSE_TOO_LARGE/);
});

test('chunked GitHub page도 actual bytes 1MiB를 넘으면 즉시 차단한다', async () => {
  const { readBoundedGitHubIssuePage, GITHUB_ISSUE_PAGE_MAX_BYTES } = await modulePromise;
  const response = new Response(new Uint8Array(GITHUB_ISSUE_PAGE_MAX_BYTES + 1));
  await assert.rejects(readBoundedGitHubIssuePage(response), /GITHUB_ISSUE_RESPONSE_TOO_LARGE/);
});

test('GitHub page는 fatal UTF-8과 JSON array만 허용한다', async () => {
  const { readBoundedGitHubIssuePage } = await modulePromise;
  await assert.rejects(readBoundedGitHubIssuePage(new Response(Uint8Array.from([0xc3, 0x28]))), /GITHUB_ISSUE_RESPONSE_INVALID_UTF8/);
  await assert.rejects(readBoundedGitHubIssuePage(new Response('{"not":"array"}')), /GITHUB_ISSUE_RESPONSE_INVALID/);
  await assert.rejects(readBoundedGitHubIssuePage(new Response('[invalid]')), /GITHUB_ISSUE_RESPONSE_INVALID/);
  assert.deepEqual(await readBoundedGitHubIssuePage(new Response('[{"number":1}]')), [{ number: 1 }]);
});

test('collector 진입점은 response.json 대신 bounded page reader만 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/operations-improvement-queue-collector.mjs'), 'utf8');
  assert.match(source, /readBoundedGitHubIssuePage/);
  assert.doesNotMatch(source, /response\.json\(\)/);
});
