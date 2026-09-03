const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-provider-preflight-runtime.mjs');

test('provider preflight timeout은 stdout·stderr·오류 원문 없이 정규화한다', async () => {
  const { runProductionProviderPreflightProcess } = await modulePromise;
  assert.throws(
    () => runProductionProviderPreflightProcess(['exec', 'backend', 'node'], {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-provider-secret',
        stderr: 'stderr-provider-secret',
        error: Object.assign(new Error('timeout-provider-raw'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'PROVIDER_PREFLIGHT_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-provider-secret')
      && !String(error.stack).includes('stderr-provider-secret')
      && !String(error.stack).includes('timeout-provider-raw')
  );
});

test('container 조회 10초와 provider probe 150초는 1MiB·비가시 창 경계를 공유한다', async () => {
  const { runProductionProviderPreflightProcess } = await modulePromise;
  const observed = [];
  const spawnClient = (_command, _args, options) => {
    observed.push(options);
    return { status: 0, stdout: '{"status":"ok"}\n', stderr: 'discarded-stderr' };
  };
  const query = runProductionProviderPreflightProcess(['ps'], { spawnClient });
  const probe = runProductionProviderPreflightProcess(['exec'], { spawnClient, timeoutMs: 150_000 });
  assert.deepEqual(query, { status: 0, stdout: '{"status":"ok"}\n' });
  assert.deepEqual(probe, { status: 0, stdout: '{"status":"ok"}\n' });
  assert.equal(observed[0].timeout, 10_000);
  assert.equal(observed[1].timeout, 150_000);
  assert.equal(observed[0].maxBuffer, 1024 * 1024);
  assert.equal(observed[1].maxBuffer, 1024 * 1024);
  assert.equal(observed[0].windowsHide, true);
});

test('provider process 실패는 stdout·stderr를 반환하거나 오류에 포함하지 않는다', async () => {
  const { runProductionProviderPreflightProcess } = await modulePromise;
  assert.throws(
    () => runProductionProviderPreflightProcess(['exec'], {
      spawnClient: () => ({ status: 1, stdout: 'stdout-sensitive', stderr: 'stderr-sensitive' })
    }),
    (error) => error.message === 'PROVIDER_PREFLIGHT_PROCESS_FAILED'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
  );
});

test('Production backend container ID는 정확히 한 개만 허용하고 원문을 숨긴다', async () => {
  const { parseProductionProviderContainerId } = await modulePromise;
  assert.equal(parseProductionProviderContainerId('abc123def456\n'), 'abc123def456');
  assert.throws(
    () => parseProductionProviderContainerId('abc123def456\nfeedface1234\n'),
    (error) => error.message === 'PROVIDER_PREFLIGHT_CONTAINER_RESULT_INVALID'
      && !String(error.stack).includes('feedface1234')
  );
});

test('provider observation은 마지막 JSON 객체만 허용하고 비정상 원문을 숨긴다', async () => {
  const { parseProductionProviderObservation } = await modulePromise;
  assert.deepEqual(parseProductionProviderObservation('notice\n{"fileStorage":{"status":"ok"}}\n'), {
    fileStorage: { status: 'ok' }
  });
  for (const invalid of ['', 'provider-sensitive-invalid-json', '[]']) {
    assert.throws(
      () => parseProductionProviderObservation(invalid),
      (error) => error.message === 'PROVIDER_PREFLIGHT_OBSERVATION_INVALID'
        && (invalid === '' || !String(error.stack).includes(invalid))
    );
  }
});
