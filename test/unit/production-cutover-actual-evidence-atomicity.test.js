const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-cutover-actual-evidence.mjs');

function fixture(t, raw = '{"runId":"22222222-2222-4222-8222-222222222222"}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-assembly-atomic-'));
  const repositoryRoot = path.join(root, 'repository');
  const receiptRoot = path.join(root, 'receipts');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(receiptRoot);
  const file = path.join(receiptRoot, 'receipt.json');
  fs.writeFileSync(file, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, receiptRoot, file };
}

test('actual cutover assembly input은 read 중 size 변경을 거부한다', async (t) => {
  const { loadJsonDocument } = await modulePromise;
  const { repositoryRoot, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ');
    return raw;
  };
  assert.throws(() => loadJsonDocument(file, { repositoryRoot, io }), /ACTUAL_EVIDENCE_INPUT_UNSTABLE/);
});

test('actual cutover assembly input은 read 중 같은 크기 교체를 거부한다', async (t) => {
  const { loadJsonDocument } = await modulePromise;
  const original = '{"value":"original"}\n';
  const replacementRaw = '{"value":"replaced"}\n';
  assert.equal(Buffer.byteLength(original), Buffer.byteLength(replacementRaw));
  const { repositoryRoot, receiptRoot, file } = fixture(t, original);
  const replacement = path.join(receiptRoot, 'replacement.json');
  fs.writeFileSync(replacement, replacementRaw);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(file);
    fs.renameSync(replacement, file);
    return raw;
  };
  assert.throws(() => loadJsonDocument(file, { repositoryRoot, io }), /ACTUAL_EVIDENCE_INPUT_UNSTABLE/);
});

test('actual cutover assembly input은 invalid UTF-8을 fatal decode로 거부한다', async (t) => {
  const { loadJsonDocument } = await modulePromise;
  const { repositoryRoot, file } = fixture(t, Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
  assert.throws(() => loadJsonDocument(file, { repositoryRoot }), /ACTUAL_EVIDENCE_INPUT_UTF8_INVALID/);
});

test('cutover receipt root redirect는 run document assembly를 중단한다', async (t) => {
  const { loadRunReceiptDocuments } = await modulePromise;
  const { root, repositoryRoot, receiptRoot } = fixture(t);
  let receiptRootCalls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(receiptRoot)) {
      receiptRootCalls += 1;
      return receiptRootCalls === 1 ? receiptRoot : path.join(root, 'redirected-receipts');
    }
    return fs.realpathSync(candidate);
  };
  assert.throws(
    () => loadRunReceiptDocuments(receiptRoot, '22222222-2222-4222-8222-222222222222', { repositoryRoot, io }),
    /CUTOVER_RECEIPT_ROOT_UNSTABLE/
  );
});

test('저장소 내부와 caller maxBytes 초과 assembly input을 읽기 전에 거부한다', async (t) => {
  const { loadJsonDocument } = await modulePromise;
  const { repositoryRoot, file } = fixture(t);
  const inside = path.join(repositoryRoot, 'inside.json');
  fs.writeFileSync(inside, '{}');
  assert.throws(() => loadJsonDocument(inside, { repositoryRoot }), /ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID/);
  assert.throws(() => loadJsonDocument(file, { repositoryRoot, maxBytes: 8 }), /ACTUAL_EVIDENCE_INPUT_REFERENCE_INVALID/);
});
