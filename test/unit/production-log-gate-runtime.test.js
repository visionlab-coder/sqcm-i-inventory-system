const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-log-gate-runtime.mjs');

test('log gate Docker timeout은 stdout·stderr·오류 원문 없이 정규화한다', async () => {
  const { runProductionLogGateProcess } = await modulePromise;
  assert.throws(
    () => runProductionLogGateProcess(['logs', 'backend'], {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-sensitive',
        stderr: 'stderr-sensitive',
        error: Object.assign(new Error('provider-timeout-raw'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'LOG_GATE_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('provider-timeout-raw')
  );
});

test('log gate process는 10초·허용 buffer·비가시 창을 사용한다', async () => {
  const { runProductionLogGateProcess } = await modulePromise;
  let received = null;
  const result = runProductionLogGateProcess(['ps'], {
    maxBuffer: 1024 * 1024,
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: 'abc123def456\n', stderr: '' };
    }
  });
  assert.deepEqual(result, { status: 0, stdout: 'abc123def456\n', stderr: '' });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
});

test('Production container ID는 정확히 한 개만 허용한다', async () => {
  const { parseProductionLogGateContainerId } = await modulePromise;
  assert.equal(parseProductionLogGateContainerId('abc123def456\n'), 'abc123def456');
  assert.throws(
    () => parseProductionLogGateContainerId('abc123def456\nfeedface1234\n'),
    (error) => error.message === 'LOG_GATE_CONTAINER_RESULT_INVALID'
      && !String(error.stack).includes('feedface1234')
  );
});

test('backend 로그는 JSON object 행만 허용한다', async () => {
  const { parseProductionLogGateRecords } = await modulePromise;
  assert.deepEqual(parseProductionLogGateRecords({
    stdout: '{"event":"http_request","status":200}\n',
    stderr: '{"event":"outbox_published","level":"info"}\n'
  }), [
    { event: 'http_request', status: 200 },
    { event: 'outbox_published', level: 'info' }
  ]);
  for (const invalid of ['not-json', '[]', 'null']) {
    assert.throws(
      () => parseProductionLogGateRecords({ stdout: invalid, stderr: '' }),
      (error) => error.message === 'LOG_GATE_LOG_RESULT_INVALID'
        && !String(error.stack).includes(invalid)
    );
  }
});

test('outbox 결과는 정확히 두 개 비음수 정수만 허용한다', async () => {
  const { parseProductionLogGateOutboxCounts } = await modulePromise;
  assert.deepEqual(parseProductionLogGateOutboxCounts('0,12\n'), [0, 12]);
  for (const invalid of ['', '0', '0,1,2', '-1,0', 'NaN,0', '1.5,0']) {
    assert.throws(
      () => parseProductionLogGateOutboxCounts(invalid),
      (error) => error.message === 'LOG_GATE_DB_RESULT_INVALID'
    );
  }
  assert.throws(
    () => parseProductionLogGateOutboxCounts('sensitive-provider-row,0'),
    (error) => error.message === 'LOG_GATE_DB_RESULT_INVALID'
      && !String(error.stack).includes('sensitive-provider-row')
  );
});

test('process 상한 확대와 실패 결과는 fail-closed한다', async () => {
  const { runProductionLogGateProcess } = await modulePromise;
  assert.throws(
    () => runProductionLogGateProcess(['logs'], { timeoutMs: 10_001 }),
    (error) => error.message === 'LOG_GATE_PROCESS_LIMIT_INVALID'
  );
  assert.throws(
    () => runProductionLogGateProcess(['logs'], { maxBuffer: (4 * 1024 * 1024) + 1 }),
    (error) => error.message === 'LOG_GATE_PROCESS_LIMIT_INVALID'
  );
  assert.throws(
    () => runProductionLogGateProcess(['logs'], {
      spawnClient: () => ({ status: 1, stdout: 'raw-output', stderr: 'raw-error' })
    }),
    (error) => error.message === 'LOG_GATE_PROCESS_FAILED'
      && !String(error.stack).includes('raw-output')
      && !String(error.stack).includes('raw-error')
  );
});
