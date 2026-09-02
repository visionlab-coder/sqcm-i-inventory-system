const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-uat-input-reader.mjs');

function fixture(t, raw = Buffer.from('{"email":"admin@example.test","password":"StrongPass!234","totpSecret":"JBSWY3DPEHPK3PXP"}\n')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-production-uat-input-'));
  const repositoryRoot = path.join(root, 'repository');
  const externalRoot = path.join(root, 'external');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(externalRoot);
  const file = path.join(externalRoot, 'credential.json');
  fs.writeFileSync(file, raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repositoryRoot, externalRoot, file };
}

test('Production UAT JSON은 저장소 밖 bounded actual bytes와 SHA를 반환한다', async (t) => {
  const { inspectProductionUatJsonReference, readProductionUatJsonDocument } = await modulePromise;
  const { repositoryRoot, file } = fixture(t);
  const observed = inspectProductionUatJsonReference(file, { repositoryRoot });
  const document = readProductionUatJsonDocument(file, { repositoryRoot });
  assert.equal(observed.present, true);
  assert.equal(document.value.email, 'admin@example.test');
  assert.equal(document.bytes, fs.statSync(file).size);
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(document, 'raw'), false);
});

test('reference inspect는 Secret content를 읽지 않고 저장소 내부·과대 입력을 거부한다', async (t) => {
  const { PRODUCTION_UAT_INPUT_MAX_BYTES, inspectProductionUatJsonReference } = await modulePromise;
  const { repositoryRoot, externalRoot } = fixture(t);
  const inside = path.join(repositoryRoot, 'credential.json');
  const large = path.join(externalRoot, 'large.json');
  fs.writeFileSync(inside, '{}');
  fs.writeFileSync(large, Buffer.alloc(PRODUCTION_UAT_INPUT_MAX_BYTES + 1, 0x20));
  const io = Object.create(fs);
  io.readFileSync = () => { throw new Error('SECRET_CONTENT_MUST_NOT_BE_READ'); };
  assert.equal(inspectProductionUatJsonReference(inside, { repositoryRoot, io }).present, false);
  assert.equal(inspectProductionUatJsonReference(large, { repositoryRoot, io }).present, false);
});

test('read 중 크기 변경은 unstable로 차단한다', async (t) => {
  const { readProductionUatJsonDocument } = await modulePromise;
  const { repositoryRoot, file } = fixture(t);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.appendFileSync(file, ' ');
    return raw;
  };
  assert.throws(() => readProductionUatJsonDocument(file, { repositoryRoot, io }), /PRODUCTION_UAT_INPUT_UNSTABLE/);
});

test('read 중 같은 크기 파일 교체는 unstable로 차단한다', async (t) => {
  const { readProductionUatJsonDocument } = await modulePromise;
  const original = '{"value":"original"}\n';
  const replacementRaw = '{"value":"replaced"}\n';
  assert.equal(Buffer.byteLength(original), Buffer.byteLength(replacementRaw));
  const { repositoryRoot, externalRoot, file } = fixture(t, Buffer.from(original));
  const replacement = path.join(externalRoot, 'replacement.json');
  fs.writeFileSync(replacement, replacementRaw);
  const io = Object.create(fs);
  io.readFileSync = (...args) => {
    const raw = fs.readFileSync(...args);
    fs.rmSync(file);
    fs.renameSync(replacement, file);
    return raw;
  };
  assert.throws(() => readProductionUatJsonDocument(file, { repositoryRoot, io }), /PRODUCTION_UAT_INPUT_UNSTABLE/);
});

test('repository realpath redirect는 unstable로 차단한다', async (t) => {
  const { readProductionUatJsonDocument } = await modulePromise;
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
  assert.throws(() => readProductionUatJsonDocument(file, { repositoryRoot, io }), /PRODUCTION_UAT_INPUT_UNSTABLE/);
});

test('invalid UTF-8과 JSON array는 계약 입력으로 승격하지 않는다', async (t) => {
  const { readProductionUatJsonDocument } = await modulePromise;
  const invalid = fixture(t, Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]));
  assert.throws(() => readProductionUatJsonDocument(invalid.file, { repositoryRoot: invalid.repositoryRoot }), /PRODUCTION_UAT_INPUT_UTF8_INVALID/);
  const array = fixture(t, Buffer.from('[]'));
  assert.throws(() => readProductionUatJsonDocument(array.file, { repositoryRoot: array.repositoryRoot }), /PRODUCTION_UAT_INPUT_JSON_INVALID/);
});

test('P6 UAT 진입점은 공용 reader를 사용하고 direct credential read를 제거한다', () => {
  const files = [
    'scripts/production-change-window-input-readiness.mjs',
    'scripts/production-uat-actor-provision.mjs',
    'scripts/production-role-preflight.mjs',
    'scripts/production-role-core-smoke.mjs',
    'scripts/production-authenticated-idempotency.mjs'
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(file), 'utf8');
    assert.match(source, /production-uat-input-reader\.mjs/);
    assert.doesNotMatch(source, /readFileSync\s*\(/);
  }
});
