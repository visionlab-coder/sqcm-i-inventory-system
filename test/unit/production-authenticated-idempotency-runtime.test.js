const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-authenticated-idempotency-runtime.mjs');

test('authenticated idempotency HTTP timeout은 credential·응답 원문 없이 정규화한다', async () => {
  const { requestAuthenticatedIdempotencyHttp } = await modulePromise;
  const credential = 'credential-must-not-escape';
  const providerBody = 'provider-body-must-not-escape';
  await assert.rejects(
    requestAuthenticatedIdempotencyHttp({
      url: 'https://inventory.safe-link.co.kr/api/auth/login',
      options: { headers: { authorization: credential } },
      fetchClient: async () => { throw Object.assign(new Error(providerBody), { name: 'TimeoutError' }); }
    }),
    (error) => error.message === 'AUTHENTICATED_IDEMPOTENCY_HTTP_TIMEOUT'
      && !String(error.stack).includes(credential)
      && !String(error.stack).includes(providerBody)
  );
});

test('authenticated idempotency network 실패는 원문 없이 정규화한다', async () => {
  const { requestAuthenticatedIdempotencyHttp } = await modulePromise;
  await assert.rejects(
    requestAuthenticatedIdempotencyHttp({
      url: 'http://127.0.0.1:3300/api/auth/csrf',
      fetchClient: async () => { throw new Error('socket-address-and-provider-raw'); }
    }),
    (error) => error.message === 'AUTHENTICATED_IDEMPOTENCY_HTTP_FAILED'
      && !String(error.stack).includes('socket-address-and-provider-raw')
  );
});

test('authenticated idempotency HTTP 요청은 10초 이하 AbortSignal을 전달한다', async () => {
  const { requestAuthenticatedIdempotencyHttp } = await modulePromise;
  let received = null;
  const response = { status: 200 };
  const result = await requestAuthenticatedIdempotencyHttp({
    url: 'http://127.0.0.1:3300/health',
    fetchClient: async (_url, options) => { received = options; return response; }
  });
  assert.equal(result, response);
  assert.ok(received.signal instanceof AbortSignal);
});

test('authenticated idempotency JSON 파싱 실패는 provider 본문 없이 빈 객체로 닫는다', async () => {
  const { readAuthenticatedIdempotencyJson } = await modulePromise;
  const result = await readAuthenticatedIdempotencyJson({
    json: async () => { throw new Error('provider-json-raw'); }
  });
  assert.deepEqual(result, {});
});

test('Docker process timeout은 stdout·stderr 원문 없이 bounded 실패가 된다', async () => {
  const { runAuthenticatedIdempotencyProcess } = await modulePromise;
  assert.throws(
    () => runAuthenticatedIdempotencyProcess('docker', ['ps'], {
      spawnClient: () => ({ status: null, signal: 'SIGTERM', stdout: 'secret-stdout', stderr: 'secret-stderr', error: Object.assign(new Error('raw-timeout'), { code: 'ETIMEDOUT' }) })
    }),
    (error) => error.message === 'AUTHENTICATED_IDEMPOTENCY_PROCESS_TIMEOUT'
      && !String(error.stack).includes('secret-stdout')
      && !String(error.stack).includes('secret-stderr')
      && !String(error.stack).includes('raw-timeout')
  );
});

test('Docker process는 10초·1MiB·비가시 창 제한을 전달한다', async () => {
  const { runAuthenticatedIdempotencyProcess } = await modulePromise;
  let received = null;
  const result = runAuthenticatedIdempotencyProcess('docker', ['ps'], {
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: 'container-id\n', stderr: '' };
    }
  });
  assert.equal(result.stdout, 'container-id\n');
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
});

test('실패 cleanup은 DB 정리 실패와 무관하게 logout도 시도하고 오류 원문을 숨긴다', async () => {
  const { cleanupAuthenticatedIdempotencyRun } = await modulePromise;
  const calls = [];
  const result = await cleanupAuthenticatedIdempotencyRun({
    cleanupDatabase: async () => { calls.push('database'); throw new Error('database-secret-raw'); },
    logout: async () => { calls.push('logout'); throw new Error('logout-secret-raw'); }
  });
  assert.deepEqual(calls, ['database', 'logout']);
  assert.deepEqual(result, {
    databaseCleanupAttempted: true,
    databaseCleanupSucceeded: false,
    logoutAttempted: true,
    logoutSucceeded: false
  });
  assert.equal(JSON.stringify(result).includes('secret-raw'), false);
});
