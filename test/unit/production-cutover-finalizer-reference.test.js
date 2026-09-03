const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-cutover-finalizer.mjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-finalizer-'));
  const repositoryRoot = path.join(root, 'repository');
  const externalRoot = path.join(root, 'evidence');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(externalRoot);
  const valid = path.join(externalRoot, 'actual.json');
  fs.writeFileSync(valid, '{"template":false}');
  return { root, repositoryRoot, externalRoot, valid };
}

test('저장소 밖 physical JSON object를 bounded actual evidence로 읽는다', async () => {
  const { readActualCutoverEvidenceFile } = await modulePromise;
  const item = fixture();
  try {
    const result = readActualCutoverEvidenceFile(item.valid, { repositoryRoot: item.repositoryRoot });
    assert.deepEqual(result.value, { template: false });
    assert.equal(result.bytes, Buffer.byteLength('{"template":false}'));
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('저장소 내부·상대경로·비JSON reference를 거부한다', async () => {
  const { readActualCutoverEvidenceFile } = await modulePromise;
  const item = fixture();
  const inside = path.join(item.repositoryRoot, 'inside.json');
  const text = path.join(item.externalRoot, 'actual.txt');
  fs.writeFileSync(inside, '{}');
  fs.writeFileSync(text, '{}');
  try {
    for (const candidate of [inside, 'relative.json', text]) {
      assert.throws(() => readActualCutoverEvidenceFile(candidate, { repositoryRoot: item.repositoryRoot }), /ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID/);
    }
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('빈 파일·4MiB 초과 파일·디렉터리를 거부한다', async () => {
  const { readActualCutoverEvidenceFile, ACTUAL_CUTOVER_EVIDENCE_MAX_BYTES } = await modulePromise;
  const item = fixture();
  const empty = path.join(item.externalRoot, 'empty.json');
  const large = path.join(item.externalRoot, 'large.json');
  const directory = path.join(item.externalRoot, 'folder.json');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(large, Buffer.alloc(ACTUAL_CUTOVER_EVIDENCE_MAX_BYTES + 1));
  fs.mkdirSync(directory);
  try {
    for (const candidate of [empty, large, directory]) {
      assert.throws(() => readActualCutoverEvidenceFile(candidate, { repositoryRoot: item.repositoryRoot }), /ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID/);
    }
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('malformed JSON과 배열은 원문 없이 거부한다', async () => {
  const { readActualCutoverEvidenceFile } = await modulePromise;
  const item = fixture();
  const malformed = path.join(item.externalRoot, 'malformed.json');
  const array = path.join(item.externalRoot, 'array.json');
  fs.writeFileSync(malformed, 'sensitive-malformed-json');
  fs.writeFileSync(array, '[]');
  try {
    for (const candidate of [malformed, array]) {
      assert.throws(
        () => readActualCutoverEvidenceFile(candidate, { repositoryRoot: item.repositoryRoot }),
        (error) => error.message === 'ACTUAL_CUTOVER_EVIDENCE_JSON_INVALID'
          && !String(error.stack).includes('sensitive-malformed-json')
      );
    }
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('존재하지 않는 파일은 invalid reference와 구분된 NOT_FOUND다', async () => {
  const { readActualCutoverEvidenceFile } = await modulePromise;
  const item = fixture();
  try {
    assert.throws(
      () => readActualCutoverEvidenceFile(path.join(item.externalRoot, 'missing.json'), { repositoryRoot: item.repositoryRoot }),
      /ACTUAL_CUTOVER_EVIDENCE_NOT_FOUND/
    );
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('symlink actual evidence는 target이 외부 파일이어도 차단한다', async (t) => {
  const { readActualCutoverEvidenceFile } = await modulePromise;
  const item = fixture();
  const link = path.join(item.externalRoot, 'linked.json');
  try {
    try { fs.symlinkSync(item.valid, link, 'file'); } catch { t.skip('Windows symlink privilege is environment-dependent'); return; }
    assert.throws(() => readActualCutoverEvidenceFile(link, { repositoryRoot: item.repositoryRoot }), /ACTUAL_CUTOVER_EVIDENCE_REFERENCE_INVALID/);
  } finally { fs.rmSync(item.root, { recursive: true }); }
});
