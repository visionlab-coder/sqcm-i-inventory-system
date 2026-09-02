const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

test('cutover preflight는 최신 Production backup의 physical bytes와 checksum을 bounded 검증한다', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'production-cutover-preflight.mjs'), 'utf8');

  assert.match(source, /selectLatestVerifiedOperationalHealthBackup/);
  assert.match(source, /await selectLatestVerifiedOperationalHealthBackup\(\{[\s\S]*requireRestoreVerified:\s*true/);
  assert.doesNotMatch(source, /readFileSync\(backupManifestPath/);
});
