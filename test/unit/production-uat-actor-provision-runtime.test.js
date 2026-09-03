const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePromise = import('../../src/operations/production-uat-actor-provision-runtime.mjs');

test('UAT actor Docker timeout은 credential·stdout·stderr 원문 없이 정규화한다', async () => {
  const { runProductionUatActorProcess } = await modulePromise;
  assert.throws(
    () => runProductionUatActorProcess(['exec', 'backend', 'node', '/tmp/worker'], {
      input: 'credential-input-raw',
      spawnClient: () => ({ status: null, stdout: 'stdout-secret', stderr: 'stderr-secret', error: Object.assign(new Error('timeout-raw'), { code: 'ETIMEDOUT' }) })
    }),
    (error) => error.message === 'UAT_ACTOR_PROCESS_TIMEOUT'
      && !String(error.stack).includes('credential-input-raw')
      && !String(error.stack).includes('stdout-secret')
      && !String(error.stack).includes('stderr-secret')
      && !String(error.stack).includes('timeout-raw')
  );
});

test('UAT actor worker process는 60초·1MiB 상한과 비가시 창을 사용한다', async () => {
  const { runProductionUatActorProcess } = await modulePromise;
  let received = null;
  const result = runProductionUatActorProcess(['exec', '-i', 'backend', 'node', '/tmp/worker'], {
    input: '{"redacted":true}',
    timeoutMs: 60_000,
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: '{"status":"ok"}', stderr: '' };
    }
  });
  assert.equal(result.status, 0);
  assert.equal(received.timeout, 60_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
  assert.equal(received.input, '{"redacted":true}');
});

test('UAT actor process 결과는 stderr 원문을 호출자에게 반환하지 않는다', async () => {
  const { runProductionUatActorProcess } = await modulePromise;
  const result = runProductionUatActorProcess(['ps'], {
    spawnClient: () => ({ status: 0, stdout: 'backend-id\n', stderr: 'provider-secret-stderr' })
  });
  assert.deepEqual(result, { status: 0, stdout: 'backend-id\n' });
});

test('worker JSON 파싱 실패는 worker 출력 원문 없이 bounded 오류가 된다', async () => {
  const { parseProductionUatActorWorkerResult } = await modulePromise;
  assert.throws(
    () => parseProductionUatActorWorkerResult('credential-like-invalid-json'),
    (error) => error.message === 'UAT_ACTOR_WORKER_RESULT_INVALID'
      && !String(error.stack).includes('credential-like-invalid-json')
  );
});

test('임시 worker cleanup 실패는 시도 사실만 반환하고 오류 원문을 숨긴다', async () => {
  const { cleanupProductionUatActorWorker } = await modulePromise;
  const result = await cleanupProductionUatActorWorker({
    removeWorker: async () => { throw new Error('cleanup-provider-secret'); }
  });
  assert.deepEqual(result, { attempted: true, succeeded: false });
  assert.equal(JSON.stringify(result).includes('cleanup-provider-secret'), false);
});

test('UAT actor 진입점은 실행별 worker 경로와 exact root cleanup을 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-uat-actor-provision.mjs'), 'utf8');
  assert.match(source, /production-uat-actor-provision-worker-\$\{process\.pid\}\.cjs/);
  assert.match(source, /\['exec','--user','0',backend,'rm','-f',WORKER_CONTAINER\]/);
});
