const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const modulePromise = import('../../src/operations/harness-candidate-content-snapshot.mjs');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-candidate-content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'export const b = 2;\n');
  const files = ['src/a.js', 'src/b.js'].map((relativePath) => ({
    path: relativePath,
    sha256: sha256(fs.readFileSync(path.join(root, ...relativePath.split('/'))))
  }));
  return { root, files };
}

test('candidate content는 각 physical file을 한 번 읽은 동일 snapshot으로 hash한다', async (t) => {
  const { readHarnessCandidateContentSnapshot } = await modulePromise;
  const { root, files } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  const result = readHarnessCandidateContentSnapshot(root, files, { io });

  assert.equal(reads, 2);
  assert.deepEqual(result.entries.map(({ path: relativePath, sha256: digest }) => ({ path: relativePath, sha256: digest })), files);
  assert.equal(result.totalBytes, 40);
});

test('경로 이탈과 중복은 content read 전에 거부한다', async (t) => {
  const { readHarnessCandidateContentSnapshot } = await modulePromise;
  const { root, files } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.throws(
    () => readHarnessCandidateContentSnapshot(root, [{ path: '../outside', sha256: 'a'.repeat(64) }], { io }),
    /HARNESS_CANDIDATE_CONTENT_PATH_INVALID/
  );
  assert.throws(
    () => readHarnessCandidateContentSnapshot(root, [files[0], files[0]], { io }),
    /HARNESS_CANDIDATE_CONTENT_PATH_DUPLICATE/
  );
  assert.equal(reads, 0);
});

test('per-file 및 aggregate 크기 초과는 content read 전에 거부한다', async (t) => {
  const { readHarnessCandidateContentSnapshot } = await modulePromise;
  const { root, files } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.throws(
    () => readHarnessCandidateContentSnapshot(root, files, { io, maxFileBytes: 19, maxTotalBytes: 100 }),
    /HARNESS_CANDIDATE_CONTENT_FILE_SIZE_INVALID/
  );
  assert.throws(
    () => readHarnessCandidateContentSnapshot(root, files, { io, maxFileBytes: 20, maxTotalBytes: 39 }),
    /HARNESS_CANDIDATE_CONTENT_TOTAL_SIZE_INVALID/
  );
  assert.equal(reads, 0);
});

test('첫 파일 read 뒤 다른 파일이 바뀌면 혼합 snapshot을 거부한다', async (t) => {
  const { readHarnessCandidateContentSnapshot } = await modulePromise;
  const { root, files } = fixture(t);
  const first = path.join(root, 'src', 'a.js');
  const second = path.join(root, 'src', 'b.js');
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(first)) {
      fs.writeFileSync(second, 'export const b = 3;\n');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(second, future, future);
    }
    return bytes;
  };

  assert.throws(
    () => readHarnessCandidateContentSnapshot(root, files, { io }),
    /HARNESS_CANDIDATE_CONTENT_UNSTABLE/
  );
});

test('goal harness fallback은 direct unbounded read 대신 candidate snapshot을 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'goal-harness.mjs'), 'utf8');
  assert.match(source, /readHarnessCandidateContentSnapshot/);
  assert.doesNotMatch(source, /readFileSync\(absolutePath\)/);
});
