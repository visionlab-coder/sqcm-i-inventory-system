const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtimeModule = import('../../src/operations/production-ingress-publication-runtime.mjs');
const cloudflared = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const config = 'D:\\seowon_runtime\\sqcm-i-inventory-production\\cloudflared.yml';

function processResult(processes) {
  return () => ({ ok: true, stdout: processes.length ? JSON.stringify(processes.length === 1 ? processes[0] : processes) : '', failure: null });
}

function candidate(overrides = {}) {
  return {
    ProcessId: 9601,
    ExecutablePath: cloudflared,
    CommandLine: `"${cloudflared}" tunnel --config "${config}" --pidfile runtime.pid run`,
    ...overrides
  };
}

test('exact executable과 config argument의 단일 PID만 running으로 인정한다', async () => {
  const { observeProductionIngressProcess } = await runtimeModule;
  assert.equal(typeof observeProductionIngressProcess, 'function');
  const result = observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: processResult([candidate()]) });
  assert.deepEqual(result, { running: true, processId: 9601, status: 'PASS_INGRESS_PROCESS_EXACT_MATCH' });
});

test('config 경로 prefix 오탐과 executable 불일치는 불확실 상태로 차단한다', async () => {
  const { observeProductionIngressProcess } = await runtimeModule;
  assert.throws(
    () => observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: processResult([candidate({ CommandLine: `"${cloudflared}" tunnel --config "${config}.old" run` })]) }),
    /INGRESS_PROCESS_IDENTITY_UNCERTAIN/
  );
  assert.throws(
    () => observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: processResult([candidate({ ExecutablePath: 'C:\\temp\\cloudflared.exe' })]) }),
    /INGRESS_PROCESS_IDENTITY_UNCERTAIN/
  );
});

test('동일 config의 exact PID가 둘이면 중복 기동하지 않고 ambiguous로 차단한다', async () => {
  const { observeProductionIngressProcess } = await runtimeModule;
  assert.throws(
    () => observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: processResult([candidate(), candidate({ ProcessId: 9602 })]) }),
    /INGRESS_PROCESS_IDENTITY_AMBIGUOUS/
  );
});

test('관측 실패·malformed JSON은 not-running으로 낮추지 않고 fail-closed한다', async () => {
  const { observeProductionIngressProcess } = await runtimeModule;
  assert.throws(
    () => observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: () => ({ ok: false, stdout: '', failure: 'COMMAND_TIMEOUT' }) }),
    /INGRESS_PROCESS_OBSERVATION_TIMEOUT/
  );
  assert.throws(
    () => observeProductionIngressProcess({ cloudflared, configPath: config, runCommand: () => ({ ok: true, stdout: '{bad', failure: null }) }),
    /INGRESS_PROCESS_OBSERVATION_INVALID/
  );
});

test('진입점은 공용 exact process 관측기를 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-publication.mjs'), 'utf8');
  assert.match(source, /observeProductionIngressProcess/);
  assert.doesNotMatch(source, /function tunnelProcessAlreadyRunning/);
});
