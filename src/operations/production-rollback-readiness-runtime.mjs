import { spawnSync } from 'node:child_process';

export const ROLLBACK_READINESS_PROCESS_TIMEOUT_MS = 10_000;
export const ROLLBACK_READINESS_PROCESS_MAX_BUFFER = 1024 * 1024;

function runtimeError(code) {
  const error = new Error(code);
  error.name = 'ProductionRollbackReadinessRuntimeError';
  return error;
}

export function runRollbackReadinessDocker(args, {
  spawnClient = spawnSync,
  timeoutMs = ROLLBACK_READINESS_PROCESS_TIMEOUT_MS,
  maxBuffer = ROLLBACK_READINESS_PROCESS_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((value) => typeof value !== 'string' || value.length === 0)
    || typeof spawnClient !== 'function') {
    throw runtimeError('ROLLBACK_READINESS_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > ROLLBACK_READINESS_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > ROLLBACK_READINESS_PROCESS_MAX_BUFFER) {
    throw runtimeError('ROLLBACK_READINESS_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw runtimeError('ROLLBACK_READINESS_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw runtimeError('ROLLBACK_READINESS_PROCESS_FAILED');
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

export function parseRollbackContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw runtimeError('ROLLBACK_READINESS_CONTAINER_RESULT_INVALID');
  }
  return ids[0];
}

export function parseRollbackInspect(stdout, expectedId) {
  if (!/^[a-f0-9]{12,64}$/.test(String(expectedId ?? ''))) {
    throw runtimeError('ROLLBACK_READINESS_INSPECT_RESULT_INVALID');
  }
  let parsed;
  try { parsed = JSON.parse(String(stdout ?? '')); } catch { throw runtimeError('ROLLBACK_READINESS_INSPECT_RESULT_INVALID'); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0] || typeof parsed[0] !== 'object' || Array.isArray(parsed[0])) {
    throw runtimeError('ROLLBACK_READINESS_INSPECT_RESULT_INVALID');
  }
  const container = parsed[0];
  const id = String(container.Id ?? '');
  const image = container.Config?.Image;
  const revision = container.Config?.Labels?.['org.opencontainers.image.revision'];
  if (!/^[a-f0-9]{12,64}$/.test(id) || !id.startsWith(expectedId)
    || typeof image !== 'string' || image.length < 1 || image.length > 512 || /[\r\n]/.test(image)
    || typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
    throw runtimeError('ROLLBACK_READINESS_INSPECT_RESULT_INVALID');
  }
  return { revision, image };
}

export function parseRollbackVolumes(stdout) {
  const volumes = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (volumes.length === 0 || volumes.some((name) => !/^[A-Za-z0-9][A-Za-z0-9_.-]{1,254}$/.test(name))
    || new Set(volumes).size !== volumes.length) {
    throw runtimeError('ROLLBACK_READINESS_VOLUME_RESULT_INVALID');
  }
  return volumes;
}
