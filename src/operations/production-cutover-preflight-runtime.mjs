import { execFileSync } from 'node:child_process';

export const PREFLIGHT_COMMAND_TIMEOUT_MS = 10_000;

export function runPreflightCommand(command, args, {
  cwd,
  timeoutMs = PREFLIGHT_COMMAND_TIMEOUT_MS,
  execute = execFileSync
} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('PREFLIGHT_COMMAND_TIMEOUT_INVALID');
  }
  if (typeof execute !== 'function') throw new Error('PREFLIGHT_COMMAND_EXECUTOR_INVALID');
  try {
    const stdout = execute(command, args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: String(stdout ?? '').trim(), failure: null };
  } catch (error) {
    const timedOut = error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM';
    return { ok: false, stdout: '', failure: timedOut ? 'COMMAND_TIMEOUT' : 'COMMAND_FAILED' };
  }
}

export function observeCloudflareTunnels({ cloudflared, cwd, runCommand = runPreflightCommand } = {}) {
  const result = runCommand(cloudflared, ['tunnel', 'list', '--output', 'json'], { cwd });
  if (!result?.ok) {
    return {
      succeeded: false,
      tunnels: [],
      status: result?.failure === 'COMMAND_TIMEOUT'
        ? 'CLOUDFLARE_TUNNEL_OBSERVATION_TIMEOUT'
        : 'CLOUDFLARE_TUNNEL_OBSERVATION_FAILED'
    };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) throw new Error('NOT_ARRAY');
    return {
      succeeded: true,
      tunnels: parsed.map((tunnel) => ({
        name: String(tunnel?.name ?? ''),
        connections: Array.isArray(tunnel?.connections) ? tunnel.connections.length : 0
      })),
      status: 'PASS_CLOUDFLARE_TUNNEL_OBSERVATION'
    };
  } catch {
    return { succeeded: false, tunnels: [], status: 'CLOUDFLARE_TUNNEL_OBSERVATION_INVALID' };
  }
}
