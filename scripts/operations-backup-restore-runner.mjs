import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import {
  BACKUP_RESTORE_RUNNER_CONFIRMATION,
  buildBackupRestoreDrillExport,
  evaluateOperationsBackupRestoreRunnerGate,
  validateOffsiteStorageAttestation,
  writeBackupRestoreDrillExportOnce
} from '../src/operations/operations-backup-restore-runner.mjs';
import { readOperationsActivationInputDocument } from '../src/operations/operations-activation-input-reader.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const offsiteRoot = process.env.P7_OFFSITE_BACKUP_ROOT ? path.resolve(process.env.P7_OFFSITE_BACKUP_ROOT) : null;
const attestationPath = process.env.P7_OFFSITE_STORAGE_ATTESTATION_FILE
  ? path.resolve(process.env.P7_OFFSITE_STORAGE_ATTESTATION_FILE)
  : null;
const outputPath = process.env.P7_BACKUP_RESTORE_DRILL_INPUT_FILE
  ? path.resolve(process.env.P7_BACKUP_RESTORE_DRILL_INPUT_FILE)
  : null;

const COUNTS_SQL = `SELECT json_build_object(
  'users',(SELECT count(*) FROM users),
  'user_invitations',(SELECT count(*) FROM user_invitations),
  'items',(SELECT count(*) FROM items),
  'loans',(SELECT count(*) FROM loans),
  'audit_logs',(SELECT count(*) FROM audit_logs),
  'assets',(SELECT count(*) FROM assets),
  'workflow_requests',(SELECT count(*) FROM workflow_requests),
  'service_tickets',(SELECT count(*) FROM service_tickets),
  'stocktakes',(SELECT count(*) FROM stocktakes),
  'outbox_events',(SELECT count(*) FROM outbox_events),
  'file_blobs',(SELECT count(*) FROM file_blobs),
  'required_tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('api_idempotency_keys','asset_assignments','asset_files','asset_status_histories','assets','audit_logs','departments','disposal_requests','file_blobs','file_records','inspection_assets','inspections','item_categories','item_models','items','loans','locations','organizations','outbox_events','password_reset_tokens','purchase_orders','receipts','schema_migrations','service_tickets','stocktake_items','stocktakes','user_invitations','user_oidc_identities','user_role_scopes','user_sessions','users','vendors','workflow_requests')),
  'schema_migrations',(SELECT count(*) FROM schema_migrations)
) AS counts`;

function externalPhysicalFile(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const stat = fs.lstatSync(candidate);
    const parent = path.dirname(candidate);
    const parentStat = fs.lstatSync(parent);
    return stat.isFile() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && parentStat.isDirectory() && !parentStat.isSymbolicLink() && !(parentStat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(candidate)).toLowerCase() === path.resolve(candidate).toLowerCase();
  } catch {
    return false;
  }
}

function externalNewFile(candidate) {
  if (!candidate || fs.existsSync(candidate) || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate);
    const stat = fs.lstatSync(parent);
    return stat.isDirectory() && !stat.isSymbolicLink() && !(stat.isReparsePoint?.() ?? false)
      && path.resolve(fs.realpathSync(parent)).toLowerCase() === path.resolve(parent).toLowerCase();
  } catch {
    return false;
  }
}

function physicalSeparateFailureDomain(candidate) {
  if (!candidate) return null;
  try {
    const stat = fs.lstatSync(candidate);
    const real = path.resolve(fs.realpathSync(candidate));
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) return null;
    if (real.toLowerCase() !== path.resolve(candidate).toLowerCase()) return null;
    if (path.parse(real).root.toLowerCase() === path.parse(projectRoot).root.toLowerCase()) return null;
    return real;
  } catch {
    return null;
  }
}

function productionContainer(service) {
  const result = spawnSync('docker', [
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ], { encoding: 'utf8', windowsHide: true });
  const ids = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (result.status !== 0 || ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw new Error(`PRODUCTION_${service.toUpperCase()}_CONTAINER_INVALID`);
  return ids[0];
}

function waitForJsonLine(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => finish(new Error('SNAPSHOT_EXPORT_TIMEOUT')), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        try { finish(null, JSON.parse(buffer.slice(0, newline))); }
        catch { finish(new Error('SNAPSHOT_EXPORT_INVALID')); }
      }
    };
    const onExit = () => finish(new Error('SNAPSHOT_EXPORT_EXITED_EARLY'));
    function finish(error, value) {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      if (error) reject(error); else resolve(value);
    }
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

