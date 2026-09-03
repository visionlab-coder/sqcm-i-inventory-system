const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-signoff-reference-runtime.mjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-signoff-reference-'));
  const projectRoot = path.join(root, 'project');
  const externalRoot = path.join(root, 'external');
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(externalRoot);
  const externalFile = path.join(externalRoot, 'admin.json');
  fs.writeFileSync(externalFile, '{"template":false}');
  return { root, projectRoot, externalRoot, externalFile };
}

test('저장소 밖 physical JSON reference만 presence=true다', async () => {
  const { validateSignoffReferenceSet } = await modulePromise;
  const item = fixture();
  try {
    assert.deepEqual(validateSignoffReferenceSet({ ADMIN: item.externalFile }, { projectRoot: item.projectRoot }), { ADMIN: true });
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('저장소 내부·상대경로·비JSON·디렉터리는 외부 증거 reference가 아니다', async () => {
  const { validateSignoffReferenceSet } = await modulePromise;
  const item = fixture();
  const inside = path.join(item.projectRoot, 'inside.json');
  const text = path.join(item.externalRoot, 'result.txt');
  const directory = path.join(item.externalRoot, 'folder.json');
  fs.writeFileSync(inside, '{}');
  fs.writeFileSync(text, '{}');
  fs.mkdirSync(directory);
  try {
    assert.deepEqual(validateSignoffReferenceSet({ INSIDE: inside, RELATIVE: 'relative.json', TEXT: text, DIRECTORY: directory }, { projectRoot: item.projectRoot }), {
      INSIDE: false,
      RELATIVE: false,
      TEXT: false,
      DIRECTORY: false
    });
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('같은 physical file을 역할·서명에 중복 지정하면 두 reference를 모두 차단한다', async () => {
  const { validateSignoffReferenceSet } = await modulePromise;
  const item = fixture();
  try {
    assert.deepEqual(validateSignoffReferenceSet({ ADMIN: item.externalFile, BUSINESS: item.externalFile }, { projectRoot: item.projectRoot }), {
      ADMIN: false,
      BUSINESS: false
    });
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('빈 파일과 1MiB 초과 파일은 증거 reference가 아니다', async () => {
  const { validateSignoffReferenceSet, SIGNOFF_REFERENCE_MAX_BYTES } = await modulePromise;
  const item = fixture();
  const empty = path.join(item.externalRoot, 'empty.json');
  const large = path.join(item.externalRoot, 'large.json');
  fs.writeFileSync(empty, '');
  fs.writeFileSync(large, Buffer.alloc(SIGNOFF_REFERENCE_MAX_BYTES + 1));
  try {
    assert.deepEqual(validateSignoffReferenceSet({ EMPTY: empty, LARGE: large }, { projectRoot: item.projectRoot }), { EMPTY: false, LARGE: false });
  } finally { fs.rmSync(item.root, { recursive: true }); }
});

test('symlink reference는 target이 외부 physical JSON이어도 차단한다', async (t) => {
  const { validateSignoffReferenceSet } = await modulePromise;
  const item = fixture();
  const link = path.join(item.externalRoot, 'linked.json');
  try {
    try { fs.symlinkSync(item.externalFile, link, 'file'); } catch { t.skip('Windows symlink privilege is environment-dependent'); return; }
    assert.deepEqual(validateSignoffReferenceSet({ LINK: link }, { projectRoot: item.projectRoot }), { LINK: false });
  } finally { fs.rmSync(item.root, { recursive: true }); }
});
