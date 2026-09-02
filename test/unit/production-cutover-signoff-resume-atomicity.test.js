const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-cutover-signoff-resume.mjs');

function fixture(t, raw = '{"schemaVersion":1,"runId":"11111111-1111-4111-8111-111111111111"}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-resume-atomic-'));
  const repositoryRoot = path.join(root, 'repository');
  const externalRoot = path.join(root, 'external');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(externalRoot);
  const checkpoint = path.join(externalRoot, 'run.checkpoint');
  fs.writeFileSync(checkpoint, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, externalRoot, checkpoint };
}

test('signoff checkpoint는 read 중 size 변경을 거부한다', async (t) => {
  const { loadSignoffPauseCheckpoint } = await modulePromise;
  const { repositoryRoot, checkpoint } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(checkpoint, ' ');
    return raw;
  };
  assert.throws(() => loadSignoffPauseCheckpoint(checkpoint, { repositoryRoot, io }), /SIGNOFF_CHECKPOINT_UNSTABLE/);
});

test('signoff checkpoint는 read 중 같은 크기 교체를 거부한다', async (t) => {
  const { loadSignoffPauseCheckpoint } = await modulePromise;
  const original = '{"value":"original"}\n';
  const replacementRaw = '{"value":"replaced"}\n';
  assert.equal(Buffer.byteLength(original), Buffer.byteLength(replacementRaw));
  const { repositoryRoot, externalRoot, checkpoint } = fixture(t, original);
  const replacement = path.join(externalRoot, 'replacement.checkpoint');
  fs.writeFileSync(replacement, replacementRaw);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(checkpoint);
    fs.renameSync(replacement, checkpoint);
    return raw;
  };
  assert.throws(() => loadSignoffPauseCheckpoint(checkpoint, { repositoryRoot, io }), /SIGNOFF_CHECKPOINT_UNSTABLE/);
});

test('signoff checkpoint는 invalid UTF-8을 fatal decode로 거부한다', async (t) => {
  const { loadSignoffPauseCheckpoint } = await modulePromise;
  const { repositoryRoot, checkpoint } = fixture(t, Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
  assert.throws(() => loadSignoffPauseCheckpoint(checkpoint, { repositoryRoot }), /SIGNOFF_CHECKPOINT_UTF8_INVALID/);
});

test('signoff checkpoint는 repository redirect를 거부한다', async (t) => {
  const { loadSignoffPauseCheckpoint } = await modulePromise;
  const { root, repositoryRoot, checkpoint } = fixture(t);
  let calls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(repositoryRoot)) {
      calls += 1;
      return calls === 1 ? repositoryRoot : path.join(root, 'redirected-repository');
    }
    return fs.realpathSync(candidate);
  };
  assert.throws(() => loadSignoffPauseCheckpoint(checkpoint, { repositoryRoot, io }), /SIGNOFF_CHECKPOINT_UNSTABLE/);
});

test('pre-signoff receipt root redirect는 atomic snapshot 실패로 판정한다', async (t) => {
  const { validateSignoffResumeReceipts } = await modulePromise;
  const { root, repositoryRoot, externalRoot } = fixture(t);
  const receiptRoot = path.join(externalRoot, 'receipts');
  fs.mkdirSync(receiptRoot);
  fs.writeFileSync(path.join(receiptRoot, 'receipt.json'), '{"runId":"11111111-1111-4111-8111-111111111111"}');
  let calls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(receiptRoot)) {
      calls += 1;
      return calls === 1 ? receiptRoot : path.join(root, 'redirected-receipts');
    }
    return fs.realpathSync(candidate);
  };
  const result = validateSignoffResumeReceipts({
    root: receiptRoot,
    checkpoint: { runId: '11111111-1111-4111-8111-111111111111', completedGates: [] },
    repositoryRoot,
    io
  });
  assert.equal(result.status, 'FAIL_SIGNOFF_RESUME_RECEIPTS');
  assert.deepEqual(result.failures, ['RECEIPT_ATOMIC_SNAPSHOT_INVALID']);
});
