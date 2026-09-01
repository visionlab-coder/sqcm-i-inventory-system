import { spawnSync } from 'node:child_process';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { evaluateProductionLogGate } from '../src/operations/production-log-gate.mjs';

function dockerContainer(service) {
  const result = spawnSync('docker', [
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ], { encoding: 'utf8', windowsHide: true });
  const id = result.stdout.trim();
  if (result.status !== 0 || !/^[a-f0-9]{12,64}$/.test(id)) throw new Error(`Exactly one healthy Production ${service} container is required.`);
  return id;
}

const now = new Date();
const insideWindow = now >= new Date(PRODUCTION_CHANGE_WINDOW.start)
  && now <= new Date(PRODUCTION_CHANGE_WINDOW.end);
const since = insideWindow ? new Date(PRODUCTION_CHANGE_WINDOW.start) : new Date(now.getTime() - 15 * 60_000);
const backend = dockerContainer('backend');
const database = dockerContainer('database');

const logResult = spawnSync('docker', ['logs', '--since', since.toISOString(), backend], {
  encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024
});
if (logResult.status !== 0) throw new Error('Unable to read Production backend logs.');
const records = `${logResult.stdout}\n${logResult.stderr}`.split(/\r?\n/).filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const fatalEvents = new Set(['server_start_failed', 'database_pool_error', 'outbox_publish_error']);

const sql = `select
  count(*) filter(where published_at is null and publish_attempts > 0 and dead_lettered_at is null),
  count(*) filter(where dead_lettered_at is not null)
from outbox_events`;
const dbResult = spawnSync('docker', ['exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql], {
  encoding: 'utf8', windowsHide: true
});
if (dbResult.status !== 0) throw new Error('Unable to read Production outbox status.');
const [outboxRetryCount, outboxDeadLetterCount] = dbResult.stdout.trim().split(',').map((value) => Number(value));

const observation = {
  insideWindow,
  http5xxCount: records.filter((record) => record.event === 'http_request' && Number(record.status) >= 500).length,
  fatalEventCount: records.filter((record) => fatalEvents.has(record.event)).length,
  errorLevelCount: records.filter((record) => String(record.level || '').toLowerCase() === 'error').length,
  outboxRetryCount,
  outboxDeadLetterCount
};
const result = evaluateProductionLogGate(observation);
console.log(JSON.stringify({ checkedAt: now.toISOString(), since: since.toISOString(), ...observation, ...result }, null, 2));
if (result.status.startsWith('FAIL_')) process.exitCode = 1;
