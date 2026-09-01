const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('../../src/operations/operations-activation-process-runner.mjs');

function temporaryProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqcmi-p7-child-termination-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('실제 activation child timeout을 원문 없이 제한된 실패 상태로 정규화한다', async (t) => {
  const { spawnOperationsActivationChild } = await modulePromise;
  const projectRoot = temporaryProject(t);
  fs.writeFileSync(path.join(projectRoot, 'scripts', 'timeout.mjs'), 'setInterval(() => {}, 1000);\n');

  const result = spawnOperationsActivationChild({
    projectRoot,
    step: { script: 'timeout.mjs', args: [] },
    environment: { PATH: process.env.PATH ?? '' },
    timeoutMs: 50,
    maxBufferBytes: 4096
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.failureStatus, 'FAIL_OPERATIONS_ACTIVATION_CHILD_TIMEOUT');
  assert.equal('error' in result, false);
});

test('실제 activation child 출력 한도 초과를 제한된 실패 상태로 정규화한다', async (t) => {
  const { spawnOperationsActivationChild } = await modulePromise;
  const projectRoot = temporaryProject(t);
  fs.writeFileSync(path.join(projectRoot, 'scripts', 'overflow.mjs'), "process.stdout.write('x'.repeat(8192));\n");

  const result = spawnOperationsActivationChild({
    projectRoot,
    step: { script: 'overflow.mjs', args: [] },
    environment: { PATH: process.env.PATH ?? '' },
    timeoutMs: 5000,
    maxBufferBytes: 512
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.failureStatus, 'FAIL_OPERATIONS_ACTIVATION_CHILD_OUTPUT_LIMIT');
  assert.equal('error' in result, false);
});
