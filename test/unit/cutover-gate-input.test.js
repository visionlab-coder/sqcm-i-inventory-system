const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const inputModule = import('../../src/operations/cutover-gate-input.mjs');

test('cutover gate entrypoint uses the bounded evidence reader', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/cutover-gate.mjs'), 'utf8');
  assert.match(source, /readCutoverGateEvidenceFile/);
  assert.doesNotMatch(source, /readFileSync/);
  assert.doesNotMatch(source, /JSON\.parse/);
});

test('cutover gate evidence is a stable physical bounded JSON object', async (t) => {
  const { readCutoverGateEvidenceFile } = await inputModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'actual.json');
  fs.writeFileSync(input, '{"schemaVersion":1}\n');
  const loaded = readCutoverGateEvidenceFile(input, { repositoryRoot: root });
  assert.deepEqual(loaded.value, { schemaVersion: 1 });
  assert.equal(loaded.bytes, 20);
  assert.match(loaded.sha256, /^[0-9a-f]{64}$/);
});

test('oversize cutover evidence is rejected before body read', async (t) => {
  const { CUTOVER_GATE_EVIDENCE_MAX_BYTES, readCutoverGateEvidenceFile } = await inputModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'actual.json');
  fs.writeFileSync(input, Buffer.alloc(CUTOVER_GATE_EVIDENCE_MAX_BYTES + 1));
  const io = Object.create(fs);
  let readCount = 0;
  io.readFileSync = (...args) => { readCount += 1; return fs.readFileSync(...args); };
  assert.throws(
    () => readCutoverGateEvidenceFile(input, { repositoryRoot: root, io }),
    /CUTOVER_GATE_EVIDENCE_BYTES_INVALID/
  );
  assert.equal(readCount, 0);
});

test('invalid UTF-8 and JSON arrays never become cutover evidence', async (t) => {
  const { readCutoverGateEvidenceFile } = await inputModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'actual.json');
  fs.writeFileSync(input, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readCutoverGateEvidenceFile(input, { repositoryRoot: root }),
    /CUTOVER_GATE_EVIDENCE_UTF8_INVALID/
  );
  fs.writeFileSync(input, '[]');
  assert.throws(
    () => readCutoverGateEvidenceFile(input, { repositoryRoot: root }),
    /CUTOVER_GATE_EVIDENCE_JSON_INVALID/
  );
});
