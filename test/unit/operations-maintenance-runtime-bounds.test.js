const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-operational-health-runtime.mjs');

function createBackup(root, name, createdAt, content = `backup-${name}`) {
  const backupPath = path.join(root, `${name}.dump`);
  const raw = Buffer.from(content);
  fs.writeFileSync(backupPath, raw);
  const manifestPath = `${backupPath}.json`;
  const manifest = {
    schemaVersion: 1,
    createdAt,
    backupPath,
    bytes: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    restoreVerified: true,
    restoreDrillAt: createdAt
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { backupPath, manifestPath, manifest };
}

test('maintenance backup manifest는 physical UTF-8 JSON object를 64KiB 이하로 읽는다', async (t) => {
  const { OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES, readOperationalHealthBackupManifest } = await modulePromise;
  assert.equal(OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES, 64 * 1024);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = createBackup(root, 'seowon-inventory-20260912T000000Z', '2026-09-12T00:00:00.000Z');
  const loaded = readOperationalHealthBackupManifest({ backupRoot: root, manifestPath: created.manifestPath });
  assert.equal(loaded.value.backupPath, created.backupPath);
  assert.equal(loaded.bytes, fs.statSync(created.manifestPath).size);
  assert.match(loaded.sha256, /^[a-f0-9]{64}$/);
});

test('maintenance backup manifest는 64KiB 초과를 JSON parse 전에 거부한다', async (t) => {
  const { OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES, readOperationalHealthBackupManifest } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'oversized.dump.json');
  fs.writeFileSync(manifestPath, Buffer.alloc(OPERATIONAL_HEALTH_BACKUP_MANIFEST_MAX_BYTES + 1, 0x7b));
  assert.throws(
    () => readOperationalHealthBackupManifest({ backupRoot: root, manifestPath }),
    /OPERATIONAL_HEALTH_BACKUP_MANIFEST_BYTES_INVALID/
  );
});

test('maintenance backup manifest는 invalid UTF-8·array·path escape를 fail-closed한다', async (t) => {
  const { readOperationalHealthBackupManifest } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-manifest-'));
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.dump.json`);
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { force: true }); });
  const invalidUtf8 = path.join(root, 'invalid.dump.json');
  fs.writeFileSync(invalidUtf8, Buffer.from([0xc3, 0x28]));
  assert.throws(() => readOperationalHealthBackupManifest({ backupRoot: root, manifestPath: invalidUtf8 }), /OPERATIONAL_HEALTH_BACKUP_MANIFEST_VALUE_INVALID/);
  const array = path.join(root, 'array.dump.json');
  fs.writeFileSync(array, '[]');
  assert.throws(() => readOperationalHealthBackupManifest({ backupRoot: root, manifestPath: array }), /OPERATIONAL_HEALTH_BACKUP_MANIFEST_JSON_INVALID/);
  fs.writeFileSync(outside, '{}');
  assert.throws(() => readOperationalHealthBackupManifest({ backupRoot: root, manifestPath: outside }), /OPERATIONAL_HEALTH_BACKUP_MANIFEST_PATH_INVALID/);
});

test('최신 maintenance backup은 bounded manifest와 streaming checksum으로 선택한다', async (t) => {
  const { selectLatestVerifiedOperationalHealthBackup } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-maintenance-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createBackup(root, 'seowon-inventory-20260911T000000Z', '2026-09-11T00:00:00.000Z');
  const newer = createBackup(root, 'seowon-inventory-20260912T000000Z', '2026-09-12T00:00:00.000Z');
  const selected = await selectLatestVerifiedOperationalHealthBackup({ backupRoot: root, requireRestoreVerified: true });
  assert.equal(selected.backupPath, newer.backupPath);
  assert.equal(selected.backupVerified, true);
  assert.equal(selected.bytes, newer.manifest.bytes);
});

test('maintenance와 operational health 진입점은 bounded process·manifest·streaming helper만 사용한다', () => {
  const maintenance = fs.readFileSync(path.resolve('scripts/operations-maintenance-runner.mjs'), 'utf8');
  const operational = fs.readFileSync(path.resolve('scripts/production-operational-health-baseline.mjs'), 'utf8');
  assert.match(maintenance, /runOperationalHealthProcess/);
  assert.match(maintenance, /selectLatestVerifiedOperationalHealthBackup/);
  assert.doesNotMatch(maintenance, /spawnSync\(/);
  assert.doesNotMatch(maintenance, /JSON\.parse\(fs\.readFileSync\(path\.join\(backupRoot/);
  assert.doesNotMatch(maintenance, /crypto\.createHash\('sha256'\)\.update\(fs\.readFileSync/);
  assert.match(operational, /selectLatestVerifiedOperationalHealthBackup/);
  assert.doesNotMatch(operational, /JSON\.parse\(fs\.readFileSync\(manifestPath/);
});
