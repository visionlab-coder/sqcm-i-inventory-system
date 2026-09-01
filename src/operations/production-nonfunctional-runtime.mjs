import { spawnSync } from 'node:child_process';

export const PRODUCTION_NONFUNCTIONAL_PROCESS_TIMEOUT_MS = 120_000;
export const PRODUCTION_NONFUNCTIONAL_PROCESS_MAX_BUFFER = 1024 * 1024;

const SAFE_ENV_KEYS = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR'
];

function boundedError(code) {
  const error = new Error(code);
  error.name = 'ProductionNonfunctionalRuntimeError';
  return error;
}

export function buildProductionNonfunctionalChildEnvironment({ sourceEnv = process.env, target, allowRemote } = {}) {
  if (typeof target !== 'string' || !target || typeof allowRemote !== 'boolean') {
    throw boundedError('NONFUNCTIONAL_ENV_INPUT_INVALID');
  }
  const environment = {};
  for (const key of SAFE_ENV_KEYS) {
    if (typeof sourceEnv?.[key] === 'string' && sourceEnv[key]) environment[key] = sourceEnv[key];
  }
  return {
    ...environment,
    NONFUNCTIONAL_BASE_URL: target,
    ALLOW_REMOTE_NONFUNCTIONAL_TEST: String(allowRemote),
    LOAD_REQUESTS: '60',
    LOAD_CONCURRENCY: '6',
    MAX_P95_MS: '1000',
    MAX_ERROR_RATE: '0'
  };
}

export function runProductionNonfunctionalProcess({ target, allowRemote } = {}, {
  spawnClient = spawnSync,
  sourceEnv = process.env,
  cwd = process.cwd(),
  timeoutMs = PRODUCTION_NONFUNCTIONAL_PROCESS_TIMEOUT_MS,
  maxBuffer = PRODUCTION_NONFUNCTIONAL_PROCESS_MAX_BUFFER
} = {}) {
  if (typeof spawnClient !== 'function' || typeof cwd !== 'string' || !cwd) {
    throw boundedError('NONFUNCTIONAL_PROCESS_INPUT_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > PRODUCTION_NONFUNCTIONAL_PROCESS_TIMEOUT_MS
    || !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > PRODUCTION_NONFUNCTIONAL_PROCESS_MAX_BUFFER) {
    throw boundedError('NONFUNCTIONAL_PROCESS_LIMIT_INVALID');
  }
  const result = spawnClient(process.execPath, ['scripts/nonfunctional-check.mjs'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: timeoutMs,
    maxBuffer,
    env: buildProductionNonfunctionalChildEnvironment({ sourceEnv, target, allowRemote })
  });
  if (result?.error?.code === 'ETIMEDOUT') throw boundedError('NONFUNCTIONAL_PROCESS_TIMEOUT');
  if (result?.error || result?.status !== 0) throw boundedError('NONFUNCTIONAL_PROCESS_FAILED');
  return { status: result.status, stdout: String(result.stdout ?? '') };
}

function extractLastJsonObject(text) {
  const source = String(text ?? '');
  let last = null;
  let start = 0;
  while (start < source.length) {
    start = source.indexOf('{', start);
    if (start === -1) break;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let completed = false;
    for (let end = start; end < source.length; end += 1) {
      const char = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try { last = JSON.parse(source.slice(start, end + 1)); } catch { /* continue */ }
          start = end + 1;
          completed = true;
          break;
        }
      }
    }
    if (!completed) start += 1;
  }
  return last;
}

function exactFiniteNumber(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function parseProductionNonfunctionalResult(stdout, { expectedTarget } = {}) {
  const parsed = extractLastJsonObject(stdout);
  const load = parsed?.load;
  const security = parsed?.security;
  const headers = security?.headers;
  const checkedAt = parsed?.checkedAt;
  const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && typeof expectedTarget === 'string' && parsed.target === expectedTarget
    && typeof checkedAt === 'string' && !Number.isNaN(Date.parse(checkedAt))
    && load?.ok === true && load.requests === 60 && load.errors === 0 && load.errorRate === 0
    && exactFiniteNumber(load.p95Ms, 0, 1000)
    && load.limits?.maxP95Ms === 1000 && load.limits?.maxErrorRate === 0
    && security?.ok === true && security.anonymousStatus === 401
    && security.crossSiteStatus === 403 && security.crossSiteCode === 'CROSS_SITE_REQUEST'
    && typeof headers?.csp === 'string' && headers.csp.length > 0
    && headers.frame === 'DENY' && headers.nosniff === 'nosniff'
    && typeof headers.permissions === 'string' && headers.permissions.length > 0;
  if (!valid) throw boundedError('NONFUNCTIONAL_RESULT_INVALID');
  return {
    checkedAt,
    target: parsed.target,
    load: {
      requests: load.requests,
      errors: load.errors,
      errorRate: load.errorRate,
      p95Ms: load.p95Ms,
      limits: { maxP95Ms: 1000, maxErrorRate: 0 }
    },
    security: {
      headersPresent: { csp: true, frame: true, nosniff: true, permissions: true },
      anonymousStatus: security.anonymousStatus,
      crossSiteStatus: security.crossSiteStatus,
      crossSiteCode: security.crossSiteCode
    }
  };
}
