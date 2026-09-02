const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const finalizerModule = import('../../src/operations/operations-handover-finalizer.mjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-reference-'));
  const repositoryRoot = path.join(root, 'repository');
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(evidenceRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, evidenceRoot };
}

test('저장소 밖 physical JSON object를 bounded read하고 실제 bytes·SHA를 계산한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const file = path.join(evidenceRoot, 'handover.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2, environment: 'production' }));

  const result = readActualOperationsHandoverEvidenceFile(file, { repositoryRoot });

  assert.equal(result.value.schemaVersion, 2);
  assert.equal(result.bytes, fs.statSync(file).size);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test('top-level 상대경로·저장소 내부·비 JSON 참조를 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const inside = path.join(repositoryRoot, 'inside.json');
  const text = path.join(evidenceRoot, 'handover.txt');
  fs.writeFileSync(inside, '{}');
  fs.writeFileSync(text, '{}');

  for (const candidate of ['relative.json', inside, text]) {
    assert.throws(
      () => readActualOperationsHandoverEvidenceFile(candidate, { repositoryRoot }),
      /OPERATIONS_HANDOVER_EVIDENCE_REFERENCE_INVALID/
    );
  }
});

test('빈 파일·4MiB 초과 파일·디렉터리를 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile, OPERATIONS_HANDOVER_EVIDENCE_MAX_BYTES } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const empty = path.join(evidenceRoot, 'empty.json');
  const large = path.join(evidenceRoot, 'large.json');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(large, Buffer.alloc(OPERATIONS_HANDOVER_EVIDENCE_MAX_BYTES + 1, 0x20));

  for (const candidate of [empty, large, evidenceRoot]) {
    assert.throws(
      () => readActualOperationsHandoverEvidenceFile(candidate, { repositoryRoot }),
      /OPERATIONS_HANDOVER_EVIDENCE_REFERENCE_INVALID/
    );
  }
});

test('malformed JSON과 배열은 오류 원문 없이 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const malformed = path.join(evidenceRoot, 'malformed.json');
  const array = path.join(evidenceRoot, 'array.json');
  fs.writeFileSync(malformed, '{secret-value');
  fs.writeFileSync(array, '[]');

  for (const candidate of [malformed, array]) {
    assert.throws(
      () => readActualOperationsHandoverEvidenceFile(candidate, { repositoryRoot }),
      (error) => error.message === 'OPERATIONS_HANDOVER_EVIDENCE_JSON_INVALID'
    );
  }
});

test('존재하지 않는 파일은 별도 redacted 상태로 구분한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(path.join(evidenceRoot, 'missing.json'), { repositoryRoot }),
    /OPERATIONS_HANDOVER_EVIDENCE_NOT_FOUND/
  );
});

test('symlink·reparse 참조를 거부한다', async (t) => {
  const { readActualOperationsHandoverEvidenceFile } = await finalizerModule;
  const { repositoryRoot, evidenceRoot } = fixture(t);
  const target = path.join(evidenceRoot, 'target.json');
  const link = path.join(evidenceRoot, 'link.json');
  fs.writeFileSync(target, '{}');
  try {
    fs.symlinkSync(target, link, 'file');
  } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('Windows symlink 권한 없음');
    throw error;
  }

  assert.throws(
    () => readActualOperationsHandoverEvidenceFile(link, { repositoryRoot }),
    /OPERATIONS_HANDOVER_EVIDENCE_REFERENCE_INVALID/
  );
});

test('하위 문서는 external base 내부 상대 JSON만 허용하고 탈출·저장소 참조를 거부한다', async (t) => {
  const { loadActualOperationsEvidenceDocument } = await finalizerModule;
  const { root, repositoryRoot, evidenceRoot } = fixture(t);
  const valid = path.join(evidenceRoot, 'domain.json');
  const escaped = path.join(root, 'escaped.json');
  const inside = path.join(repositoryRoot, 'inside.json');
  fs.writeFileSync(valid, JSON.stringify({ schemaVersion: 1 }));
  fs.writeFileSync(escaped, '{}');
  fs.writeFileSync(inside, '{}');

  assert.equal(loadActualOperationsEvidenceDocument({ path: 'domain.json' }, { baseDir: evidenceRoot, repositoryRoot }).value.schemaVersion, 1);
  assert.equal(loadActualOperationsEvidenceDocument({ path: '..\\escaped.json' }, { baseDir: evidenceRoot, repositoryRoot }).loadError, 'OPERATIONS_HANDOVER_EVIDENCE_REFERENCE_INVALID');
  assert.equal(loadActualOperationsEvidenceDocument({ path: inside }, { baseDir: evidenceRoot, repositoryRoot }).loadError, 'OPERATIONS_HANDOVER_EVIDENCE_REFERENCE_INVALID');
});