async function openConsistentSnapshot(backendContainer) {
  const helper = `const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const s=(await c.query('SELECT pg_export_snapshot() AS id')).rows[0].id;const counts=(await c.query(${JSON.stringify(COUNTS_SQL)})).rows[0].counts;process.stdout.write(JSON.stringify({snapshotId:s,counts})+'\\n');process.stdin.resume();process.stdin.once('data',async()=>{await c.query('COMMIT');await c.end();process.exit(0)});})().catch(()=>process.exit(1));`;
  const child = spawn('docker', ['exec', '-i', backendContainer, 'node', '-e', helper], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  const value = await waitForJsonLine(child);
  if (!/^[A-Za-z0-9-]{5,100}$/.test(value?.snapshotId ?? '') || !value?.counts) {
    child.kill();
    throw new Error('SNAPSHOT_EXPORT_CONTRACT_INVALID');
  }
  return {
    snapshotId: value.snapshotId,
    counts: value.counts,
    async close() {
      const exit = new Promise((resolve, reject) => {
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('SNAPSHOT_TRANSACTION_CLOSE_FAILED')));
        child.once('error', reject);
      });
      child.stdin.end('\n');
      await exit;
    },
    abort() { child.kill(); }
  };
}

async function createOffsiteBackup(databaseContainer, snapshotId, backupPath) {
  const temporaryPath = `${backupPath}.${process.pid}.tmp`;
  const child = spawn('docker', [
    'exec', databaseContainer, 'pg_dump', '-U', 'seowon', '-d', 'seowon_inventory', '-Fc',
    '--no-owner', '--no-privileges', `--snapshot=${snapshotId}`
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { if (stderr.length < 4096) stderr += chunk.toString(); });
  try {
    const exit = new Promise((resolve, reject) => {
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('PRODUCTION_PG_DUMP_FAILED')));
      child.once('error', reject);
    });
    await Promise.all([
      pipeline(child.stdout, fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 })),
      exit
    ]);
    if (fs.statSync(temporaryPath).size < 1024) throw new Error('PRODUCTION_BACKUP_TOO_SMALL');
    const handle = fs.openSync(temporaryPath, 'r');
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    fs.renameSync(temporaryPath, backupPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

function dockerCapture(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('ISOLATED_RESTORE_COMMAND_FAILED');
  return result.stdout.trim();
}

async function restoreBackup(databaseContainer, backupPath, drillDatabase) {
  const child = spawn('docker', [
    'exec', '-i', databaseContainer, 'pg_restore', '-U', 'seowon', '-d', drillDatabase,
    '--no-owner', '--no-privileges', '--exit-on-error'
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.resume();
  let stderr = '';
  child.stderr.on('data', (chunk) => { if (stderr.length < 4096) stderr += chunk.toString(); });
  const exit = new Promise((resolve, reject) => {
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('ISOLATED_PG_RESTORE_FAILED')));
    child.once('error', reject);
  });
  await Promise.all([pipeline(fs.createReadStream(backupPath), child.stdin), exit]);
}

function restoredCounts(databaseContainer, databaseName) {
  const raw = dockerCapture(['exec', databaseContainer, 'psql', '-U', 'seowon', '-d', databaseName, '-At', '-c', COUNTS_SQL]);
  return JSON.parse(raw);
}

const gate = evaluateOperationsBackupRestoreRunnerGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  offsiteRootConfigured: Boolean(offsiteRoot),
  attestationPresent: Boolean(attestationPath && fs.existsSync(attestationPath)),
  outputPresent: Boolean(outputPath),
  execute: process.argv.includes('--execute'),
  confirmed: process.env.P7_BACKUP_RESTORE_RUNNER_CONFIRMATION === BACKUP_RESTORE_RUNNER_CONFIRMATION
});

let status = gate.status;
let backupCreated = false;
let restoreDrillCompleted = false;
let exportCreated = false;
let productionReadPerformed = false;
let offsiteWritePerformed = false;
let isolatedDatabaseMutationPerformed = false;
let failureCount = 0;

