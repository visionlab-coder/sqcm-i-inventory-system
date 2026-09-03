const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-nonfunctional-runtime.mjs');

test('nonfunctional child timeout은 stdout·stderr·오류 원문 없이 정규화한다', async () => {
  const { runProductionNonfunctionalProcess } = await modulePromise;
  assert.throws(
    () => runProductionNonfunctionalProcess({ target: 'http://127.0.0.1:3300', allowRemote: false }, {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-sensitive',
        stderr: 'stderr-sensitive',
        error: Object.assign(new Error('provider-timeout-raw'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'NONFUNCTIONAL_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('provider-timeout-raw')
  );
});

test('nonfunctional child는 120초·1MiB 상한과 비가시 창을 사용한다', async () => {
  const { runProductionNonfunctionalProcess } = await modulePromise;
  let received = null;
  const result = runProductionNonfunctionalProcess({ target: 'http://127.0.0.1:3300', allowRemote: false }, {
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: '{"target":"http://127.0.0.1:3300"}', stderr: 'discarded-sensitive' };
    }
  });
  assert.deepEqual(result, { status: 0, stdout: '{"target":"http://127.0.0.1:3300"}' });
  assert.equal(received.timeout, 120_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
  assert.equal(received.shell, false);
});

test('child 환경은 runtime 필수값만 추가하고 unrelated Secret을 상속하지 않는다', async () => {
  const { buildProductionNonfunctionalChildEnvironment } = await modulePromise;
  const env = buildProductionNonfunctionalChildEnvironment({
    sourceEnv: { PATH: 'safe-path', SystemRoot: 'safe-root', GITHUB_TOKEN: 'secret', DATABASE_URL: 'secret-db' },
    target: 'http://127.0.0.1:3300',
    allowRemote: false
  });
  assert.equal(env.PATH, 'safe-path');
  assert.equal(env.SystemRoot, 'safe-root');
  assert.equal(env.NONFUNCTIONAL_BASE_URL, 'http://127.0.0.1:3300');
  assert.equal(env.LOAD_REQUESTS, '60');
  assert.equal(env.LOAD_CONCURRENCY, '6');
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.DATABASE_URL, undefined);
});

test('child output은 exact target·load·security PASS만 허용한다', async () => {
  const { parseProductionNonfunctionalResult } = await modulePromise;
  const payload = {
    checkedAt: '2026-09-02T00:00:00.000Z',
    target: 'http://127.0.0.1:3300',
    load: { requests: 60, errors: 0, errorRate: 0, p95Ms: 12.3, ok: true, limits: { maxP95Ms: 1000, maxErrorRate: 0 } },
    security: { ok: true, headers: { csp: 'x', frame: 'DENY', nosniff: 'nosniff', permissions: 'x' }, anonymousStatus: 401, crossSiteStatus: 403, crossSiteCode: 'CROSS_SITE_REQUEST' }
  };
  const parsed = parseProductionNonfunctionalResult(`noise\n${JSON.stringify(payload)}\npassed`, { expectedTarget: payload.target });
  assert.equal(parsed.load.requests, 60);
  assert.equal(parsed.security.crossSiteStatus, 403);
});

test('malformed·target mismatch·partial PASS child output은 fail-closed한다', async () => {
  const { parseProductionNonfunctionalResult } = await modulePromise;
  const valid = {
    checkedAt: '2026-09-02T00:00:00.000Z', target: 'http://127.0.0.1:3300',
    load: { requests: 60, errors: 0, errorRate: 0, p95Ms: 10, ok: true, limits: { maxP95Ms: 1000, maxErrorRate: 0 } },
    security: { ok: true, headers: { csp: 'x', frame: 'DENY', nosniff: 'nosniff', permissions: 'x' }, anonymousStatus: 401, crossSiteStatus: 403, crossSiteCode: 'CROSS_SITE_REQUEST' }
  };
  for (const output of [
    'sensitive-malformed-output',
    JSON.stringify({ ...valid, target: 'https://wrong.invalid' }),
    JSON.stringify({ ...valid, load: { ...valid.load, requests: 59 } }),
    JSON.stringify({ ...valid, security: { ...valid.security, ok: false } })
  ]) {
    assert.throws(
      () => parseProductionNonfunctionalResult(output, { expectedTarget: valid.target }),
      (error) => error.message === 'NONFUNCTIONAL_RESULT_INVALID'
        && !String(error.stack).includes('sensitive-malformed-output')
    );
  }
});

test('child process 실패와 상한 확대는 fail-closed한다', async () => {
  const { runProductionNonfunctionalProcess } = await modulePromise;
  assert.throws(
    () => runProductionNonfunctionalProcess({ target: 'http://127.0.0.1:3300', allowRemote: false }, { timeoutMs: 120_001 }),
    (error) => error.message === 'NONFUNCTIONAL_PROCESS_LIMIT_INVALID'
  );
  assert.throws(
    () => runProductionNonfunctionalProcess({ target: 'http://127.0.0.1:3300', allowRemote: false }, {
      spawnClient: () => ({ status: 1, stdout: 'raw-output', stderr: 'raw-error' })
    }),
    (error) => error.message === 'NONFUNCTIONAL_PROCESS_FAILED'
      && !String(error.stack).includes('raw-output')
      && !String(error.stack).includes('raw-error')
  );
});
