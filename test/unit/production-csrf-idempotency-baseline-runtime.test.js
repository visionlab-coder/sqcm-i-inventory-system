const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-csrf-idempotency-baseline-runtime.mjs');

test('CSRF baseline Docker timeout은 stdout·stderr·오류 원문 없이 정규화한다', async () => {
  const { runCsrfIdempotencyBaselineProcess } = await modulePromise;
  assert.throws(
    () => runCsrfIdempotencyBaselineProcess(['exec', 'database', 'psql'], {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-sensitive',
        stderr: 'stderr-sensitive',
        error: Object.assign(new Error('timeout-provider-raw'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'CSRF_BASELINE_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('timeout-provider-raw')
  );
});

test('CSRF baseline process는 10초·1MiB 상한과 비가시 창을 사용한다', async () => {
  const { runCsrfIdempotencyBaselineProcess } = await modulePromise;
  let received = null;
  const result = runCsrfIdempotencyBaselineProcess(['ps'], {
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: 'abc123def456\n', stderr: 'discarded' };
    }
  });
  assert.deepEqual(result, { status: 0, stdout: 'abc123def456\n' });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
});

test('CSRF baseline HTTP timeout과 network 실패는 응답 원문 없이 분리한다', async () => {
  const { requestCsrfIdempotencyBaseline } = await modulePromise;
  await assert.rejects(
    requestCsrfIdempotencyBaseline({
      url: 'http://127.0.0.1:3300/api/auth/login',
      fetchClient: async () => { throw Object.assign(new Error('http-timeout-raw'), { name: 'TimeoutError' }); }
    }),
    (error) => error.message === 'CSRF_BASELINE_HTTP_TIMEOUT' && !String(error.stack).includes('http-timeout-raw')
  );
  await assert.rejects(
    requestCsrfIdempotencyBaseline({
      url: 'http://127.0.0.1:3300/api/auth/login',
      fetchClient: async () => { throw new Error('http-network-raw'); }
    }),
    (error) => error.message === 'CSRF_BASELINE_HTTP_FAILED' && !String(error.stack).includes('http-network-raw')
  );
});

test('Production database container ID는 정확히 한 개만 허용한다', async () => {
  const { parseCsrfIdempotencyBaselineContainerId } = await modulePromise;
  assert.equal(parseCsrfIdempotencyBaselineContainerId('abc123def456\n'), 'abc123def456');
  assert.throws(
    () => parseCsrfIdempotencyBaselineContainerId('abc123def456\nfeedface1234\n'),
    (error) => error.message === 'CSRF_BASELINE_CONTAINER_RESULT_INVALID'
      && !String(error.stack).includes('feedface1234')
  );
});

test('session count는 단일 비음수 정수만 허용한다', async () => {
  const { parseCsrfIdempotencyBaselineCount } = await modulePromise;
  assert.equal(parseCsrfIdempotencyBaselineCount('0\n'), 0);
  assert.equal(parseCsrfIdempotencyBaselineCount('12\n'), 12);
  for (const invalid of ['', '-1', '1.5', 'one', '1\n2']) {
    assert.throws(
      () => parseCsrfIdempotencyBaselineCount(invalid),
      (error) => error.message === 'CSRF_BASELINE_DB_RESULT_INVALID'
        && (invalid === '' || !String(error.stack).includes(invalid))
    );
  }
});

test('idempotency schema 결과는 정확히 5개 비음수 정수만 허용한다', async () => {
  const { parseCsrfIdempotencyBaselineSchema } = await modulePromise;
  assert.deepEqual(parseCsrfIdempotencyBaselineSchema('10,1,0,0,0\n'), [10, 1, 0, 0, 0]);
  for (const invalid of ['10,1,0,0', '10,1,0,0,-1', '10,1,0,0,NaN']) {
    assert.throws(
      () => parseCsrfIdempotencyBaselineSchema(invalid),
      (error) => error.message === 'CSRF_BASELINE_DB_RESULT_INVALID'
        && !String(error.stack).includes(invalid)
    );
  }
});
