const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-create-only-json-output.mjs');

test('JSON output을 fsync 후 hard-link no-replace로 한 번만 게시한다', async (t) => {
  const { writeCreateOnlyJsonOutput } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'evidence.json');
  writeCreateOnlyJsonOutput(output, { sequence: 1 }, { processId: 9101 });
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { sequence: 1 });
  assert.equal(fs.existsSync(path.join(root, '.evidence.json.9101.tmp')), false);
  assert.throws(
    () => writeCreateOnlyJsonOutput(output, { sequence: 2 }, { processId: 9102 }),
    /OUTPUT_ALREADY_EXISTS/
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { sequence: 1 });
});

test('경쟁자가 최종 경로를 선점하면 기존 bytes를 보존하고 임시파일을 제거한다', async (t) => {
  const { writeCreateOnlyJsonOutput } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-output-race-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'evidence.json');
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(source, destination) {
      fs.writeFileSync(destination, '{"owner":"other"}\n', { flag: 'wx' });
      return realLink(source, destination);
    }
  };
  assert.throws(
    () => writeCreateOnlyJsonOutput(output, { owner: 'candidate' }, { processId: 9201, io }),
    /OUTPUT_ALREADY_EXISTS/
  );
  assert.equal(fs.readFileSync(output, 'utf8'), '{"owner":"other"}\n');
  assert.equal(fs.existsSync(path.join(root, '.evidence.json.9201.tmp')), false);
});

test('symlink 또는 reparse output parent를 거부한다', async (t) => {
  const { writeCreateOnlyJsonOutput } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-output-parent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'target');
  const link = path.join(root, 'link');
  fs.mkdirSync(target);
  try { fs.symlinkSync(target, link, 'dir'); } catch { t.skip('Windows symlink privilege is environment-dependent'); return; }
  assert.throws(
    () => writeCreateOnlyJsonOutput(path.join(link, 'evidence.json'), { ok: true }),
    /OUTPUT_DIRECTORY_MISSING_OR_NOT_PHYSICAL/
  );
});
