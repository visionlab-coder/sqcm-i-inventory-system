const test = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../../src/operations/production-role-preflight-runtime.mjs');

test('role preflight Docker timeout은 stdout·stderr·오류 원문 없이 정규화한다', async () => {
  const { runProductionRolePreflightProcess } = await modulePromise;
  assert.throws(
    () => runProductionRolePreflightProcess(['exec', 'database', 'psql'], {
      spawnClient: () => ({
        status: null,
        stdout: 'stdout-sensitive',
        stderr: 'stderr-sensitive',
        error: Object.assign(new Error('timeout-provider-raw'), { code: 'ETIMEDOUT' })
      })
    }),
    (error) => error.message === 'ROLE_PREFLIGHT_PROCESS_TIMEOUT'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
      && !String(error.stack).includes('timeout-provider-raw')
  );
});

test('role preflight process는 10초·1MiB 상한과 비가시 창을 사용한다', async () => {
  const { runProductionRolePreflightProcess } = await modulePromise;
  let received = null;
  const result = runProductionRolePreflightProcess(['ps'], {
    spawnClient: (_command, _args, options) => {
      received = options;
      return { status: 0, stdout: 'container-id\n', stderr: '' };
    }
  });
  assert.deepEqual(result, { status: 0, stdout: 'container-id\n' });
  assert.equal(received.timeout, 10_000);
  assert.equal(received.maxBuffer, 1024 * 1024);
  assert.equal(received.windowsHide, true);
});

test('role preflight process 실패는 stderr를 반환하거나 오류에 포함하지 않는다', async () => {
  const { runProductionRolePreflightProcess } = await modulePromise;
  assert.throws(
    () => runProductionRolePreflightProcess(['ps'], {
      spawnClient: () => ({ status: 1, stdout: 'stdout-sensitive', stderr: 'stderr-sensitive' })
    }),
    (error) => error.message === 'ROLE_PREFLIGHT_PROCESS_FAILED'
      && !String(error.stack).includes('stdout-sensitive')
      && !String(error.stack).includes('stderr-sensitive')
  );
});

test('Production database container ID는 정확히 한 개만 허용하고 원문을 숨긴다', async () => {
  const { parseProductionRolePreflightContainerId } = await modulePromise;
  assert.equal(parseProductionRolePreflightContainerId('abc123def456\n'), 'abc123def456');
  assert.throws(
    () => parseProductionRolePreflightContainerId('abc123def456\nfeedface1234\n'),
    (error) => error.message === 'ROLE_PREFLIGHT_CONTAINER_RESULT_INVALID'
      && !String(error.stack).includes('feedface1234')
  );
});

test('role/MFA SQL 결과는 정규화하고 malformed·duplicate·unknown role을 fail-closed한다', async () => {
  const { parseProductionRolePreflightCounts } = await modulePromise;
  assert.deepEqual(parseProductionRolePreflightCounts('ADMIN,1,1\nMANAGER,2,1\nUSER,1,1\n'), {
    ADMIN: { active: 1, mfaEnabled: 1 },
    MANAGER: { active: 2, mfaEnabled: 1 },
    USER: { active: 1, mfaEnabled: 1 }
  });
  for (const invalid of ['ADMIN,one,1\n', 'ADMIN,1,1\nADMIN,1,1\n', 'OWNER,1,1\n']) {
    assert.throws(
      () => parseProductionRolePreflightCounts(invalid),
      (error) => error.message === 'ROLE_PREFLIGHT_DB_RESULT_INVALID'
        && !String(error.stack).includes(invalid.trim())
    );
  }
});
