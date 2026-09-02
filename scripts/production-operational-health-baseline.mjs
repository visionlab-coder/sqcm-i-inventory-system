import path from 'node:path';
import healthPolicy from '../src/operations/health-policy.js';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { selectProductionOperationalHealthTarget } from '../src/operations/production-operational-health-target.mjs';
import {
  OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER,
  countOperationalHealthRecent5xx,
  parseOperationalHealthContainerId,
  parseOperationalHealthCounters,
  runOperationalHealthProcess,
  selectLatestVerifiedOperationalHealthBackup
} from '../src/operations/production-operational-health-runtime.mjs';

const selection = selectProductionOperationalHealthTarget({
  publicMode: process.argv.includes('--public'),
  now: new Date(),
  windowStart: new Date(PRODUCTION_CHANGE_WINDOW.start),
  windowEnd: new Date(PRODUCTION_CHANGE_WINDOW.end),
  confirmation: process.env.PRODUCTION_PUBLIC_OPERATIONAL_HEALTH_CONFIRMATION
});
if (selection.status.startsWith('FAIL_')) {
  console.error(JSON.stringify({ ...selection, productionGo: false }, null, 2));
  process.exit(1);
}
if (!selection.target) {
  console.log(JSON.stringify({ ...selection, productionGo: false }, null, 2));
  process.exit(0);
}

const baseUrl = selection.target;
const backupRoot = path.resolve('artifacts', 'backups');

function dockerContainer(service) {
  const result = runOperationalHealthProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseOperationalHealthContainerId(result.stdout);
}

async function latestProductionBackup() {
  return selectLatestVerifiedOperationalHealthBackup({ backupRoot, requireRestoreVerified: true });
}

async function status(route) {
  try { return (await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(10_000) })).status; } catch { return 0; }
}

const now = new Date();
const [frontendStatus, backendStatus, readinessStatus] = await Promise.all([
  status('/health'), status('/api/health'), status('/api/readiness')
]);
const database = dockerContainer('database');
const backend = dockerContainer('backend');
const sql = `select
  (select count(*) from outbox_events where published_at is null and created_at < now()-interval '15 minutes'),
  (select count(*) from user_sessions where expire < now()),
  (select count(*) from api_idempotency_keys where status='PROCESSING' and updated_at < now()-interval '2 minutes')`;
const dbResult = runOperationalHealthProcess([
  'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
]);
const [pendingOutboxOld, expiredSessions, stuckIdempotency] = parseOperationalHealthCounters(dbResult.stdout);

const logResult = runOperationalHealthProcess(
  ['logs', '--since', '15m', backend],
  { maxBuffer: OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER }
);
const recent5xx = countOperationalHealthRecent5xx(logResult);

const backup = await latestProductionBackup();
const snapshot = {
  checkedAt: now.toISOString(), frontendStatus, backendStatus, readinessStatus,
  pendingOutboxOld, expiredSessions, stuckIdempotency, recent5xx,
  backupVerified: backup.backupVerified,
  backupAgeMinutes: Math.floor((now.getTime() - Date.parse(backup.createdAt)) / 60_000),
  restoreVerified: backup.restoreVerified,
  restoreDrillAgeMinutes: Math.floor((now.getTime() - Date.parse(backup.restoreDrillAt)) / 60_000),
  backup: { bytes: backup.bytes, sha256Present: Boolean(backup.sha256) }
};
const result = healthPolicy.evaluateOperationalSnapshot(snapshot);
console.log(JSON.stringify({
  status: result.ok
    ? (selection.actualPostCutoverGate
        ? 'PASS_ACTUAL_POST_CUTOVER_OPERATIONAL_HEALTH'
        : 'PASS_LOOPBACK_BASELINE_READY_FOR_POST_CUTOVER_RECHECK')
    : 'FAIL_OPERATIONAL_HEALTH_BASELINE',
  target: baseUrl,
  snapshot,
  result,
  actualPostCutoverOperationalHealth: selection.actualPostCutoverGate ? 'PASS' : 'NOT_RUN',
  productionGo: false
}, null, 2));
if (!result.ok) process.exitCode = 1;
