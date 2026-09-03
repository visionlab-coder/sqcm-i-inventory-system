const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readerModule = import('../../src/operations/operations-activation-input-reader.mjs');

function fixture(t, raw = '{"schemaVersion":1}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-activation-input-atomic-'));
  const repositoryRoot = path.join(root, 'repository');
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(evidenceRoot);
  const file = path.join(evidenceRoot, 'approval.json');
  fs.writeFileSync(file, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, evidenceRoot, file };
}

test('external JSON input은 read 중 파일 size가 변하면 snapshot을 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ', 'utf8');
    return raw;
  };

  assert.throws(
    () => readOperationsActivationInputDocument(file, { repositoryRoot, io }),
    /OPERATIONS_ACTIVATION_INPUT_UNSTABLE/
  );
});

test('external JSON input은 read 중 같은 크기 파일로 교체되면 identity 변화를 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot, file } = fixture(t);
  const replacement = path.join(evidenceRoot, 'replacement.json');
  fs.writeFileSync(replacement, '{"schemaVersion":2}\n');
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(file);
    fs.renameSync(replacement, file);
    return raw;
  };

  assert.throws(
    () => readOperationsActivationInputDocument(file, { repositoryRoot, io }),
    /OPERATIONS_ACTIVATION_INPUT_UNSTABLE/
  );
});

test('external JSON input은 read 중 repository realpath가 바뀌면 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { root, repositoryRoot, file } = fixture(t);
  let repositoryRealpathCalls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(repositoryRoot)) {
      repositoryRealpathCalls += 1;
      return repositoryRealpathCalls === 1 ? repositoryRoot : path.join(root, 'redirected-repository');
    }
    return fs.realpathSync(candidate);
  };

  assert.throws(
    () => readOperationsActivationInputDocument(file, { repositoryRoot, io }),
    /OPERATIONS_ACTIVATION_INPUT_UNSTABLE/
  );
});

test('external JSON input은 치환 가능한 invalid UTF-8도 fatal decode로 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const invalidJsonUtf8 = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
  const { repositoryRoot, file } = fixture(t, invalidJsonUtf8);

  assert.throws(
    () => readOperationsActivationInputDocument(file, { repositoryRoot }),
    /OPERATIONS_ACTIVATION_INPUT_UTF8_INVALID/
  );
});

test('정상 external JSON snapshot은 root와 file을 read 전후 각각 재검증한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, file } = fixture(t);
  let lstatCalls = 0;
  let realpathCalls = 0;
  const io = Object.create(fs);
  io.lstatSync = (...args) => { lstatCalls += 1; return fs.lstatSync(...args); };
  io.realpathSync = (...args) => { realpathCalls += 1; return fs.realpathSync(...args); };

  const result = readOperationsActivationInputDocument(file, { repositoryRoot, io });

  assert.equal(result.value.schemaVersion, 1);
  assert.equal(lstatCalls, 4);
  assert.equal(realpathCalls, 4);
});
