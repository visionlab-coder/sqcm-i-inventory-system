const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-role-core-smoke-runtime.mjs');

test('role smoke HTTP timeout을 응답·credential 원문 없이 정규화한다', async () => {
  const { requestRoleSmokeHttp } = await runtimeModule;
  await assert.rejects(
    requestRoleSmokeHttp({
      url: 'https://inventory.safe-link.co.kr/api/auth/login',
      timeoutMs: 25,
      fetchImpl: async () => {
        const error = new Error('sensitive credential and response');
        error.name = 'AbortError';
        throw error;
      }
    }),
    (error) => error.message === 'ROLE_SMOKE_HTTP_TIMEOUT'
  );
});

test('role smoke network 실패를 원문 없이 정규화한다', async () => {
  const { requestRoleSmokeHttp } = await runtimeModule;
  await assert.rejects(
    requestRoleSmokeHttp({
      url: 'http://127.0.0.1:3300/api/auth/csrf',
      fetchImpl: async () => { throw new Error('sensitive network detail'); }
    }),
    (error) => error.message === 'ROLE_SMOKE_HTTP_FAILED'
  );
});

test('role smoke 요청은 10초 이하 signal과 안전한 응답만 전달한다', async () => {
  const { requestRoleSmokeHttp } = await runtimeModule;
  const expected = { status: 200, url: 'http://127.0.0.1:3300/api/auth/csrf' };
  const actual = await requestRoleSmokeHttp({
    url: expected.url,
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal);
      return expected;
    }
  });
  assert.equal(actual, expected);
});

test('role smoke JSON 파싱 실패는 provider 본문을 기록하지 않고 빈 객체로 닫는다', async () => {
  const { readRoleSmokeJson } = await runtimeModule;
  const result = await readRoleSmokeJson({
    json: async () => { throw new Error('sensitive provider body'); }
  });
  assert.deepEqual(result, {});
  assert.equal(JSON.stringify(result).includes('sensitive'), false);
});

test('MFA 뒤 중간 실패 cleanup은 bounded logout을 호출하고 오류 원문을 숨긴다', async () => {
  const { cleanupRoleSmokeSession } = await runtimeModule;
  let logoutCount = 0;
  const success = await cleanupRoleSmokeSession({
    session:{ cookie:'session-cookie',token:'csrf-token' },
    logout:async () => { logoutCount += 1; }
  });
  const failure = await cleanupRoleSmokeSession({
    session:{ cookie:'session-cookie',token:'csrf-token' },
    logout:async () => { logoutCount += 1; throw new Error('sensitive cleanup response'); }
  });

  assert.equal(logoutCount, 2);
  assert.deepEqual(success, { attempted:true,succeeded:true });
  assert.deepEqual(failure, { attempted:true,succeeded:false });
  assert.equal(JSON.stringify(failure).includes('sensitive'), false);
});