if (gate.productionReadAllowed) {
  let snapshot;
  let drillDatabase;
  let databaseContainer;
  try {
    const physicalRoot = physicalSeparateFailureDomain(offsiteRoot);
    if (!physicalRoot || !externalPhysicalFile(attestationPath) || !externalNewFile(outputPath)) throw new Error('BACKUP_RESTORE_PATH_BOUNDARY_INVALID');
    const rootPathSha256 = crypto.createHash('sha256').update(physicalRoot.toLowerCase()).digest('hex');
    const attestationInput = readOperationsActivationInputDocument(attestationPath, { repositoryRoot: projectRoot });
    const attestation = validateOffsiteStorageAttestation(
      attestationInput.value,
      { expectedRootSha256: rootPathSha256 }
    );
    const suffix = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(6).toString('hex')}`;
    const backupId = `backup-${suffix}`;
    const backupPath = path.join(physicalRoot, `${backupId}.dump`);
    if (fs.existsSync(backupPath)) throw new Error('OFFSITE_BACKUP_ALREADY_EXISTS');

    productionReadPerformed = true;
    databaseContainer = productionContainer('database');
    const backendContainer = productionContainer('backend');
    const createdAt = new Date().toISOString();
    snapshot = await openConsistentSnapshot(backendContainer);
    const sourceCounts = snapshot.counts;
    await createOffsiteBackup(databaseContainer, snapshot.snapshotId, backupPath);
    await snapshot.close();
    snapshot = null;
    backupCreated = true;
    offsiteWritePerformed = true;
    const offsiteStoredAt = new Date().toISOString();
    const artifactSha256 = await sha256File(backupPath);
    if (!/^[a-f0-9]{64}$/.test(artifactSha256)) throw new Error('OFFSITE_BACKUP_CHECKSUM_INVALID');

    drillDatabase = `seowon_inventory_restore_drill_${crypto.randomBytes(6).toString('hex')}`;
    if (!/^seowon_inventory_restore_drill_[a-f0-9]{12}$/.test(drillDatabase)) throw new Error('ISOLATED_DATABASE_NAME_INVALID');
    const restoreStartedAt = new Date().toISOString();
    isolatedDatabaseMutationPerformed = true;
    dockerCapture(['exec', databaseContainer, 'createdb', '-U', 'seowon', drillDatabase]);
    await restoreBackup(databaseContainer, backupPath, drillDatabase);
    const restored = restoredCounts(databaseContainer, drillDatabase);
    dockerCapture(['exec', databaseContainer, 'dropdb', '-U', 'seowon', '--if-exists', drillDatabase]);
    drillDatabase = null;
    const restoreCompletedAt = new Date().toISOString();
    restoreDrillCompleted = true;

    const exportValue = buildBackupRestoreDrillExport({
      ownerRef: attestation.ownerRef,
      storageRef: attestation.storageRef,
      retentionDays: attestation.retentionDays,
      backupId,
      createdAt,
      offsiteStoredAt,
      artifactSha256,
      sourceDatabaseRef: 'database://sqcm-i-production/seowon_inventory',
      restoreDrillId: `restore-${suffix}`,
      restoreStartedAt,
      restoreCompletedAt,
      targetDatabaseRef: `database://isolated/${backupId}`,
      sourceCounts,
      restoredCounts: restored
    });
    writeBackupRestoreDrillExportOnce(outputPath, exportValue);
    exportCreated = true;
    status = 'PASS_PRODUCTION_OFFSITE_BACKUP_RESTORE_DRILL_EXPORT_CREATED';
  } catch {
    status = 'BLOCKED_PRODUCTION_OFFSITE_BACKUP_RESTORE_DRILL';
    failureCount = 1;
    process.exitCode = 1;
  } finally {
    if (snapshot) snapshot.abort();
    if (drillDatabase && databaseContainer && /^seowon_inventory_restore_drill_[a-f0-9]{12}$/.test(drillDatabase)) {
      try { dockerCapture(['exec', databaseContainer, 'dropdb', '-U', 'seowon', '--if-exists', drillDatabase]); }
      catch { status = 'BLOCKED_ISOLATED_RESTORE_CLEANUP'; process.exitCode = 1; }
    }
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredOffsiteRootEnvironment: 'P7_OFFSITE_BACKUP_ROOT',
  requiredAttestationEnvironment: 'P7_OFFSITE_STORAGE_ATTESTATION_FILE',
  requiredOutputEnvironment: 'P7_BACKUP_RESTORE_DRILL_INPUT_FILE',
  confirmationEnvironment: 'P7_BACKUP_RESTORE_RUNNER_CONFIRMATION',
  missing: gate.missing,
  backupCreated,
  restoreDrillCompleted,
  exportCreated,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  productionReadPerformed,
  offsiteWritePerformed,
  isolatedDatabaseMutationPerformed,
  externalMutationPerformed: offsiteWritePerformed,
  secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
