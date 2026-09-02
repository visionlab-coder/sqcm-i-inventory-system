import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMaintenanceExecutionExport,
  evaluateOperationsMaintenanceRunnerGate,
  MAINTENANCE_RUNNER_CONFIRMATION,
  writeMaintenanceExecutionExportOnce
} from '../src/operations/operations-maintenance-runner.mjs';
import {
  OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER,
  countOperationalHealthRecent5xx,
  parseOperationalHealthContainerId,
  runOperationalHealthProcess,
  selectLatestVerifiedOperationalHealthBackup
} from '../src/operations/production-operational-health-runtime.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'agent docs', 'harness', 'MASTER_ROADMAP.json'), 'utf8'));
const p6 = roadmap.phases.find((phase) => phase.id === 'P6');
const p7 = roadmap.phases.find((phase) => phase.id === 'P7');
const outputPath = process.env.P7_MAINTENANCE_EXECUTION_INPUT_FILE
  ? path.resolve(process.env.P7_MAINTENANCE_EXECUTION_INPUT_FILE)
  : null;
const operatorRef = process.env.P7_MAINTENANCE_OPERATOR_REF ?? null;
const scheduleRef = process.env.P7_MAINTENANCE_SCHEDULE_REF ?? null;
const nextScheduledAt = process.env.P7_MAINTENANCE_NEXT_SCHEDULED_AT ?? null;

function physicalExternalTarget(candidate) {
  if (!candidate || !path.relative(projectRoot, candidate).startsWith('..')) return false;
  try {
    const parent = path.dirname(candidate);
    const stat = fs.lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.isReparsePoint?.() ?? false)) return false;
    if (path.resolve(fs.realpathSync(parent)).toLowerCase() !== path.resolve(parent).toLowerCase()) return false;
    return !fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function productionContainer(service) {
  const result = runOperationalHealthProcess([
    'ps', '--filter', 'label=com.docker.compose.project=seowon-inventory-production',
    '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'
  ]);
  return parseOperationalHealthContainerId(result.stdout);
}

function immutableRevision(containerId) {
  const result = runOperationalHealthProcess(['inspect', containerId]);
  let containers;
  try { containers = JSON.parse(result.stdout); } catch { throw new Error('PRODUCTION_CONTAINER_INSPECT_INVALID'); }
  if (!Array.isArray(containers) || containers.length !== 1 || !containers[0] || typeof containers[0] !== 'object') {
    throw new Error('PRODUCTION_CONTAINER_INSPECT_INVALID');
  }
  const revision = containers[0]?.Config?.Labels?.['org.opencontainers.image.revision'];
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('PRODUCTION_CONTAINER_REVISION_INVALID');
  return revision;
}

