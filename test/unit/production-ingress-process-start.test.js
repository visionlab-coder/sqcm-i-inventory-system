const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const cloudflared = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const runtimeDirectory = 'D:\\seowon_runtime\\sqcm-i-inventory-production';
const configPath = `${runtimeDirectory}\\cloudflared.yml`;

function childProcess({ pid = 9603 } = {}) {
  const child = new EventEmitter();
  child.pid = pid;
  child.unrefCalls = 0;
  child.killCalls = 0;
  child.unref = () => { child.unrefCalls += 1; };
  child.kill = () => { child.killCalls += 1; return true; };
  return child;
}

test('spawn event와 유효 PID를 확인한 뒤에만 시작 성공을 반환한다', async () => {
  const { startProductionIngressProcess } = await runtimeModule;
  assert.equal(typeof startProductionIngressProcess, 'function');
  const child = childProcess();
  let invocation;
  const promise = startProductionIngressProcess({
    cloudflared,
    configPath,
    runtimeDirectory,
    spawnImpl(command, args, options) {
      invocation = { command, args, options };
      return child;
    }
  });
  child.emit('spawn');
  assert.deepEqual(await promise, {
    status: 'PASS_INGRESS_PROCESS_SPAWN_ACKNOWLEDGED',
    processId: 9603
  });
  assert.deepEqual(invocation, {
    command: cloudflared,
    args: [
      'tunnel', '--config', configPath, '--loglevel', 'info',
      '--logfile', `${runtimeDirectory}\\cloudflared.log`,
      '--pidfile', `${runtimeDirectory}\\cloudflared.pid`, 'run'
    ],
    options: { detached: true, stdio: 'ignore', windowsHide: true }
  });
  assert.equal(child.unrefCalls, 1);
  assert.equal(child.killCalls, 0);
});

test('비동기 spawn 오류는 원문을 노출하지 않고 fail-closed한다', async () => {
  const { startProductionIngressProcess } = await runtimeModule;
  const child = childProcess();
  const promise = startProductionIngressProcess({ cloudflared, configPath, runtimeDirectory, spawnImpl: () => child });
  child.emit('error', new Error('sensitive provider detail'));
  await assert.rejects(promise, /INGRESS_PROCESS_SPAWN_FAILED/);
  assert.equal(child.unrefCalls, 0);
});

test('bounded timeout이면 best-effort kill 후 성공 기록을 거부한다', async () => {
  const { startProductionIngressProcess } = await runtimeModule;
  const child = childProcess();
  await assert.rejects(
    startProductionIngressProcess({ cloudflared, configPath, runtimeDirectory, timeoutMs: 10, spawnImpl: () => child }),
    /INGRESS_PROCESS_SPAWN_TIMEOUT/
  );
  assert.equal(child.killCalls, 1);
  assert.equal(child.unrefCalls, 0);
});

test('spawn event의 PID가 없거나 비정상이면 프로세스를 정리하고 차단한다', async () => {
  const { startProductionIngressProcess } = await runtimeModule;
  const child = childProcess({ pid: 0 });
  const promise = startProductionIngressProcess({ cloudflared, configPath, runtimeDirectory, spawnImpl: () => child });
  child.emit('spawn');
  await assert.rejects(promise, /INGRESS_PROCESS_SPAWN_IDENTITY_INVALID/);
  assert.equal(child.killCalls, 1);
  assert.equal(child.unrefCalls, 0);
});

test('진입점은 acknowledgement helper를 await한 뒤 시작 PID를 기록한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-publication.mjs'), 'utf8');
  assert.match(source, /await startProductionIngressProcess/);
  assert.match(source, /startedProcessId = started\.processId/);
  assert.doesNotMatch(source, /function startTunnel/);
});
