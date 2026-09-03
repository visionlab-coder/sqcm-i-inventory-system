const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');

const modulePromise = import('../../src/operations/operations-backup-restore-runtime.mjs');

test('backup/restore child timeout은 원문 없이 bounded status로 정규화한다', async () => {
  const { runBoundedBackupRestoreProcess } = await modulePromise;
  await assert.rejects(
    runBoundedBackupRestoreProcess({
      executable: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5000)'],
      timeoutMs: 50,
      failureStatus: 'BACKUP_FAILED',
      timeoutStatus: 'BACKUP_TIMEOUT'
    }),
    (error) => error.message === 'BACKUP_TIMEOUT' && !String(error).includes('setTimeout')
  );
});

test('stderr 상한 초과는 child를 종료하고 Secret 가능 원문을 노출하지 않는다', async () => {
  const { runBoundedBackupRestoreProcess } = await modulePromise;
  await assert.rejects(
    runBoundedBackupRestoreProcess({
      executable: process.execPath,
      args: ['-e', "process.stderr.write('s'.repeat(2048));setTimeout(() => {}, 5000)"],
      timeoutMs: 2000,
      maxStderrBytes: 1024,
      failureStatus: 'RESTORE_FAILED',
      timeoutStatus: 'RESTORE_TIMEOUT',
      outputLimitStatus: 'RESTORE_STDERR_LIMIT'
    }),
    (error) => error.message === 'RESTORE_STDERR_LIMIT' && !String(error).includes('ssss')
  );
});

test('streaming stdin/stdout은 메모리 buffering 없이 전달하고 종료 결과만 반환한다', async () => {
  const { runBoundedBackupRestoreProcess } = await modulePromise;
  const chunks = [];
  const result = await runBoundedBackupRestoreProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdin.pipe(process.stdout)'],
    stdin: Readable.from([Buffer.from('bounded-stream')]),
    stdout: new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }),
    // 전체 테스트가 병렬로 child process를 많이 실행하는 Windows 환경에서도
    // 정상 streaming 계약이 scheduler 지연을 timeout으로 오판하지 않게 한다.
    timeoutMs: 10000,
    failureStatus: 'STREAM_FAILED',
    timeoutStatus: 'STREAM_TIMEOUT'
  });
  assert.equal(Buffer.concat(chunks).toString(), 'bounded-stream');
  assert.deepEqual(result, { exitCode: 0, stderrBytes: 0, stderrTruncated: false });
});

test('runtime profile은 timeout·stderr 상한 확대와 shell 실행을 거부한다', async () => {
  const { runBoundedBackupRestoreProcess, BACKUP_RESTORE_MAX_TIMEOUT_MS } = await modulePromise;
  for (const patch of [
    { timeoutMs: 0 },
    { timeoutMs: BACKUP_RESTORE_MAX_TIMEOUT_MS + 1 },
    { maxStderrBytes: 0 },
    { maxStderrBytes: 1024 * 1024 + 1 }
  ]) {
    await assert.rejects(runBoundedBackupRestoreProcess({
      executable: process.execPath,
      args: ['-e', 'process.exit(0)'],
      failureStatus: 'INVALID',
      timeoutStatus: 'INVALID_TIMEOUT',
      ...patch
    }), /BACKUP_RESTORE_RUNTIME_PROFILE_INVALID/);
  }
});

test('backup/restore 진입점은 모든 docker process를 bounded runtime으로만 실행한다', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../../scripts/operations-backup-restore-runner.mjs'), 'utf8');
  assert.match(source, /runBoundedBackupRestoreProcess/);
  assert.doesNotMatch(source, /spawnSync\('docker'/);
  assert.doesNotMatch(source, /spawn\('docker'/);
});
