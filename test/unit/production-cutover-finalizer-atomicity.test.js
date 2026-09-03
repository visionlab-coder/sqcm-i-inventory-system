const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const finalizerModule = import('../../src/operations/production-cutover-finalizer.mjs');

function fixture(t, raw = '{"template":false}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-atomic-'));
  const repositoryRoot = path.join(root, 'repository');
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(evidenceRoot);
  const file = path.join(evidenceRoot, 'actual.json');
  fs.writeFileSync(file, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, evidenceRoot, file };
}

test('actual cutover evidence는 read 중 size가 변하면 snapshot을 거부한다', async (t) => {
  const { readActualCutoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ', 'utf8');
    return raw;
  };

  assert.throws(
    () => readActualCutoverEvidenceFile(file, { repositoryRoot, io }),
    /ACTUAL_CUTOVER_EVIDENCE_UNSTABLE/
  );
});

test('actual cutover evidence는 read 중 같은 크기 파일 교체를 거부한다', async (t) => {
  const { readActualCutoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot, file } = fixture(t);
  const replacement = path.join(evidenceRoot, 'replacement.json');
  fs.writeFileSync(replacement, '{"template":true }\n');
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(file);
    fs.renameSync(replacement, file);
    return raw;
  };

  assert.throws(
    () => readActualCutoverEvidenceFile(file, { repositoryRoot, io }),
    /ACTUAL_CUTOVER_EVIDENCE_UNSTABLE/
  );
});

test('actual cutover evidence는 read 중 repository redirect를 거부한다', async (t) => {
  const { readActualCutoverEvidenceFile } = await finalizerModule;
  const { root, repositoryRoot, file } = fixture(t);
  let calls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(repositoryRoot)) {
      calls += 1;
      return calls === 1 ? repositoryRoot : path.join(root, 'redirected-repository');
    }
    return fs.realpathSync(candidate);
  };

  assert.throws(
    () => readActualCutoverEvidenceFile(file, { repositoryRoot, io }),
    /ACTUAL_CUTOVER_EVIDENCE_UNSTABLE/
  );
});

test('actual cutover JSON은 invalid UTF-8을 fatal decode로 거부한다', async (t) => {
  const { readActualCutoverEvidenceFile } = await finalizerModule;
  const invalidJsonUtf8 = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
  const { repositoryRoot, file } = fixture(t, invalidJsonUtf8);

  assert.throws(
    () => readActualCutoverEvidenceFile(file, { repositoryRoot }),
    /ACTUAL_CUTOVER_EVIDENCE_UTF8_INVALID/
  );
});
