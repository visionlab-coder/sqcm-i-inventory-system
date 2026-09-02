const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimePromise = import('../../src/operations/operations-preflight-manifest-runtime.mjs');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-operations-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('relative physical JSON manifest를 actual bytes와 resolved path로 읽는다', async (t) => {
  const { readOperationsPreflightManifest } = await runtimePromise;
  const directory = temporaryDirectory(t);
  const file = path.join(directory, 'operations.json');
  fs.writeFileSync(file, '{"template":true}', 'utf8');
  const result = readOperationsPreflightManifest('operations.json', { cwd: directory });
  assert.deepEqual(result.value, { template: true });
  assert.equal(result.path, fs.realpathSync(file));
  assert.equal(result.bytes, fs.statSync(file).size);
});

test('빈 파일과 1MiB 초과 파일을 content read 전에 거부한다', async (t) => {
  const { readOperationsPreflightManifest, OPERATIONS_PREFLIGHT_MANIFEST_MAX_BYTES } = await runtimePromise;
  const directory = temporaryDirectory(t);
  const empty = path.join(directory, 'empty.json');
  const oversized = path.join(directory, 'oversized.json');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(oversized, Buffer.alloc(OPERATIONS_PREFLIGHT_MANIFEST_MAX_BYTES + 1, 0x20));
  await assert.rejects(async () => readOperationsPreflightManifest(empty), /OPERATIONS_PREFLIGHT_MANIFEST_EMPTY/);
  await assert.rejects(async () => readOperationsPreflightManifest(oversized), /OPERATIONS_PREFLIGHT_MANIFEST_TOO_LARGE/);
});

test('invalid UTF-8·malformed JSON·array root를 원문 없이 거부한다', async (t) => {
  const { readOperationsPreflightManifest } = await runtimePromise;
  const directory = temporaryDirectory(t);
  const invalidUtf8 = path.join(directory, 'invalid-utf8.json');
  const malformed = path.join(directory, 'malformed.json');
  const array = path.join(directory, 'array.json');
  fs.writeFileSync(invalidUtf8, Buffer.from([0xc3, 0x28]));
  fs.writeFileSync(malformed, '{secret-value');
  fs.writeFileSync(array, '[]');
  assert.throws(() => readOperationsPreflightManifest(invalidUtf8), /OPERATIONS_PREFLIGHT_MANIFEST_INVALID_UTF8/);
  assert.throws(() => readOperationsPreflightManifest(malformed), /OPERATIONS_PREFLIGHT_MANIFEST_INVALID_JSON_OBJECT/);
  assert.throws(() => readOperationsPreflightManifest(array), /OPERATIONS_PREFLIGHT_MANIFEST_INVALID_JSON_OBJECT/);
});

test('symlink/reparse 또는 realpath redirect manifest를 read 전에 거부한다', async () => {
  const { readOperationsPreflightManifest } = await runtimePromise;
  let readCount = 0;
  const io = {
    lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false, size: 2 }),
    realpathSync: () => 'D:\\redirected\\operations.json',
    readFileSync: () => { readCount += 1; return Buffer.from('{}'); }
  };
  assert.throws(
    () => readOperationsPreflightManifest('D:\\expected\\operations.json', { io }),
    /OPERATIONS_PREFLIGHT_MANIFEST_NOT_PHYSICAL/
  );
  assert.equal(readCount, 0);
});

test('operations preflight 진입점은 bounded manifest reader만 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/operations-preflight.mjs'), 'utf8');
  assert.match(source, /readOperationsPreflightManifest/);
  assert.doesNotMatch(source, /fs\.readFileSync\(resolved,\s*['"]utf8['"]\)/);
  assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync/);
});
