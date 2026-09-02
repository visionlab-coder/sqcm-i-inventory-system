const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readerModule = import('../../src/operations/operations-activation-input-reader.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-secret-input-'));
  const repositoryRoot = path.join(root, 'repository');
  const secretRoot = path.join(root, 'secrets');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(secretRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { repositoryRoot, secretRoot };
}

test('Secret 입력은 저장소 밖 physical UTF-8 파일을 64KiB 이하로 읽는다', async (t) => {
  const { readOperationsSecretInput } = await readerModule;
  const { repositoryRoot, secretRoot } = fixture(t);
  const file = path.join(secretRoot, 'provider.token');
  fs.writeFileSync(file, 'a'.repeat(32) + '\r\n');

  const result = readOperationsSecretInput(file, { repositoryRoot });

  assert.equal(result.value, 'a'.repeat(32));
  assert.equal(result.bytes, fs.statSync(file).size);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.path, fs.realpathSync(file));
});

test('Secret 입력은 상대경로·저장소 내부·빈 파일·64KiB 초과를 거부한다', async (t) => {
  const { OPERATIONS_SECRET_INPUT_MAX_BYTES, readOperationsSecretInput } = await readerModule;
  const { repositoryRoot, secretRoot } = fixture(t);
  const inside = path.join(repositoryRoot, 'inside.token');
  const empty = path.join(secretRoot, 'empty.token');
  const large = path.join(secretRoot, 'large.token');
  fs.writeFileSync(inside, 'a'.repeat(32));
  fs.writeFileSync(empty, '');
  fs.writeFileSync(large, Buffer.alloc(OPERATIONS_SECRET_INPUT_MAX_BYTES + 1, 0x61));

  for (const candidate of ['relative.token', inside, empty, large, secretRoot]) {
    assert.throws(() => readOperationsSecretInput(candidate, { repositoryRoot }), /OPERATIONS_SECRET_INPUT_/);
  }
});

test('Secret 입력은 invalid UTF-8과 symlink·reparse 참조를 원문 없이 거부한다', async (t) => {
  const { readOperationsSecretInput } = await readerModule;
  const { repositoryRoot, secretRoot } = fixture(t);
  const invalid = path.join(secretRoot, 'invalid.token');
  fs.writeFileSync(invalid, Buffer.from([0xff, 0xfe, 0xfd]));
  assert.throws(
    () => readOperationsSecretInput(invalid, { repositoryRoot }),
    (error) => error.message === 'OPERATIONS_SECRET_INPUT_VALUE_INVALID'
  );

  const target = path.join(secretRoot, 'target.token');
  const link = path.join(secretRoot, 'link.token');
  fs.writeFileSync(target, 'a'.repeat(32));
  try { fs.symlinkSync(target, link, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('Windows symlink 권한 없음');
    throw error;
  }
  assert.throws(() => readOperationsSecretInput(link, { repositoryRoot }), /OPERATIONS_SECRET_INPUT_REFERENCE_INVALID/);
});

test('경보·온콜·개선큐 runner는 Secret 파일을 공통 bounded reader로 읽는다', () => {
  const root = path.resolve(__dirname, '..', '..');
  for (const relative of [
    'scripts/operations-alert-delivery-runner.mjs',
    'scripts/operations-oncall-drill-runner.mjs',
    'scripts/operations-improvement-queue-collector.mjs'
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /readOperationsSecretInput\(/);
    assert.doesNotMatch(source, /fs\.readFileSync\((?:credentialPath|tokenPath)/);
  }
});
