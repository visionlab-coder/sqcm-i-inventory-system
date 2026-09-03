const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-handover-preflight-control-snapshot.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-handover-control-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'agent docs', 'harness');
  fs.mkdirSync(directory, { recursive: true });
  const candidate = path.join(directory, 'P7_OPERATIONS_HANDOVER_PREFLIGHT_CANDIDATE.json');
  const roadmap = path.join(directory, 'MASTER_ROADMAP.json');
  fs.writeFileSync(candidate, '{"schemaVersion":1,"productionGo":false}\n', 'utf8');
  fs.writeFileSync(roadmap, '{"phases":[],"invariants":{"productionGo":false}}\n', 'utf8');
  return { root, candidate, roadmap };
}

test('handover control snapshot은 exact candidate와 roadmap을 각각 한 번 읽는다', async (t) => {
  const { readOperationsHandoverPreflightControlSnapshot } = await modulePromise;
  const { root } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  const result = readOperationsHandoverPreflightControlSnapshot(root, { io });

  assert.equal(reads, 2);
  assert.equal(result.candidate.value.schemaVersion, 1);
  assert.deepEqual(result.roadmap.value.phases, []);
  assert.match(result.candidate.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.roadmap.sha256, /^[a-f0-9]{64}$/);
});

test('candidate read 뒤 roadmap이 바뀌면 서로 다른 시점의 pair를 거부한다', async (t) => {
  const { readOperationsHandoverPreflightControlSnapshot } = await modulePromise;
  const { root, candidate, roadmap } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(candidate)) {
      fs.writeFileSync(roadmap, '{"phases":[],"invariants":{"productionGo":true }}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(roadmap, future, future);
    }
    return bytes;
  };

  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root, { io }),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_UNSTABLE/
  );
});

test('roadmap read 중 candidate가 바뀌면 서로 다른 시점의 pair를 거부한다', async (t) => {
  const { readOperationsHandoverPreflightControlSnapshot } = await modulePromise;
  const { root, candidate, roadmap } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(roadmap)) {
      fs.writeFileSync(candidate, '{"schemaVersion":2,"productionGo":false}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(candidate, future, future);
    }
    return bytes;
  };

  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root, { io }),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_UNSTABLE/
  );
});

test('1MiB 초과 제어 파일은 content read 전에 거부한다', async (t) => {
  const {
    OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_MAX_BYTES,
    readOperationsHandoverPreflightControlSnapshot
  } = await modulePromise;
  const { root, candidate } = fixture(t);
  fs.writeFileSync(candidate, Buffer.alloc(OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_MAX_BYTES + 1, 0x20));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root, { io }),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_SIZE_INVALID/
  );
  assert.equal(reads, 0);
});

test('invalid UTF-8과 JSON array 제어 입력을 거부한다', async (t) => {
  const { readOperationsHandoverPreflightControlSnapshot } = await modulePromise;
  const { root, candidate, roadmap } = fixture(t);
  fs.writeFileSync(candidate, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_UTF8_INVALID/
  );
  fs.writeFileSync(candidate, '{"schemaVersion":1}\n', 'utf8');
  fs.writeFileSync(roadmap, '[]\n', 'utf8');
  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_JSON_INVALID/
  );
});

test('candidate realpath redirect를 content read 전에 거부한다', async (t) => {
  const { readOperationsHandoverPreflightControlSnapshot } = await modulePromise;
  const { root, candidate } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.realpathSync = (target) => path.resolve(target) === path.resolve(candidate)
    ? path.join(path.dirname(root), 'redirected-candidate.json')
    : fs.realpathSync(target);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  assert.throws(
    () => readOperationsHandoverPreflightControlSnapshot(root, { io }),
    /OPERATIONS_HANDOVER_PREFLIGHT_CONTROL_FILE_NOT_PHYSICAL/
  );
  assert.equal(reads, 0);
});

test('handover preflight CLI는 pair snapshot 한 건만 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'operations-handover-preflight.mjs'), 'utf8');
  assert.match(source, /readOperationsHandoverPreflightControlSnapshot/);
  assert.doesNotMatch(source, /readOperationsPreflightManifest/);
  assert.doesNotMatch(source, /readOperationsRoadmapControl/);
});
