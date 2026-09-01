import { spawnSync } from 'node:child_process';

export const LOG_GATE_PROCESS_TIMEOUT_MS = 10_000;
export const LOG_GATE_PROCESS_DEFAULT_MAX_BUFFER = 1024 * 1024;
export const LOG_GATE_PROCESS_MAX_BUFFER = 4 * 1024 * 1024;

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionLogGateRuntimeError';
  return error;
}

export function runProductionLogGateProcess(args, {
  spawnClient = spawnSync,
  timeoutMs = LOG_GATE_PROCESS_TIMEOUT_MS,
  maxBuffer = LOG_GATE_PROCESS_DEFAULT_MAX_BUFFER
} = {}) {
  if (!Array.isArray(args) || typeof spawnClient !== 'function') {
    throw boundedError('LOG_GATE_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > LOG_GATE_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > LOG_GATE_PROCESS_MAX_BUFFER) {
    throw boundedError('LOG_GATE_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('LOG_GATE_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('LOG_GATE_PROCESS_FAILED');
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

export function parseProductionLogGateContainerId(stdout) {
  const ids = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw boundedError('LOG_GATE_CONTAINER_RESULT_INVALID');
  }
  return ids[0];
}

export function parseProductionLogGateRecords({ stdout = '', stderr = '' } = {}) {
  const records = [];
  for (const line of `${stdout}\n${stderr}`.split(/\r?\n/).filter(Boolean)) {
    let record;
    try { record = JSON.parse(line); } catch { throw boundedError('LOG_GATE_LOG_RESULT_INVALID'); }
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      throw boundedError('LOG_GATE_LOG_RESULT_INVALID');
    }
    records.push(record);
  }
  return records;
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/.test(value)) throw boundedError('LOG_GATE_DB_RESULT_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw boundedError('LOG_GATE_DB_RESULT_INVALID');
  return parsed;
}

export function parseProductionLogGateOutboxCounts(stdout) {
  const fields = String(stdout ?? '').trim().split(',');
  if (fields.length !== 2) throw boundedError('LOG_GATE_DB_RESULT_INVALID');
  return fields.map(parseNonNegativeInteger);
}
