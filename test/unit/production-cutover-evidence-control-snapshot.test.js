const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-cutover-evidence-control-snapshot.mjs');

const files = {
  g3: 'P6_G3_AI_PC_PRODUCTION_DEPLOY_ROLLBACK_EVIDENCE.json',
  g4: 'P6_G4_CUTOVER_PREFLIGHT_EVIDENCE.json',
  p5: 'P5_G2_STAGING_UAT_SIGNOFF_EVIDENCE.json',
  provider: 'P6_G4_PROVIDER_PREFLIGHT_EVIDENCE.json',
  candidate: 'P6_G4_CUTOVER_EVIDENCE_CANDIDATE.json'
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-evidence-control-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'agent docs', 'harness');
  fs.mkdirSync(directory, { recursive: true });
  const paths = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, path.join(directory, file)]));
  for (const [name, file] of Object.entries(paths)) fs.writeFileSync(file, JSON.stringify({ name }) + '\n', 'utf8');
  return { root, paths };
}

test('five-file snapshot reads each exact control once and returns actual hashes', async (t) => {
  const { readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  const result = readProductionCutoverEvidenceControlSnapshot(root, { io });
  assert.equal(reads, 5);
  assert.deepEqual(Object.keys(result), Object.keys(files));
  for (const name of Object.keys(files)) {
    assert.equal(result[name].value.name, name);
    assert.match(result[name].sha256, /^[a-f0-9]{64}$/);
  }
});

test('source read 뒤 candidate가 바뀌면 mixed snapshot을 거부한다', async (t) => {
  const { readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root, paths } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const raw = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(paths.g3)) {
      fs.writeFileSync(paths.candidate, '{"name":"changed"}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(paths.candidate, future, future);
    }
    return raw;
  };
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root, { io }), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UNSTABLE/);
});

test('candidate read 중 source가 바뀌면 mixed snapshot을 거부한다', async (t) => {
  const { readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root, paths } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (target) => {
    const raw = fs.readFileSync(target);
    if (path.resolve(target) === path.resolve(paths.candidate)) {
      fs.writeFileSync(paths.provider, '{"name":"changed"}\n', 'utf8');
      const future = new Date(Date.now() + 5000);
      fs.utimesSync(paths.provider, future, future);
    }
    return raw;
  };
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root, { io }), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UNSTABLE/);
});

test('oversize control is rejected before any content read', async (t) => {
  const { PRODUCTION_CUTOVER_EVIDENCE_CONTROL_MAX_BYTES, readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root, paths } = fixture(t);
  fs.writeFileSync(paths.g4, Buffer.alloc(PRODUCTION_CUTOVER_EVIDENCE_CONTROL_MAX_BYTES + 1, 0x20));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root, { io }), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_SIZE_INVALID/);
  assert.equal(reads, 0);
});

test('invalid UTF-8 and array root are rejected', async (t) => {
  const { readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root, paths } = fixture(t);
  fs.writeFileSync(paths.p5, Buffer.from([0xc3, 0x28]));
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_UTF8_INVALID/);
  fs.writeFileSync(paths.p5, '{"name":"p5"}\n', 'utf8');
  fs.writeFileSync(paths.provider, '[]\n', 'utf8');
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_JSON_INVALID/);
});

test('realpath redirect is rejected before any content read', async (t) => {
  const { readProductionCutoverEvidenceControlSnapshot } = await modulePromise;
  const { root, paths } = fixture(t);
  let reads = 0;
  const io = Object.create(fs);
  io.realpathSync = (target) => path.resolve(target) === path.resolve(paths.g3)
    ? path.join(path.dirname(root), 'redirected.json')
    : fs.realpathSync(target);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };
  assert.throws(() => readProductionCutoverEvidenceControlSnapshot(root, { io }), /PRODUCTION_CUTOVER_EVIDENCE_CONTROL_FILE_NOT_PHYSICAL/);
  assert.equal(reads, 0);
});

test('cutover evidence check consumes one atomic five-file control snapshot', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'scripts', 'production-cutover-evidence-check.mjs'), 'utf8');
  assert.match(source, /readProductionCutoverEvidenceControlSnapshot/);
  assert.doesNotMatch(source, /const readJson/);
  assert.doesNotMatch(source, /readOperationsPreflightManifest/);
});
