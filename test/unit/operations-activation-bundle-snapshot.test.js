const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-orchestrator.mjs');

async function fixture(t) {
  const { OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-bundle-snapshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [index, relativePath] of OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS.entries()) {
    const output = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `export const marker${index} = ${index};\n`, 'utf8');
  }
  return { root, entrypoints: OPERATIONS_ACTIVATION_BUNDLE_ENTRYPOINTS };
}

test('activation bundle graph와 digest는 파일당 한 번 읽은 동일 snapshot에서 생성된다', async (t) => {
  const { inspectOperationsActivationBundle } = await modulePromise;
  const { root, entrypoints } = await fixture(t);
  let readCount = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    readCount += 1;
    return fs.readFileSync(...args);
  };

  const result = inspectOperationsActivationBundle(root, { io });

  assert.deepEqual(result.files, [...entrypoints].sort());
  assert.equal(readCount, result.files.length);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.totalBytes > 0);
});

test('activation bundle은 4MiB 초과 단일 파일을 읽기 전에 거부한다', async (t) => {
  const {
    OPERATIONS_ACTIVATION_BUNDLE_FILE_MAX_BYTES,
    inspectOperationsActivationBundle
  } = await modulePromise;
  const { root, entrypoints } = await fixture(t);
  fs.writeFileSync(path.join(root, ...entrypoints[0].split('/')), Buffer.alloc(OPERATIONS_ACTIVATION_BUNDLE_FILE_MAX_BYTES + 1, 0x20));

  assert.throws(
    () => inspectOperationsActivationBundle(root),
    /OPERATIONS_ACTIVATION_BUNDLE_FILE_SIZE_INVALID/
  );
});

test('activation bundle은 64MiB 이내라도 호출자가 더 낮춘 aggregate 상한을 지킨다', async (t) => {
  const { inspectOperationsActivationBundle } = await modulePromise;
  const { root } = await fixture(t);

  assert.throws(
    () => inspectOperationsActivationBundle(root, { maxTotalBytes: 128 }),
    /OPERATIONS_ACTIVATION_BUNDLE_TOTAL_SIZE_INVALID/
  );
});

test('activation bundle은 read 중 파일 identity·size 변화가 생기면 snapshot을 거부한다', async (t) => {
  const { readOperationsActivationBundleSnapshotFile } = await modulePromise;
  const { root, entrypoints } = await fixture(t);
  const candidate = path.join(root, ...entrypoints[0].split('/'));
  let changed = false;
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const bytes = fs.readFileSync(...args);
    if (!changed) {
      changed = true;
      fs.appendFileSync(candidate, 'changed\n', 'utf8');
    }
    return bytes;
  };

  assert.throws(
    () => readOperationsActivationBundleSnapshotFile(candidate, { projectRoot: root, io }),
    /OPERATIONS_ACTIVATION_BUNDLE_FILE_UNSTABLE/
  );
});

test('activation bundle source는 invalid UTF-8과 root 밖 경로를 거부한다', async (t) => {
  const { readOperationsActivationBundleSnapshotFile } = await modulePromise;
  const { root, entrypoints } = await fixture(t);
  const candidate = path.join(root, ...entrypoints[0].split('/'));
  fs.writeFileSync(candidate, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readOperationsActivationBundleSnapshotFile(candidate, { projectRoot: root }),
    /OPERATIONS_ACTIVATION_BUNDLE_FILE_UTF8_INVALID/
  );

  const outside = path.join(path.dirname(root), 'outside-bundle.mjs');
  fs.writeFileSync(outside, 'export {};\n', 'utf8');
  t.after(() => fs.rmSync(outside, { force: true }));
  assert.throws(
    () => readOperationsActivationBundleSnapshotFile(outside, { projectRoot: root }),
    /OPERATIONS_ACTIVATION_BUNDLE_PATH_INVALID/
  );
});

test('bundle digest CLI는 graph와 digest를 별도 재조회하지 않고 단일 inspect 결과를 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'operations-activation-bundle-digest.mjs'), 'utf8');
  assert.match(source, /inspectOperationsActivationBundle/);
  assert.doesNotMatch(source, /resolveOperationsActivationBundleFiles/);
  assert.doesNotMatch(source, /computeOperationsActivationBundleSha256/);
});
