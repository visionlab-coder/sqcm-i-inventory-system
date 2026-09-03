const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const readerModule = import('../../src/operations/operations-activation-input-reader.mjs');
const repositoryRoot = path.resolve(__dirname, '..', '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p6-cloudflare-token-'));
  const secretRoot = path.join(root, 'secrets');
  fs.mkdirSync(secretRoot);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { secretRoot };
}

test('Cloudflare token reference inspector가 공용 Secret reader에 존재한다', async () => {
  const { inspectOperationsSecretInputReference } = await readerModule;
  assert.equal(typeof inspectOperationsSecretInputReference, 'function');
});

test('Cloudflare token reference 점검은 Secret bytes를 읽지 않는다', async (t) => {
  const { inspectOperationsSecretInputReference } = await readerModule;
  const { secretRoot } = fixture(t);
  const token = path.join(secretRoot, 'cloudflare.token');
  fs.writeFileSync(token, 'a'.repeat(32));
  let reads = 0;
  const io = Object.create(fs);
  io.readFileSync = (...args) => { reads += 1; return fs.readFileSync(...args); };

  assert.deepEqual(inspectOperationsSecretInputReference(token, { repositoryRoot, io }), {
    present: true,
    bytes: 32
  });
  assert.equal(reads, 0);
});

test('ingress publication은 bounded Secret inspector와 reader만 사용한다', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'production-ingress-publication.mjs'), 'utf8');
  assert.match(source, /inspectOperationsSecretInputReference\(/);
  assert.match(source, /readOperationsSecretInput\(/);
  assert.doesNotMatch(source, /readFileSync\(process\.env\[TOKEN_ENV\]/);
});

test('route disable은 bounded Secret inspector와 reader만 사용한다', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'production-route-disable.mjs'), 'utf8');
  assert.match(source, /inspectOperationsSecretInputReference\(/);
  assert.match(source, /readOperationsSecretInput\(/);
  assert.doesNotMatch(source, /readFileSync\(process\.env\[TOKEN_ENV\]/);
});
