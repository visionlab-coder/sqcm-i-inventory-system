const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const entrypoint = fs.readFileSync(
  path.join(__dirname, '../../scripts/production-ingress-publication.mjs'),
  'utf8'
);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('ingress config는 fsync 후 hard-link no-replace로 게시한다', async (t) => {
  const { writeProductionIngressConfigCreateOnly } = await runtimeModule;
  assert.equal(typeof writeProductionIngressConfigCreateOnly, 'function');
  const root = fixture(t);
  const output = path.join(root, 'cloudflared.yml');
  writeProductionIngressConfigCreateOnly({
    runtimeDirectory: root,
    configPath: output,
    content: 'tunnel: candidate\n',
    processId: 9301
  });
  assert.equal(fs.readFileSync(output, 'utf8'), 'tunnel: candidate\n');
  assert.equal(fs.existsSync(path.join(root, '.cloudflared.yml.9301.tmp')), false);
});

test('ingress config 경쟁은 선점 bytes를 보존하고 내부 임시파일을 제거한다', async (t) => {
  const { writeProductionIngressConfigCreateOnly } = await runtimeModule;
  assert.equal(typeof writeProductionIngressConfigCreateOnly, 'function');
  const root = fixture(t);
  const output = path.join(root, 'cloudflared.yml');
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(source, destination) {
      fs.writeFileSync(destination, 'tunnel: competing\n', { flag: 'wx' });
      return realLink(source, destination);
    }
  };
  assert.throws(
    () => writeProductionIngressConfigCreateOnly({
      runtimeDirectory: root,
      configPath: output,
      content: 'tunnel: candidate\n',
      processId: 9302,
      io
    }),
    /INGRESS_CONFIG_ALREADY_EXISTS/
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'tunnel: competing\n');
  assert.equal(fs.existsSync(path.join(root, '.cloudflared.yml.9302.tmp')), false);
});

test('tunnel credential은 원문 read 없이 fsync 후 hard-link no-replace로 게시한다', async (t) => {
  const { publishProductionTunnelCredential } = await runtimeModule;
  assert.equal(typeof publishProductionTunnelCredential, 'function');
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  const final = path.join(root, '11111111-1111-4111-8111-111111111111.json');
  fs.writeFileSync(temporary, '{"secret":"must-not-be-read"}\n', { flag: 'wx', mode: 0o600 });
  let reads = 0;
  const io = { ...fs, readFileSync() { reads += 1; throw new Error('SECRET_BODY_READ'); } };
  publishProductionTunnelCredential({
    credentialDirectory: root,
    temporaryPath: temporary,
    finalPath: final,
    io
  });
  assert.equal(reads, 0);
  assert.equal(fs.existsSync(temporary), false);
  assert.equal(fs.statSync(final).size, 30);
});

test('credential 경쟁은 선점 bytes와 복구용 생성 credential을 모두 보존한다', async (t) => {
  const { publishProductionTunnelCredential } = await runtimeModule;
  assert.equal(typeof publishProductionTunnelCredential, 'function');
  const root = fixture(t);
  const temporary = path.join(root, 'sqcm-i-inventory-production.json.tmp');
  const final = path.join(root, '22222222-2222-4222-8222-222222222222.json');
  const generated = '{"secret":"generated"}\n';
  const competing = '{"owner":"competing"}\n';
  fs.writeFileSync(temporary, generated, { flag: 'wx', mode: 0o600 });
  const realLink = fs.linkSync.bind(fs);
  const io = {
    ...fs,
    linkSync(source, destination) {
      fs.writeFileSync(destination, competing, { flag: 'wx', mode: 0o600 });
      return realLink(source, destination);
    }
  };
  assert.throws(
    () => publishProductionTunnelCredential({
      credentialDirectory: root,
      temporaryPath: temporary,
      finalPath: final,
      io
    }),
    /INGRESS_CREDENTIAL_ALREADY_EXISTS/
  );
  assert.equal(fs.readFileSync(final, 'utf8'), competing);
  assert.equal(fs.readFileSync(temporary, 'utf8'), generated);
});

test('provider tunnel 생성 성공은 credential 파싱·게시 실패 전에도 mutation으로 기록한다', () => {
  const command = entrypoint.indexOf("runCloudflared(['tunnel', 'create'");
  const marked = entrypoint.indexOf('tunnelCreated = true;', command);
  const parsed = entrypoint.indexOf('JSON.parse(createOutput)', command);
  const published = entrypoint.indexOf('publishProductionTunnelCredential({', command);
  assert.ok(command >= 0 && marked > command);
  assert.ok(marked < parsed && parsed < published);
});
