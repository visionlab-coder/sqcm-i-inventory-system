import { spawnSync } from 'node:child_process';
import { PRODUCTION_UAT_ROLES } from './production-role-preflight.mjs';

export const ROLE_PREFLIGHT_PROCESS_TIMEOUT_MS = 10_000;
export const ROLE_PREFLIGHT_PROCESS_MAX_BUFFER = 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionRolePreflightRuntimeError';
  return error;
}

export function runProductionRolePreflightProcess(args, {
  spawnClient = spawnSync,
  timeoutMs = ROLE_PREFLIGHT_PROCESS_TIMEOUT_MS,
  maxBuffer = ROLE_PREFLIGHT_PROCESS_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') {
    throw boundedError('ROLE_PREFLIGHT_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > ROLE_PREFLIGHT_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > ROLE_PREFLIGHT_PROCESS_MAX_BUFFER) {
    throw boundedError('ROLE_PREFLIGHT_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('ROLE_PREFLIGHT_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('ROLE_PREFLIGHT_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

export function parseProductionRolePreflightContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw boundedError('ROLE_PREFLIGHT_CONTAINER_RESULT_INVALID');
  }
  return ids[0];
}

export function parseProductionRolePreflightCounts(stdout) {
  const counts = Object.fromEntries(PRODUCTION_UAT_ROLES.map((role) => [role, { active: 0, mfaEnabled: 0 }]));
  const seen = new Set();
  for (const line of String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean)) {
    const fields = line.split(',');
    const [role, activeRaw, mfaEnabledRaw] = fields;
    if (fields.length !== 3 || !PRODUCTION_UAT_ROLES.includes(role) || seen.has(role)
      || !/^\d+$/.test(activeRaw) || !/^\d+$/.test(mfaEnabledRaw)) {
      throw boundedError('ROLE_PREFLIGHT_DB_RESULT_INVALID');
    }
    const active = Number(activeRaw);
    const mfaEnabled = Number(mfaEnabledRaw);
    if (!Number.isSafeInteger(active) || !Number.isSafeInteger(mfaEnabled) || mfaEnabled > active) {
      throw boundedError('ROLE_PREFLIGHT_DB_RESULT_INVALID');
    }
    counts[role] = { active, mfaEnabled };
    seen.add(role);
  }
  return counts;
}
