import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import healthPolicy from '../src/operations/health-policy.js';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { selectProductionOperationalHealthTarget } from '../src/operations/production-operational-health-target.mjs';

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
  const result = spawnSync('docker', [
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ], { encoding: 'utf8', windowsHide: true });
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0 || ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) {
    throw new Error(`Exactly one running Production ${service} container is required.`);
  }
  return ids[0];
}

function latestProductionBackup() {
  const manifests = fs.readdirSync(backupRoot).filter((name) => name.endsWith('.dump.json')).flatMap((name) => {
    try {
      const manifestPath = path.join(backupRoot, name);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return manifest.backupPath && manifest.sha256 && manifest.restoreVerified === true
        ? [{ ...manifest, manifestPath }]
        : [];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (!manifests.length) throw new Error('A verified Production backup manifest is required.');
  const manifest = manifests[0];
  const backupPath = path.resolve(manifest.backupPath);
  if (!backupPath.startsWith(`${backupRoot}${path.sep}`) || !fs.existsSync(backupPath)) {
    throw new Error('Production backup path is outside the approved backup root or missing.');
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
  return { ...manifest, backupVerified: digest === manifest.sha256 };
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
const dbResult = spawnSync('docker', [
  'exec', database, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
], { encoding: 'utf8', windowsHide: true });
if (dbResult.status !== 0) throw new Error('Unable to read Production operational counters.');
const [pendingOutboxOld, expiredSessions, stuckIdempotency] = dbResult.stdout.trim().split(',').map(Number);

const logResult = spawnSync('docker', ['logs', '--since', '15m', backend], {
  encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024
});
if (logResult.status !== 0) throw new Error('Unable to read Production backend logs.');
const recent5xx = `${logResult.stdout}\n${logResult.stderr}`.split(/\r?\n/).filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
}).filter((record) => record.event === 'http_request' && Number(record.status) >= 500).length;

const backup = latestProductionBackup();
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
