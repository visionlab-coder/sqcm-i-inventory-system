const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-roadmap-control-reader.mjs');

function fixture(t, value = { phases: [], invariants: { productionGo: false } }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-activation-roadmap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'agent docs', 'harness', 'MASTER_ROADMAP.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`, 'utf8');
  return { root, file };
}

test('roadmap control reader는 exact physical JSON을 한 번 읽고 bytes와 SHA-256을 반환한다', async (t) => {
  const { readOperationsRoadmapControl } = await modulePromise;
  const expected = { phases: [{ id: 'P6', status: 'in-progress' }], invariants: { productionGo: false } };
  const { root, file } = fixture(t, expected);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  const result = readOperationsRoadmapControl(root, { io });

  const raw = fs.readFileSync(file);
  assert.deepEqual(result.value, expected);
  assert.equal(result.bytes, raw.length);
  assert.equal(result.sha256, crypto.createHash('sha256').update(raw).digest('hex'));
  assert.equal(reads, 1);
});

test('roadmap control reader는 1MiB 초과 파일을 읽기 전에 거부한다', async (t) => {
  const { OPERATIONS_ROADMAP_CONTROL_MAX_BYTES, readOperationsRoadmapControl } = await modulePromise;
  const { root, file } = fixture(t);
  fs.writeFileSync(file, Buffer.alloc(OPERATIONS_ROADMAP_CONTROL_MAX_BYTES + 1, 0x20));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.throws(() => readOperationsRoadmapControl(root, { io }), /OPERATIONS_ROADMAP_CONTROL_SIZE_INVALID/);
  assert.equal(reads, 0);
});

test('roadmap control reader는 read 중 파일 identity·size 변화가 생기면 거부한다', async (t) => {
  const { readOperationsRoadmapControl } = await modulePromise;
  const { root, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ', 'utf8');
    return raw;
  };

  assert.throws(() => readOperationsRoadmapControl(root, { io }), /OPERATIONS_ROADMAP_CONTROL_UNSTABLE/);
});

test('roadmap control reader는 invalid UTF-8과 JSON array를 거부한다', async (t) => {
  const { readOperationsRoadmapControl } = await modulePromise;
  const { root, file } = fixture(t);
  fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
  assert.throws(() => readOperationsRoadmapControl(root), /OPERATIONS_ROADMAP_CONTROL_UTF8_INVALID/);
  fs.writeFileSync(file, '[]\n', 'utf8');
  assert.throws(() => readOperationsRoadmapControl(root), /OPERATIONS_ROADMAP_CONTROL_JSON_INVALID/);
});

test('roadmap control reader는 file realpath redirect를 거부한다', async (t) => {
  const { readOperationsRoadmapControl } = await modulePromise;
  const { root, file } = fixture(t);
  const io = Object.create(fs);
  io.realpathSync = (candidate) => path.resolve(candidate) === path.resolve(file)
    ? path.join(path.dirname(root), 'redirected-roadmap.json')
    : fs.realpathSync(candidate);

  assert.throws(() => readOperationsRoadmapControl(root, { io }), /OPERATIONS_ROADMAP_CONTROL_FILE_NOT_PHYSICAL/);
});

test('네 activation 진입점은 direct unbounded roadmap read 대신 공용 bounded reader를 사용한다', () => {
  const root = path.resolve(__dirname, '..', '..');
  const scripts = [
    'operations-activation-approval-chain-preflight.mjs',
    'operations-activation-approval-manifest.mjs',
    'operations-activation-approval-request.mjs',
    'operations-activation-orchestrator.mjs'
  ];
  for (const name of scripts) {
    const source = fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
    assert.match(source, /readOperationsRoadmapControl/);
    assert.doesNotMatch(source, /JSON\.parse\(fs\.readFileSync\([^\n]*MASTER_ROADMAP/);
  }
});
