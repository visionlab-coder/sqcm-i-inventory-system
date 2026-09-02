const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/harness-release-evidence-control-snapshot.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-harness-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'agent docs', 'harness');
  fs.mkdirSync(directory, { recursive: true });
  const candidate = path.join(directory, 'P2_RELEASE_CANDIDATE.json');
  const remote = path.join(directory, 'P2_REMOTE_EVIDENCE.json');
  fs.writeFileSync(candidate, '{"candidateFileCount":1,"files":[{"path":"a.js","sha256":null}]}\n');
  fs.writeFileSync(remote, '{"commit":"0123456789012345678901234567890123456789"}\n');
  return { root, candidate, remote };
}

test('release provenance control은 candidate와 remote evidence를 각각 한 번 읽는다', async (t) => {
  const { readHarnessReleaseEvidenceControlSnapshot } = await modulePromise;
  const { root } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  const result = readHarnessReleaseEvidenceControlSnapshot(root, { io });

  assert.equal(reads, 2);
  assert.equal(result.candidate.value.candidateFileCount, 1);
  assert.equal(result.remoteEvidence.value.commit.length, 40);
  assert.match(result.candidate.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.remoteEvidence.sha256, /^[a-f0-9]{64}$/);
});

test('candidate read 뒤 remote evidence가 바뀌면 혼합 snapshot을 거부한다', async (t) => {
  const { readHarnessReleaseEvidenceControlSnapshot } = await modulePromise;
  const { root, candidate, remote } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(candidate)) {
      fs.writeFileSync(remote, '{"commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(remote, future, future);
    }
    return bytes;
  };
  assert.throws(
    () => readHarnessReleaseEvidenceControlSnapshot(root, { io }),
    /HARNESS_RELEASE_EVIDENCE_CONTROL_UNSTABLE/
  );
});

test('1MiB 초과 release control은 content read 전에 거부한다', async (t) => {
  const { HARNESS_RELEASE_EVIDENCE_CONTROL_MAX_BYTES, readHarnessReleaseEvidenceControlSnapshot } = await modulePromise;
  const { root, remote } = fixture(t);
  fs.writeFileSync(remote, Buffer.alloc(HARNESS_RELEASE_EVIDENCE_CONTROL_MAX_BYTES + 1, 0x20));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  assert.throws(
    () => readHarnessReleaseEvidenceControlSnapshot(root, { io }),
    /HARNESS_RELEASE_EVIDENCE_CONTROL_SIZE_INVALID/
  );
  assert.equal(reads, 0);
});

test('invalid UTF-8과 JSON array release control을 거부한다', async (t) => {
  const { readHarnessReleaseEvidenceControlSnapshot } = await modulePromise;
  const { root, candidate, remote } = fixture(t);
  fs.writeFileSync(candidate, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readHarnessReleaseEvidenceControlSnapshot(root),
    /HARNESS_RELEASE_EVIDENCE_CONTROL_UTF8_INVALID/
  );
  fs.writeFileSync(candidate, '{"files":[]}\n');
  fs.writeFileSync(remote, '[]\n');
  assert.throws(
    () => readHarnessReleaseEvidenceControlSnapshot(root),
    /HARNESS_RELEASE_EVIDENCE_CONTROL_JSON_INVALID/
  );
});

test('goal harness는 P2 release provenance를 bounded atomic snapshot으로 읽는다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'goal-harness.mjs'), 'utf8');
  assert.match(source, /readHarnessReleaseEvidenceControlSnapshot/);
  assert.doesNotMatch(source, /JSON\.parse\(readFileSync\(candidatePath/);
  assert.doesNotMatch(source, /JSON\.parse\(readFileSync\(remoteEvidencePath/);
});
