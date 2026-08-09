import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import policy from '../src/operations/health-policy.js';

const baseUrl = String(process.env.OPERATIONS_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const databaseUrl = process.env.OPERATIONS_DATABASE_URL;
if (!databaseUrl) { console.error('OPERATIONS_DATABASE_URL is required.'); process.exit(1); }

async function status(url) { try { return (await fetch(url, { signal: AbortSignal.timeout(10000) })).status; } catch { return 0; } }
function latestBackupManifest() {
  const root = path.resolve('artifacts', 'backups');
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter(name => name.endsWith('.dump.json')).sort().reverse() : [];
  if (!files.length) return null;
  const manifestPath = path.join(root, files[0]); const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const backupPath = path.resolve(manifest.backupPath);
  if (!backupPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(backupPath)) throw new Error('backup manifest path is invalid');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
  return { ...manifest, manifestPath, backupVerified: digest === manifest.sha256 };
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
try {
  const [frontendStatus, backendStatus, readinessStatus] = await Promise.all([status(`${baseUrl}/health`),status(`${baseUrl}/api/health`),status(`${baseUrl}/api/readiness`)]);
  const { rows:[database] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM outbox_events WHERE published_at IS NULL AND created_at < now()-interval '15 minutes') pending_outbox_old,
    (SELECT count(*)::int FROM user_sessions WHERE expire < now()) expired_sessions,
    (SELECT count(*)::int FROM api_idempotency_keys WHERE status='PROCESSING' AND updated_at < now()-interval '2 minutes') stuck_idempotency`);
  const backup = latestBackupManifest(); const now = Date.now();
  const snapshot = {checkedAt:new Date().toISOString(),frontendStatus,backendStatus,readinessStatus,
    pendingOutboxOld:database.pending_outbox_old,expiredSessions:database.expired_sessions,stuckIdempotency:database.stuck_idempotency,
    recent5xx:Number(process.env.RECENT_5XX_COUNT||0),backupVerified:Boolean(backup?.backupVerified),
    backupAgeMinutes:backup?.createdAt?Math.floor((now-Date.parse(backup.createdAt))/60000):Infinity,
    restoreVerified:Boolean(backup?.restoreVerified),restoreDrillAgeMinutes:backup?.restoreDrillAt?Math.floor((now-Date.parse(backup.restoreDrillAt))/60000):Infinity,
    backup:backup?{path:backup.backupPath,bytes:backup.bytes,sha256:backup.sha256,manifestPath:backup.manifestPath}:null};
  const result=policy.evaluateOperationalSnapshot(snapshot,{maxPendingOutboxOld:process.env.MAX_PENDING_OUTBOX_OLD,maxExpiredSessions:process.env.MAX_EXPIRED_SESSIONS,maxStuckIdempotency:process.env.MAX_STUCK_IDEMPOTENCY,maxRecent5xx:process.env.MAX_RECENT_5XX,maxBackupAgeMinutes:process.env.MAX_BACKUP_AGE_MINUTES,maxRestoreDrillAgeMinutes:process.env.MAX_RESTORE_DRILL_AGE_MINUTES});
  console.log(JSON.stringify({snapshot,result},null,2));
  if(!result.ok){console.error('Operational health gate failed.');process.exit(1);} console.log('Operational health gate passed.');
} finally { await pool.end(); }
