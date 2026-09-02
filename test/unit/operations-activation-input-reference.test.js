const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readerModule = import('../../src/operations/operations-activation-input-reader.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-activation-input-'));
  const repositoryRoot = path.join(root, 'repository');
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(evidenceRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { repositoryRoot, evidenceRoot };
}

test('activation 승인 입력은 저장소 밖 physical JSON object의 actual bytes·SHA를 계산한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const file = path.join(evidenceRoot, 'approval.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, environment: 'production' }));

  const result = readOperationsActivationInputDocument(file, { repositoryRoot });

  assert.equal(result.value.schemaVersion, 1);
  assert.equal(result.bytes, fs.statSync(file).size);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.path, fs.realpathSync(file));
});

test('상대경로·저장소 내부·비 JSON·디렉터리를 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const inside = path.join(repositoryRoot, 'inside.json');
  const text = path.join(evidenceRoot, 'approval.txt');
  fs.writeFileSync(inside, '{}');
  fs.writeFileSync(text, '{}');

  for (const candidate of ['relative.json', inside, text, evidenceRoot]) {
    assert.throws(
      () => readOperationsActivationInputDocument(candidate, { repositoryRoot }),
      /OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID/
    );
  }
});

test('빈 파일·4MiB 초과 파일을 읽기 전에 거부한다', async (t) => {
  const { OPERATIONS_ACTIVATION_INPUT_MAX_BYTES, readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const empty = path.join(evidenceRoot, 'empty.json');
  const large = path.join(evidenceRoot, 'large.json');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(large, Buffer.alloc(OPERATIONS_ACTIVATION_INPUT_MAX_BYTES + 1, 0x20));

  for (const candidate of [empty, large]) {
    assert.throws(
      () => readOperationsActivationInputDocument(candidate, { repositoryRoot }),
      /OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID/
    );
  }
});

test('malformed JSON과 배열은 오류 원문 없이 거부한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const malformed = path.join(evidenceRoot, 'malformed.json');
  const array = path.join(evidenceRoot, 'array.json');
  fs.writeFileSync(malformed, '{secret-value');
  fs.writeFileSync(array, '[]');

  for (const candidate of [malformed, array]) {
    assert.throws(
      () => readOperationsActivationInputDocument(candidate, { repositoryRoot }),
      (error) => error.message === 'OPERATIONS_ACTIVATION_INPUT_JSON_INVALID'
    );
  }
});

test('존재하지 않는 파일과 symlink·reparse 참조를 구분해 차단한다', async (t) => {
  const { readOperationsActivationInputDocument } = await readerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  assert.throws(
    () => readOperationsActivationInputDocument(path.join(evidenceRoot, 'missing.json'), { repositoryRoot }),
    /OPERATIONS_ACTIVATION_INPUT_NOT_FOUND/
  );

  const target = path.join(evidenceRoot, 'target.json');
  const link = path.join(evidenceRoot, 'link.json');
  fs.writeFileSync(target, '{}');
  try {
    fs.symlinkSync(target, link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('Windows symlink 권한 없음');
    throw error;
  }
  assert.throws(
    () => readOperationsActivationInputDocument(link, { repositoryRoot }),
    /OPERATIONS_ACTIVATION_INPUT_REFERENCE_INVALID/
  );
});

test('실제 승인 request·manifest·preflight·orchestrator 진입점이 bounded reader를 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const entrypoints = [
    'scripts/operations-activation-approval-request.mjs',
    'scripts/operations-activation-approval-manifest.mjs',
    'scripts/operations-activation-approval-chain-preflight.mjs',
    'scripts/operations-activation-orchestrator.mjs'
  ];
  for (const relative of entrypoints) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /operations-activation-input-reader\.mjs/);
    assert.match(source, /readOperationsActivationInputDocument\(/);
  }
});
