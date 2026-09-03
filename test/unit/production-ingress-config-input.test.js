const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');

test('Production ingress existing config uses bounded physical reader', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../scripts/production-ingress-publication.mjs'),
    'utf8'
  );
  assert.match(source, /readProductionIngressConfig/);
  assert.doesNotMatch(source, /readFileSync\(PRODUCTION_INGRESS_TARGET\.configPath/);
});

test('existing ingress config is exact, physical, bounded, stable UTF-8', async (t) => {
  const { readProductionIngressConfig } = await runtimeModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'cloudflared.yml');
  fs.writeFileSync(config, 'tunnel: test\n');
  assert.deepEqual(readProductionIngressConfig({ runtimeDirectory: root, configPath: config }), {
    text: 'tunnel: test\n',
    bytes: 13
  });
  const invalid = path.join(root, 'invalid.yml');
  fs.writeFileSync(invalid, 'x');
  assert.throws(
    () => readProductionIngressConfig({ runtimeDirectory: root, configPath: invalid }),
    /INGRESS_CONFIG_PATH_INVALID/
  );
});

test('oversize ingress config is rejected before body read', async (t) => {
  const { readProductionIngressConfig } = await runtimeModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'cloudflared.yml');
  fs.writeFileSync(config, Buffer.alloc(16 * 1024 + 1));
  const io = Object.create(fs);
  let readCount = 0;
  io.readFileSync = (...args) => { readCount += 1; return fs.readFileSync(...args); };
  assert.throws(
    () => readProductionIngressConfig({ runtimeDirectory: root, configPath: config, io }),
    /INGRESS_CONFIG_BYTES_INVALID/
  );
  assert.equal(readCount, 0);
});

test('invalid UTF-8 ingress config is rejected without decoded content', async (t) => {
  const { readProductionIngressConfig } = await runtimeModule;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-ingress-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, 'cloudflared.yml');
  fs.writeFileSync(config, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readProductionIngressConfig({ runtimeDirectory: root, configPath: config }),
    /INGRESS_CONFIG_UTF8_INVALID/
  );
});
