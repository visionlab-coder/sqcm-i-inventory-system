const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readerModule = import('../../src/operations/operations-activation-state-reader.mjs');
const orchestratorModule = import('../../src/operations/operations-activation-orchestrator.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function approval(overrides = {}) {
  return {
    runId: 'p7-activation-20261012-001',
    releaseSha: 'a'.repeat(40),
    approvedAt: '2026-10-12T00:00:00.000Z',
    ...overrides
  };
}

test('activation state reader는 physical JSON object의 bounded actual bytes를 읽는다', async (t) => {
  const { readOperationsActivationStateDocument } = await readerModule;
  const root = fixture(t);
  const file = path.join(root, '.operations-activation-root.json');
  fs.writeFileSync(file, '{"schemaVersion":2}\n', 'utf8');

  const result = readOperationsActivationStateDocument(file, {
    expectedDirectory: root,
    expectedBasename: '.operations-activation-root.json'
  });

  assert.equal(result.value.schemaVersion, 2);
  assert.equal(result.bytes, fs.statSync(file).size);
  assert.equal(result.path, fs.realpathSync(file));
});

test('activation state reader는 empty·oversize·malformed·array를 원문 없이 거부한다', async (t) => {
  const {
    OPERATIONS_ACTIVATION_STATE_MAX_BYTES,
    readOperationsActivationStateDocument
  } = await readerModule;
  const root = fixture(t);
  const cases = [
    ['empty.json', ''],
    ['oversize.json', Buffer.alloc(OPERATIONS_ACTIVATION_STATE_MAX_BYTES + 1, 0x20)],
    ['malformed.json', '{sensitive-state'],
    ['array.json', '[]']
  ];

  for (const [name, content] of cases) {
    const file = path.join(root, name);
    fs.writeFileSync(file, content);
    assert.throws(
      () => readOperationsActivationStateDocument(file, { expectedDirectory: root, expectedBasename: name }),
      (error) => error.message === 'OPERATIONS_ACTIVATION_STATE_INVALID'
    );
  }
});

test('activation state reader는 basename 이탈·디렉터리·symlink를 차단한다', async (t) => {
  const { readOperationsActivationStateDocument } = await readerModule;
  const root = fixture(t);
  const file = path.join(root, 'state.json');
  fs.writeFileSync(file, '{}');

  assert.throws(
    () => readOperationsActivationStateDocument(file, { expectedDirectory: root, expectedBasename: 'other.json' }),
    /OPERATIONS_ACTIVATION_STATE_INVALID/
  );
  assert.throws(
    () => readOperationsActivationStateDocument(root, { expectedDirectory: root, expectedBasename: path.basename(root) }),
    /OPERATIONS_ACTIVATION_STATE_INVALID/
  );

  const link = path.join(root, 'state-link.json');
  try {
    fs.symlinkSync(file, link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('Windows symlink 권한 없음');
    throw error;
  }
  assert.throws(
    () => readOperationsActivationStateDocument(link, { expectedDirectory: root, expectedBasename: 'state-link.json' }),
    /OPERATIONS_ACTIVATION_STATE_INVALID/
  );
});

test('receipt root claim 재사용은 64KiB 초과 valid JSON을 거부한다', async (t) => {
  const {
    claimOperationsActivationReceiptRoot,
    operationsActivationApprovalSha256
  } = await orchestratorModule;
  const root = fixture(t);
  const activationApproval = approval();
  const runIdSha256 = require('node:crypto').createHash('sha256').update(activationApproval.runId).digest('hex');
  const claim = {
    schemaVersion: 2,
    runIdSha256,
    releaseSha: activationApproval.releaseSha,
    approvalSha256: operationsActivationApprovalSha256(activationApproval),
    claimedAt: '2026-10-12T00:00:00.000Z',
    secretValuesRecorded: false,
    padding: 'x'.repeat(70 * 1024)
  };
  fs.writeFileSync(path.join(root, '.operations-activation-root.json'), JSON.stringify(claim));

  assert.throws(
    () => claimOperationsActivationReceiptRoot(root, activationApproval),
    /OPERATIONS_ACTIVATION_RECEIPT_ROOT_CLAIM_INVALID/
  );
});

test('lease release는 64KiB 초과 valid JSON을 삭제하지 않는다', async (t) => {
  const {
    acquireOperationsActivationLease,
    releaseOperationsActivationLease
  } = await orchestratorModule;
  const root = fixture(t);
  const lease = acquireOperationsActivationLease(root, approval(), {
    processId: 1701,
    checkedAt: '2026-10-12T00:00:00.000Z',
    leaseId: 'lease-bounded-state-0001'
  });
  const document = JSON.parse(fs.readFileSync(lease.path, 'utf8'));
  fs.writeFileSync(lease.path, JSON.stringify({ ...document, padding: 'x'.repeat(70 * 1024) }));

  assert.throws(
    () => releaseOperationsActivationLease(lease),
    /OPERATIONS_ACTIVATION_LEASE_INVALID/
  );
  assert.equal(fs.existsSync(lease.path), true);
});

test('오케스트레이터 claim·lease 재읽기는 bounded state reader만 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'src', 'operations', 'operations-activation-orchestrator.mjs'), 'utf8');
  assert.match(source, /operations-activation-state-reader\.mjs/);
  assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync\((claimPath|lease\.path)/);
});
