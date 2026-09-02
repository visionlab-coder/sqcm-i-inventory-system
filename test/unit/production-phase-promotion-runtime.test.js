const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const runtimeModule = import('../../src/operations/production-phase-promotion-runtime.mjs');

test('P6 to P7 promotion entrypoint uses bounded Git and document runtime', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../scripts/production-phase-promotion.mjs'),
    'utf8'
  );
  assert.match(source, /runPhasePromotionGitStatus/);
  assert.match(source, /readPhasePromotionTextDocument/);
  assert.doesNotMatch(source, /spawnSync\(/);
  assert.doesNotMatch(source, /fs\.readFileSync\(paths\.(currentState|roadmapDoc)/);
});

test('promotion documents are physical, bounded, stable, fatal UTF-8 text', async () => {
  const { readPhasePromotionTextDocument } = await runtimeModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-promotion-'));
  const docs = path.join(root, 'docs');
  fs.mkdirSync(docs);
  const currentState = path.join(docs, 'current-state.md');
  const roadmap = path.join(docs, 'roadmap.md');
  try {
    fs.writeFileSync(currentState, '# current\n');
    fs.writeFileSync(roadmap, Buffer.from([0xc3, 0x28]));
    const loaded = readPhasePromotionTextDocument({ projectRoot: root, filePath: currentState });
    assert.equal(loaded.text, '# current\n');
    assert.equal(loaded.bytes, 10);
    assert.throws(
      () => readPhasePromotionTextDocument({ projectRoot: root, filePath: roadmap }),
      /PHASE_PROMOTION_DOCUMENT_UTF8_INVALID/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('oversize promotion document is rejected before body read', async () => {
  const { readPhasePromotionTextDocument } = await runtimeModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-promotion-'));
  const docs = path.join(root, 'docs');
  fs.mkdirSync(docs);
  const file = path.join(docs, 'roadmap.md');
  fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1));
  let readCount = 0;
  try {
    assert.throws(
      () => readPhasePromotionTextDocument({
        projectRoot: root,
        filePath: file,
        io: { ...fs, readFileSync: (...args) => { readCount += 1; return fs.readFileSync(...args); } }
      }),
      /PHASE_PROMOTION_DOCUMENT_BYTES_INVALID/
    );
    assert.equal(readCount, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('promotion Git status is bounded and raw process errors are normalized', async () => {
  const { runPhasePromotionGitStatus } = await runtimeModule;
  let received;
  const result = runPhasePromotionGitStatus({
    projectRoot: process.cwd(),
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: '' };
    }
  });
  assert.deepEqual(result, { clean: true });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
  assert.equal(received.shell, false);
  assert.throws(
    () => runPhasePromotionGitStatus({
      projectRoot: process.cwd(),
      spawnClient: () => ({ error: Object.assign(new Error('git-secret-raw'), { code: 'ETIMEDOUT' }) })
    }),
    (error) => error.message === 'PHASE_PROMOTION_GIT_TIMEOUT'
      && !String(error.stack).includes('git-secret-raw')
  );
});