async function exactPublicStatus(route) {
  const response = await fetch(`https://inventory.safe-link.co.kr${route}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' }
  });
  if (response.url !== `https://inventory.safe-link.co.kr${route}`) throw new Error('PUBLIC_TARGET_REDIRECTED');
  await response.body?.cancel();
  return response.status;
}

function databaseSnapshot(databaseContainer) {
  const sql = `select current_database(),
    (select count(*) from audit_logs where action='LOGIN_FAILED' and created_at >= now()-interval '15 minutes'),
    (select count(*) from audit_logs where action='LOGIN_FAILED' and created_at >= now()-interval '24 hours' and created_at < now()-interval '15 minutes')`;
  const result = runOperationalHealthProcess([
    'exec', databaseContainer, 'psql', '-U', 'seowon', '-d', 'seowon_inventory', '-At', '-F', ',', '-c', sql
  ]);
  const fields = result.stdout.trim().split(',');
  if (fields.length !== 3 || fields[0] !== 'seowon_inventory' || !/^\d+$/.test(fields[1]) || !/^\d+$/.test(fields[2])) {
    throw new Error('PRODUCTION_DATABASE_READ_INVALID');
  }
  const recentLoginFailures = Number(fields[1]);
  const priorLoginFailures = Number(fields[2]);
  if (!Number.isSafeInteger(recentLoginFailures) || !Number.isSafeInteger(priorLoginFailures)) {
    throw new Error('PRODUCTION_DATABASE_READ_INVALID');
  }
  return { databaseName: fields[0], recentLoginFailures, priorLoginFailures };
}

function recent5xxCount(backendContainer) {
  return countOperationalHealthRecent5xx(runOperationalHealthProcess(
    ['logs', '--since', '15m', backendContainer],
    { maxBuffer: OPERATIONAL_HEALTH_PROCESS_MAX_BUFFER }
  ));
}

async function latestBackupSnapshot(now) {
  const backupRoot = path.join(projectRoot, 'artifacts', 'backups');
  const manifest = await selectLatestVerifiedOperationalHealthBackup({ backupRoot });
  return {
    backupVerified: manifest.backupVerified,
    backupAgeMinutes: Math.floor((now.getTime() - Date.parse(manifest.createdAt)) / 60_000)
  };
}

const gate = evaluateOperationsMaintenanceRunnerGate({
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7InProgress: p7?.status === 'in-progress',
  productionGo: roadmap.invariants?.productionGo === true,
  outputPresent: Boolean(outputPath),
  operatorRef,
  scheduleRef,
  nextScheduledAt,
  execute: process.argv.includes('--execute'),
  confirmed: process.env.P7_MAINTENANCE_RUNNER_CONFIRMATION === MAINTENANCE_RUNNER_CONFIRMATION
});

let status = gate.status;
let maintenanceExportCreated = false;
let failureCount = 0;
let externalHttpReadPerformed = false;
let localRuntimeReadPerformed = false;

if (gate.externalReadAllowed) {
  try {
    if (!physicalExternalTarget(outputPath)) throw new Error('OUTPUT_MUST_BE_NEW_EXTERNAL_PHYSICAL_FILE');
    const startedAt = new Date().toISOString();
    externalHttpReadPerformed = true;
    const [frontendStatus, apiStatus, readinessStatus] = await Promise.all([
      exactPublicStatus('/health'),
      exactPublicStatus('/api/health'),
      exactPublicStatus('/api/readiness')
    ]);
    localRuntimeReadPerformed = true;
    const frontendContainer = productionContainer('frontend');
    const backendContainer = productionContainer('backend');
    const databaseContainer = productionContainer('database');
    const frontendRevision = immutableRevision(frontendContainer);
    const backendRevision = immutableRevision(backendContainer);
    if (!/^[a-f0-9]{40}$/.test(frontendRevision) || frontendRevision !== backendRevision) throw new Error('PRODUCTION_RELEASE_REVISION_MISMATCH');
    const database = databaseSnapshot(databaseContainer);
    const now = new Date();
    const backup = await latestBackupSnapshot(now);
    const exportValue = buildMaintenanceExecutionExport({
      startedAt,
      completedAt: now.toISOString(),
      nextScheduledAt,
      operatorRef,
      scheduleRef,
      releaseSha: frontendRevision,
      frontendStatus,
      apiStatus,
      readinessStatus,
      databaseQueryOk: true,
      databaseName: database.databaseName,
      recent5xx: recent5xxCount(backendContainer),
      recentLoginFailures: database.recentLoginFailures,
      priorLoginFailures: database.priorLoginFailures,
      backupVerified: backup.backupVerified,
      backupAgeMinutes: backup.backupAgeMinutes
    });
    writeMaintenanceExecutionExportOnce(outputPath, exportValue);
    status = 'PASS_PRODUCTION_DAILY_MAINTENANCE_EXPORT_CREATED';
    maintenanceExportCreated = true;
  } catch {
    status = 'BLOCKED_PRODUCTION_DAILY_MAINTENANCE_EXECUTION';
    failureCount = 1;
    process.exitCode = 1;
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  status,
  requiredOutputEnvironment: 'P7_MAINTENANCE_EXECUTION_INPUT_FILE',
  operatorEnvironment: 'P7_MAINTENANCE_OPERATOR_REF',
  scheduleEnvironment: 'P7_MAINTENANCE_SCHEDULE_REF',
  nextScheduleEnvironment: 'P7_MAINTENANCE_NEXT_SCHEDULED_AT',
  confirmationEnvironment: 'P7_MAINTENANCE_RUNNER_CONFIRMATION',
  missing: gate.missing,
  maintenanceExportCreated,
  failureCount,
  p6EvidenceComplete: p6?.status === 'evidence-complete',
  p7Status: p7?.status ?? null,
  externalHttpReadPerformed,
  localRuntimeReadPerformed,
  localEvidenceWritePerformed: maintenanceExportCreated,
  externalMutationPerformed: false,
  secretValuesReadOrRecorded: false,
  productionGo: roadmap.invariants?.productionGo === true
}, null, 2));
