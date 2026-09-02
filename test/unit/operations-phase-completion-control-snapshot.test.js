const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-phase-completion-control-snapshot.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-completion-control-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'agent docs', 'harness');
  fs.mkdirSync(directory, { recursive: true });
  const roadmap = path.join(directory, 'MASTER_ROADMAP.json');
  const queue = path.join(directory, 'P6_P7_ACCELERATION_QUEUE.json');
  fs.writeFileSync(roadmap, '{"completedPhases":7,"currentPhase":"P7"}\n', 'utf8');
  fs.writeFileSync(queue, '{"currentPhase":"P7","readyPacket":"ACC-P7-02-OPERATIONS-ACTIVATION-AND-SIGNOFF"}\n', 'utf8');
  return { root, roadmap, queue };
}

test('phase completion control snapshot은 exact roadmap과 queue를 각각 한 번 읽는다', async (t) => {
  const { readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  const result = readOperationsPhaseCompletionControlSnapshot(root, { io });

  assert.equal(reads, 2);
  assert.equal(result.roadmap.value.completedPhases, 7);
  assert.equal(result.queue.value.currentPhase, 'P7');
  assert.match(result.roadmap.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.queue.sha256, /^[a-f0-9]{64}$/);
});

test('roadmap read 뒤 queue가 바뀌면 서로 다른 시점의 completion pair를 거부한다', async (t) => {
  const { readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root, roadmap, queue } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(roadmap)) {
      fs.writeFileSync(queue, '{"currentPhase":"P7","readyPacket":null}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(queue, future, future);
    }
    return bytes;
  };

  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root, { io }),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_UNSTABLE/
  );
});

test('queue read 중 roadmap이 바뀌면 서로 다른 시점의 completion pair를 거부한다', async (t) => {
  const { readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root, roadmap, queue } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const bytes = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(queue)) {
      fs.writeFileSync(roadmap, '{"completedPhases":8,"currentPhase":"P7"}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(roadmap, future, future);
    }
    return bytes;
  };

  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root, { io }),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_UNSTABLE/
  );
});

test('1MiB 초과 completion control은 content read 전에 거부한다', async (t) => {
  const { OPERATIONS_PHASE_COMPLETION_CONTROL_MAX_BYTES, readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root, queue } = fixture(t);
  fs.writeFileSync(queue, Buffer.alloc(OPERATIONS_PHASE_COMPLETION_CONTROL_MAX_BYTES + 1, 0x20));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root, { io }),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_SIZE_INVALID/
  );
  assert.equal(reads, 0);
});

test('invalid UTF-8과 JSON array completion control을 거부한다', async (t) => {
  const { readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root, roadmap, queue } = fixture(t);
  fs.writeFileSync(roadmap, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_UTF8_INVALID/
  );
  fs.writeFileSync(roadmap, '{"completedPhases":7}\n', 'utf8');
  fs.writeFileSync(queue, '[]\n', 'utf8');
  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_JSON_INVALID/
  );
});

test('queue realpath redirect를 content read 전에 거부한다', async (t) => {
  const { readOperationsPhaseCompletionControlSnapshot } = await modulePromise;
  const { root, queue } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.realpathSync = (target) => path.resolve(target) === path.resolve(queue)
    ? path.join(path.dirname(root), 'redirected-queue.json')
    : fs.realpathSync(target);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  assert.throws(
    () => readOperationsPhaseCompletionControlSnapshot(root, { io }),
    /OPERATIONS_PHASE_COMPLETION_CONTROL_FILE_NOT_PHYSICAL/
  );
  assert.equal(reads, 0);
});

test('phase completion CLI는 atomic pair snapshot만 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'operations-phase-completion.mjs'), 'utf8');
  assert.match(source, /readOperationsPhaseCompletionControlSnapshot/);
  assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync\(files\.roadmap/);
  assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync\(files\.queue/);
});

test('P6 phase promotion과 P7 terminal completion은 동일 atomic pair reader를 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const completion = fs.readFileSync(path.join(root, 'scripts', 'operations-phase-completion.mjs'), 'utf8');
  const promotion = fs.readFileSync(path.join(root, 'scripts', 'production-phase-promotion.mjs'), 'utf8');
  for (const source of [completion, promotion]) {
    assert.match(source, /readOperationsPhaseCompletionControlSnapshot/);
  }
  assert.doesNotMatch(promotion, /JSON\.parse\(fs\.readFileSync\(paths\.roadmap/);
  assert.doesNotMatch(promotion, /JSON\.parse\(fs\.readFileSync\(paths\.queue/);
});
