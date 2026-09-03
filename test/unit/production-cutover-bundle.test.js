const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-cutover-bundle.mjs');

test('cutover step bundle은 transitive local dependency bytes 변경을 digest로 구분한다', async (t) => {
  const { inspectProductionCutoverStepBundle } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-cutover-bundle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'scripts', 'production-cutover-preflight.mjs'), "import '../src/shared.mjs';\nconsole.log('ok');\n");
  fs.writeFileSync(path.join(root, 'src', 'shared.mjs'), "export const value = 1;\n");
  const step = { gate: 'artifact', id: 'cutover-preflight', script: 'scripts/production-cutover-preflight.mjs' };
  const first = inspectProductionCutoverStepBundle(root, step);
  fs.writeFileSync(path.join(root, 'src', 'shared.mjs'), "export const value = 2;\n");
  const second = inspectProductionCutoverStepBundle(root, step);
  assert.deepEqual(first.files, ['scripts/production-cutover-preflight.mjs', 'src/shared.mjs']);
  assert.notEqual(first.sha256, second.sha256);
});

test('현재 cutover manifest는 정상 14개와 containment 2개 step을 모두 결박한다', async () => {
  const { inspectProductionCutoverBundleManifest } = await modulePromise;
  const manifest = inspectProductionCutoverBundleManifest(path.resolve(__dirname, '../..'));
  assert.equal(Object.keys(manifest.stepBundles).length, 16);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.stepBundles['route_disable:route-disable'], /^[a-f0-9]{64}$/);
  assert.match(manifest.stepBundles['ingress_orphan_recovery:ingress-orphan-recovery'], /^[a-f0-9]{64}$/);
});

test('step gate 또는 script identity 변조는 file read 전에 거부한다', async () => {
  const { inspectProductionCutoverStepBundle } = await modulePromise;
  assert.throws(
    () => inspectProductionCutoverStepBundle(path.resolve(__dirname, '../..'), { gate: 'artifact', id: 'ingress-publication', script: 'scripts/production-ingress-publication.mjs' }),
    /CUTOVER_BUNDLE_STEP_CONTRACT_INVALID/
  );
});
