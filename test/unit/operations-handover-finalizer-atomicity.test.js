const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const finalizerModule = import('../../src/operations/operations-handover-finalizer.mjs');

function fixture(t, raw = '{"schemaVersion":1}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-handover-atomic-'));
  const repositoryRoot = path.join(root, 'repository');
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(evidenceRoot);
  const file = path.join(evidenceRoot, 'handover.json');
  fs.writeFileSync(file, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, evidenceRoot, file };
}

test('operations handover evidence는 read 중 파일 size가 변하면 snapshot을 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ', 'utf8');
    return raw;
  };

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(file, { repositoryRoot, io }),
    /OPERATIONS_HANDOVER_EVIDENCE_UNSTABLE/
  );
});

test('operations handover evidence는 read 중 같은 크기 파일 교체를 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot, file } = fixture(t);
  const replacement = path.join(evidenceRoot, 'replacement.json');
  fs.writeFileSync(replacement, '{"schemaVersion":2}\n');
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(file);
    fs.renameSync(replacement, file);
    return raw;
  };

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(file, { repositoryRoot, io }),
    /OPERATIONS_HANDOVER_EVIDENCE_UNSTABLE/
  );
});

test('operations handover evidence는 read 중 repository redirect를 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { root, repositoryRoot, file } = fixture(t);
  let calls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(repositoryRoot)) {
      calls += 1;
      return calls === 1 ? repositoryRoot : path.join(root, 'redirected-repository');
    }
    return fs.realpathSync(candidate);
  };

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(file, { repositoryRoot, io }),
    /OPERATIONS_HANDOVER_EVIDENCE_UNSTABLE/
  );
});

test('relative operations evidence는 read 중 base redirect를 거부한다', async (t) => {
  const { loadActualOperationsEvidenceDocument } = await finalizerModule;
  const { root, repositoryRoot, evidenceRoot } = fixture(t);
  let calls = 0;
  const io = Object.create(fs);
  io.realpathSync = (candidate) => {
    if (path.resolve(candidate) === path.resolve(evidenceRoot)) {
      calls += 1;
      return calls === 1 ? evidenceRoot : path.join(root, 'redirected-evidence');
    }
    return fs.realpathSync(candidate);
  };

  assert.equal(
    loadActualOperationsEvidenceDocument(
      { path: 'handover.json' },
      { baseDir: evidenceRoot, repositoryRoot, io }
    ).loadError,
    'OPERATIONS_HANDOVER_EVIDENCE_UNSTABLE'
  );
});

test('operations handover JSON은 invalid UTF-8을 fatal decode로 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const invalidJsonUtf8 = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
  const { repositoryRoot, file } = fixture(t, invalidJsonUtf8);

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(file, { repositoryRoot }),
    /OPERATIONS_HANDOVER_EVIDENCE_UTF8_INVALID/
  );
});
