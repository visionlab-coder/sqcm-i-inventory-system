import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionLogGate } from '../src/operations/production-log-gate.mjs';
import {
  LOG_GATE_PROCESS_MAX_BUFFER,
  parseProductionLogGateContainerId,
  parseProductionLogGateOutboxCounts,
  parseProductionLogGateRecords,
  runProductionLogGateProcess
} from '../src/operations/production-log-gate-runtime.mjs';

function dockerContainer(service) {
  const result = runProductionLogGateProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseProductionLogGateContainerId(result.stdout);
}

const now = new Date();
const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
  && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
const since = insideWindow ? new Date(PRODUCTION_CHANGE_WINDOW.start) : new Date(now.getTime() - 15 * 60_000);
const backend = dockerContainer('backend');
const database = dockerContainer('database');

const logResult = runProductionLogGateProcess(
  ['logs', '--since', since.toISOString(), backend],
  { maxBuffer: LOG_GATE_PROCESS_MAX_BUFFER }
);
const records = parseProductionLogGateRecords(logResult);
const fatalEvents = new Set(['server_start_failed', 'database_pool_error', 'outbox_publish_error']);
const readinessTransient503Count = records.filter((record) => record.event === 'http_request'
  && record.method === 'GET' && record.path === '/api/readiness' && Number(record.status) === 503).length;
let currentReadinessStatus = null;
try {
  currentReadinessStatus = (await fetch('http://127.0.0.1:3300/api/readiness', { signal:AbortSignal.timeout(5_000) })).status;
} catch { /* fail closed in evaluation */ }

const sql = `select
  count(*) filter(where published_at is null and publish_attempts > 0 and dead_lettered_at is null),
  count(*) filter(where dead_lettered_at is not null)
from outbox_events`;
const dbResult = runProductionLogGateProcess([
  'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
]);
const [outboxRetryCount, outboxDeadLetterCount] = parseProductionLogGateOutboxCounts(dbResult.stdout);

const observation = {
  insideWindow,
  http5xxCount: records.filter((record) => record.event === 'http_request' && Number(record.status) >= 500
    && !(record.method === 'GET' && record.path === '/api/readiness' && Number(record.status) === 503)).length,
  readinessTransient503Count,
  currentReadinessStatus,
  fatalEventCount: records.filter((record) => fatalEvents.has(record.event)).length,
  errorLevelCount: records.filter((record) => String(record.level || '').toLowerCase() === 'error').length,
  outboxRetryCount,
  outboxDeadLetterCount
};
const result = evaluateProductionLogGate(observation);
console.log(JSON.stringify({ checkedAt: now.toISOString(), since: since.toISOString(), ...observation, ...result }, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
