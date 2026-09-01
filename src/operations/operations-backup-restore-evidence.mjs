import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const BACKUP_RESTORE_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-BACKUP-RESTORE-EVIDENCE';
export const BACKUP_RESTORE_TARGET_URL = 'https://inventory.safe-link.co.kr';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const DATABASE_PATTERN = /^database:\/\/[A-Za-z0-9._/@:-]+$/;
const STORAGE_PATTERN = /^storage:\/\/[A-Za-z0-9._/@:-]+$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsBackupRestoreEvidenceCompiler({
  p6EvidenceComplete = false,
  p7InProgress = false,
  inputPresent = false,
  backupOutputPresent = false,
  restoreOutputPresent = false,
  execute = false,
  confirmed = false
} = {}) {
  const missing = [];
  if (!inputPresent) missing.push('input');
  if (!backupOutputPresent) missing.push('backupOutput');
  if (!restoreOutputPresent) missing.push('restoreOutput');
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_BACKUP_RESTORE_DRILL', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_BACKUP_RESTORE_INPUTS_AND_OUTPUTS', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_BACKUP_RESTORE_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_BACKUP_RESTORE_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_BACKUP_RESTORE_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsBackupRestoreEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_BACKUP_RESTORE_DRILL_EXPORT') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== BACKUP_RESTORE_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!IDENTITY_PATTERN.test(source?.ownerRef ?? '')) failures.push('ownerRef is required');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const backup = source?.backup ?? {};
  const restore = source?.restore ?? {};
  if (!ID_PATTERN.test(backup.backupId ?? '')) failures.push('backupId is invalid');
  if (!validDate(backup.createdAt)) failures.push('backup createdAt is required');
  if (!validDate(backup.offsiteStoredAt)) failures.push('backup offsiteStoredAt is required');
  if (backup.checksumVerified !== true) failures.push('backup checksum must be verified');
  if (!SHA256_PATTERN.test(backup.artifactSha256 ?? '')) failures.push('backup artifact sha256 is required');
  if (!DATABASE_PATTERN.test(backup.sourceDatabaseRef ?? '')) failures.push('backup sourceDatabaseRef is required');
  if (!STORAGE_PATTERN.test(backup.offsiteStorageRef ?? '')) failures.push('backup offsiteStorageRef is required');
  if (!validDate(backup.retentionUntil)) failures.push('backup retentionUntil is required');

  const checkedMs = Date.parse(checkedAt);
  const createdMs = Date.parse(backup.createdAt);
  const offsiteMs = Date.parse(backup.offsiteStoredAt);
  const retentionMs = Date.parse(backup.retentionUntil);
  const ageMinutes = Math.round((checkedMs - createdMs) / 60000);
  if (validDate(checkedAt) && validDate(backup.createdAt) && (ageMinutes < 0 || ageMinutes > 1440)) failures.push('backup age must be within 1440 minute RPO');
  if (validDate(backup.createdAt) && validDate(backup.offsiteStoredAt) && offsiteMs < createdMs) failures.push('offsiteStoredAt must not precede backup creation');
  if (validDate(checkedAt) && validDate(backup.offsiteStoredAt) && offsiteMs > checkedMs) failures.push('offsiteStoredAt must not be in the future');
  if (validDate(backup.createdAt) && validDate(backup.retentionUntil) && retentionMs - createdMs < 30 * 86400000) failures.push('backup retention must be at least 30 days');
  if (validDate(checkedAt) && validDate(backup.retentionUntil) && retentionMs <= checkedMs) failures.push('backup retention must extend beyond checkedAt');

  if (!ID_PATTERN.test(restore.drillId ?? '')) failures.push('restore drillId is invalid');
  if (restore.backupId !== backup.backupId) failures.push('restore backupId must match backup');
  if (!validDate(restore.startedAt) || !validDate(restore.completedAt)) failures.push('restore timestamps are required');
  if (restore.isolatedTarget !== true) failures.push('restore target must be isolated');
  if (restore.rowCountsMatch !== true) failures.push('restore row counts must match');
  if (restore.schemaMigrationsMatch !== true) failures.push('restore schema migrations must match');
  if (!DATABASE_PATTERN.test(restore.targetDatabaseRef ?? '')) failures.push('restore targetDatabaseRef is required');
  if (restore.targetDatabaseRef === backup.sourceDatabaseRef) failures.push('restore target must differ from source database');
  if (!SHA256_PATTERN.test(restore.sourceCountsSha256 ?? '') || restore.sourceCountsSha256 !== restore.restoredCountsSha256) failures.push('restore count digests must be matching sha256 values');

  const startedMs = Date.parse(restore.startedAt);
  const completedMs = Date.parse(restore.completedAt);
  const rtoMinutes = Math.round((completedMs - startedMs) / 60000);
  if (validDate(restore.startedAt) && validDate(restore.completedAt) && (rtoMinutes < 0 || rtoMinutes > 240)) failures.push('restore RTO must be within 240 minutes');
  if (validDate(checkedAt) && validDate(restore.completedAt) && completedMs > checkedMs) failures.push('restore completedAt must not be in the future');
  if (validDate(backup.createdAt) && validDate(restore.startedAt) && startedMs < createdMs) failures.push('restore must not start before backup creation');

  if (failures.length > 0) return { status: 'BLOCKED_BACKUP_RESTORE_EVIDENCE_INVALID', failures, evidence: null };
  const commonProvenance = {
    targetUrl: BACKUP_RESTORE_TARGET_URL,
    ownerRef: source.ownerRef,
    sourceSha256
  };
  return {
    status: 'PASS_BACKUP_RESTORE_EVIDENCE_COMPILED',
    failures,
    evidence: {
      backup: {
        schemaVersion: 1,
        environment: 'production',
        activationState: 'actual',
        evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
        domain: 'backup',
        status: 'PASS',
        checkedAt,
        metrics: { offsite: true, checksumVerified: true, ageMinutes },
        provenance: {
          ...commonProvenance,
          backupId: backup.backupId,
          artifactSha256: backup.artifactSha256,
          sourceDatabaseRef: backup.sourceDatabaseRef,
          offsiteStorageRef: backup.offsiteStorageRef,
          createdAt: backup.createdAt,
          offsiteStoredAt: backup.offsiteStoredAt,
          retentionUntil: backup.retentionUntil
        }
      },
      restore: {
        schemaVersion: 1,
        environment: 'production',
        activationState: 'actual',
        evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
        domain: 'restore',
        status: 'PASS',
        checkedAt,
        metrics: { isolatedTarget: true, rowCountsMatch: true, rtoMinutes },
        provenance: {
          ...commonProvenance,
          drillId: restore.drillId,
          backupId: restore.backupId,
          targetDatabaseRef: restore.targetDatabaseRef,
          schemaMigrationsMatch: true,
          countsSha256: restore.sourceCountsSha256,
          startedAt: restore.startedAt,
          completedAt: restore.completedAt
        }
      }
    }
  };
}

export function sha256BackupRestoreBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsBackupRestoreEvidencePairOnce(backupPath, restorePath, evidence, { processId = process.pid } = {}) {
  if (!backupPath || !restorePath || path.resolve(backupPath) === path.resolve(restorePath)) throw new Error('DISTINCT_OUTPUT_PATHS_REQUIRED');
  for (const outputPath of [backupPath, restorePath]) {
    if (!fs.existsSync(path.dirname(outputPath))) throw new Error('OUTPUT_DIRECTORY_MISSING');
    if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  }
  const outputs = [[backupPath, evidence.backup], [restorePath, evidence.restore]];
  const temporaryPaths = outputs.map(([outputPath]) => path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${processId}.tmp`));
  const committed = [];
  try {
    outputs.forEach(([, value], index) => fs.writeFileSync(temporaryPaths[index], `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }));
    outputs.forEach(([outputPath], index) => {
      fs.renameSync(temporaryPaths[index], outputPath);
      committed.push(outputPath);
    });
  } catch (error) {
    for (const temporaryPath of temporaryPaths) if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    for (const outputPath of committed) if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
    throw error;
  }
  return { backupPath, restorePath };
}
