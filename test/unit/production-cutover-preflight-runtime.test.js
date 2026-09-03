const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeModule = import('../../src/operations/production-cutover-preflight-runtime.mjs');

test('provider command timeout을 원문 없이 bounded 상태로 정규화한다', async () => {
  const { runPreflightCommand } = await runtimeModule;
  const result = runPreflightCommand('provider.exe', ['list'], {
    cwd: process.cwd(),
    timeoutMs: 25,
    execute: () => {
      const error = new Error('credential and provider response must not escape');
      error.code = 'ETIMEDOUT';
      throw error;
    }
  });

  assert.deepEqual(result, {
    ok: false,
    stdout: '',
    failure: 'COMMAND_TIMEOUT'
  });
  assert.equal(JSON.stringify(result).includes('credential'), false);
});

test('Cloudflare timeout과 malformed JSON을 관측 실패로 fail closed 한다', async () => {
  const { observeCloudflareTunnels } = await runtimeModule;
  const timedOut = observeCloudflareTunnels({
    cloudflared: 'cloudflared.exe',
    cwd: process.cwd(),
    runCommand: () => ({ ok: false, stdout: '', failure: 'COMMAND_TIMEOUT' })
  });
  const malformed = observeCloudflareTunnels({
    cloudflared: 'cloudflared.exe',
    cwd: process.cwd(),
    runCommand: () => ({ ok: true, stdout: '{not-json', failure: null })
  });

  assert.deepEqual(timedOut, {
    succeeded: false,
    tunnels: [],
    status: 'CLOUDFLARE_TUNNEL_OBSERVATION_TIMEOUT'
  });
  assert.deepEqual(malformed, {
    succeeded: false,
    tunnels: [],
    status: 'CLOUDFLARE_TUNNEL_OBSERVATION_INVALID'
  });
});
