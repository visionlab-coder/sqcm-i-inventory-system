const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const modulePromise = import('../../src/operations/production-operational-health-runtime.mjs');

test('operational health Docker timeout은 출력·오류 원문 없이 정규화한다', async () => {
  const { runOperationalHealthProcess } = await modulePromise;
  assert.throws(
    () => runOperationalHealthProcess(['logs', 'backend'], {
      spawnClient: () => ({ status: null, stdout: 'stdout-sensitive', stderr: 'stderr-sensitive', error: Object.assign(new Error('provider-raw'), { code: 'ETIMEDOUT' }) })
    }),
    (error) => error.message === 'OPERATIONAL_HEALTH_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('provider-raw')
  );
});

test('operational health process는 10초·허용 buffer·비가시 창을 사용한다', async () => {
  const { runOperationalHealthProcess } = await modulePromise;
  let received;
  const result = runOperationalHealthProcess(['ps'], {
    maxBuffer: 1024 * 1024,
    spawnClient: (_command, _args, options) => { received = options; return { status: 0, stdout: 'abc123def456\n', stderr: '' }; }
  });
  assert.deepEqual(result, { status: 0, stdout: 'abc123def456\n', stderr: '' });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
});

test('container와 operational counter 결과를 엄격 파싱한다', async () => {
  const { parseOperationalHealthContainerId, parseOperationalHealthCounters } = await modulePromise;
  assert.equal(parseOperationalHealthContainerId('abc123def456\n'), 'abc123def456');
  assert.deepEqual(parseOperationalHealthCounters('0,12,3\n'), [0, 12, 3]);
  assert.throws(() => parseOperationalHealthContainerId('abc123def456\nfeedface1234'), /OPERATIONAL_HEALTH_CONTAINER_RESULT_INVALID/);
  for (const invalid of ['', '0,1', '0,1,2,3', '-1,0,0', 'NaN,0,0']) {
    assert.throws(() => parseOperationalHealthCounters(invalid), /OPERATIONAL_HEALTH_DB_RESULT_INVALID/);
  }
});

test('backend logs는 JSON object 행만 허용하고 5xx를 계산한다', async () => {
  const { countOperationalHealthRecent5xx } = await modulePromise;
  assert.equal(countOperationalHealthRecent5xx({
    stdout: '{"event":"http_request","status":500}\n{"event":"http_request","status":200}\n',
    stderr: '{"event":"http_request","status":503}\n'
  }), 2);
  for (const invalid of ['not-json', '[]', 'null']) {
    assert.throws(
      () => countOperationalHealthRecent5xx({ stdout: invalid, stderr: '' }),
      (error) => error.message === 'OPERATIONAL_HEALTH_LOG_RESULT_INVALID'
        && !String(error.stack).includes(invalid)
    );
  }
});

test('backup은 physical file을 streaming checksum과 bytes로 검증한다', async () => {
  const { verifyOperationalHealthBackupFile } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-operational-backup-'));
  const file = path.join(root, 'backup.dump');
  const content = Buffer.from('physical-backup-content');
  fs.writeFileSync(file, content);
  try {
    const result = await verifyOperationalHealthBackupFile({
      backupRoot: root,
      manifest: { backupPath: file, bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') }
    });
    assert.equal(result.backupVerified, true);
    assert.equal(result.bytes, content.length);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('backup path escape·bytes·checksum 불일치는 fail-closed한다', async () => {
  const { verifyOperationalHealthBackupFile } = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-operational-backup-'));
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.dump`);
  fs.writeFileSync(outside, 'outside');
  const inside = path.join(root, 'inside.dump');
  fs.writeFileSync(inside, 'inside');
  const digest = crypto.createHash('sha256').update('inside').digest('hex');
  try {
    await assert.rejects(() => verifyOperationalHealthBackupFile({ backupRoot: root, manifest: { backupPath: outside, bytes: 7, sha256: crypto.createHash('sha256').update('outside').digest('hex') } }), /OPERATIONAL_HEALTH_BACKUP_PATH_INVALID/);
    await assert.rejects(() => verifyOperationalHealthBackupFile({ backupRoot: root, manifest: { backupPath: inside, bytes: 99, sha256: digest } }), /OPERATIONAL_HEALTH_BACKUP_BYTES_INVALID/);
    await assert.rejects(() => verifyOperationalHealthBackupFile({ backupRoot: root, manifest: { backupPath: inside, bytes: 6, sha256: '0'.repeat(64) } }), /OPERATIONAL_HEALTH_BACKUP_CHECKSUM_INVALID/);
  } finally { fs.rmSync(root, { recursive: true }); fs.rmSync(outside, { force: true }); }
});

test('process 실패와 상한 확대는 fail-closed한다', async () => {
  const { runOperationalHealthProcess } = await modulePromise;
  assert.throws(() => runOperationalHealthProcess(['ps'], { timeoutMs: 10_001 }), /OPERATIONAL_HEALTH_PROCESS_LIMIT_INVALID/);
  assert.throws(() => runOperationalHealthProcess(['logs'], { maxBuffer: (4 * 1024 * 1024) + 1 }), /OPERATIONAL_HEALTH_PROCESS_LIMIT_INVALID/);
  assert.throws(
    () => runOperationalHealthProcess(['ps'], { spawnClient: () => ({ status: 1, stdout: 'raw-output', stderr: 'raw-error' }) }),
    (error) => error.message === 'OPERATIONAL_HEALTH_PROCESS_FAILED'
      && !String(error.stack).includes('raw-output')
      && !String(error.stack).includes('raw-error')
  );
});
