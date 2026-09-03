const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-rollback-readiness-runtime.mjs');

test('rollback Docker timeout은 출력과 provider 오류 원문 없이 정규화한다', async () => {
  const { runRollbackReadinessDocker } = await modulePromise;
  assert.throws(
    () => runRollbackReadinessDocker(['ps'], {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-sensitive',
        stderr: 'stderr-sensitive',
        error: Object.assign(new Error('provider-sensitive'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'ROLLBACK_READINESS_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('provider-sensitive')
  );
});

test('rollback Docker 실행은 10초·1MiB·비가시 창 상한을 강제한다', async () => {
  const { runRollbackReadinessDocker } = await modulePromise;
  let received;
  const result = runRollbackReadinessDocker(['ps'], {
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: 'abc123def456\n', stderr: '' };
    }
  });
  assert.deepEqual(result, { status: 0, stdout: 'abc123def456\n', stderr: '' });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
  assert.throws(() => runRollbackReadinessDocker(['ps'], { timeoutMs: 10_001 }), /ROLLBACK_READINESS_PROCESS_LIMIT_INVALID/);
  assert.throws(() => runRollbackReadinessDocker(['ps'], { maxBuffer: (1024 * 1024) + 1 }), /ROLLBACK_READINESS_PROCESS_LIMIT_INVALID/);
});

test('Production container ID는 정확히 한 개의 Docker ID만 허용한다', async () => {
  const { parseRollbackContainerId } = await modulePromise;
  assert.equal(parseRollbackContainerId('abc123def456\n'), 'abc123def456');
  for (const invalid of ['', 'short', 'ABC123DEF456', 'abc123def456\nfeedface1234', 'abc123def456 extra']) {
    assert.throws(() => parseRollbackContainerId(invalid), /ROLLBACK_READINESS_CONTAINER_RESULT_INVALID/);
  }
});

test('Docker inspect는 정확히 한 container와 유효한 revision·image만 허용한다', async () => {
  const { parseRollbackInspect } = await modulePromise;
  const sha = 'a'.repeat(40);
  const valid = JSON.stringify([{ Id: 'abc123def456', Config: { Image: 'inventory/backend:sha', Labels: { 'org.opencontainers.image.revision': sha } } }]);
  assert.deepEqual(parseRollbackInspect(valid, 'abc123def456'), { revision: sha, image: 'inventory/backend:sha' });
  for (const invalid of [
    'not-json',
    '[]',
    JSON.stringify([{}, {}]),
    JSON.stringify([{ Id: 'different1234', Config: { Image: 'image', Labels: { 'org.opencontainers.image.revision': sha } } }]),
    JSON.stringify([{ Id: 'abc123def456', Config: { Image: '', Labels: { 'org.opencontainers.image.revision': sha } } }]),
    JSON.stringify([{ Id: 'abc123def456', Config: { Image: 'image', Labels: { 'org.opencontainers.image.revision': 'latest' } } }])
  ]) {
    assert.throws(
      () => parseRollbackInspect(invalid, 'abc123def456'),
      (error) => error.message === 'ROLLBACK_READINESS_INSPECT_RESULT_INVALID'
        && !String(error.stack).includes('not-json')
    );
  }
});

test('Production volume 목록은 유효하고 중복 없는 이름만 허용한다', async () => {
  const { parseRollbackVolumes } = await modulePromise;
  assert.deepEqual(parseRollbackVolumes('project_postgres-data\nproject_file-data\n'), ['project_postgres-data', 'project_file-data']);
  for (const invalid of ['', 'project_data\nproject_data', 'bad volume', '../escape']) {
    assert.throws(() => parseRollbackVolumes(invalid), /ROLLBACK_READINESS_VOLUME_RESULT_INVALID/);
  }
});

test('Docker 비정상 종료는 stdout·stderr를 노출하지 않고 실패한다', async () => {
  const { runRollbackReadinessDocker } = await modulePromise;
  assert.throws(
    () => runRollbackReadinessDocker(['inspect'], {
      spawnClient: () => ({ status: 1, stdout: 'stdout-secret', stderr: 'stderr-secret' })
    }),
    (error) => error.message === 'ROLLBACK_READINESS_PROCESS_FAILED'
      && !String(error.stack).includes('stdout-secret')
      && !String(error.stack).includes('stderr-secret')
  );
});
