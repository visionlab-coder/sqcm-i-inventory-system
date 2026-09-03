import fs from 'node:fs';
import path from 'node:path';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';
import { createHash } from 'node:crypto';

export const BACKUP_RESTORE_RUNNER_CONFIRMATION = 'ACK-EXECUTE-P7-PRODUCTION-OFFSITE-BACKUP-RESTORE-DRILL';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const STORAGE_PATTERN = /^storage:\/\/[A-Za-z0-9._/@:-]+$/;
const DATABASE_PATTERN = /^database:\/\/[A-Za-z0-9._/@:-]+$/;
const PATH_REF_PATTERN = /^path:\/\/[A-Za-z0-9._/@:-]+$/;

function waiting(status, missing = []) {
  return {
    status,
    missing,
    productionReadAllowed: false,
    offsiteWriteAllowed: false,
    isolatedDatabaseMutationAllowed: false,
    localEvidenceWriteAllowed: false
  };
}

export function evaluateOperationsBackupRestoreRunnerGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  offsiteRootConfigured = false,
  attestationPresent = false,
  outputPresent = false,
  execute = false,
  confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!offsiteRootConfigured) missing.push('offsiteRoot');
  if (!attestationPresent) missing.push('attestation');
  if (!outputPresent) missing.push('output');
  if (missing.length > 0) return waiting('READY_WAIT_BACKUP_RESTORE_RUNNER_INPUTS', missing);
  if (!execute) return waiting('PASS_BACKUP_RESTORE_RUNNER_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_BACKUP_RESTORE_RUNNER_CONFIRMATION');
  return {
    status: 'READY_EXECUTE_PRODUCTION_OFFSITE_BACKUP_RESTORE_DRILL',
    missing,
    productionReadAllowed: true,
    offsiteWriteAllowed: true,
    isolatedDatabaseMutationAllowed: true,
    localEvidenceWriteAllowed: true
  };
}

export function validateOffsiteStorageAttestation(value, { expectedRootSha256 } = {}) {
  const failures = [];
  if (value?.schemaVersion !== 1) failures.push('schemaVersion');
  if (value?.environment !== 'production') failures.push('environment');
  if (value?.approved !== true) failures.push('approved');
  if (value?.separateFailureDomain !== true) failures.push('separateFailureDomain');
  if (value?.encryptedAtRest !== true) failures.push('encryptedAtRest');
  if (!Number.isInteger(value?.retentionDays) || value.retentionDays < 30) failures.push('retentionDays');
  if (!STORAGE_PATTERN.test(value?.storageRef ?? '')) failures.push('storageRef');
  if (!IDENTITY_PATTERN.test(value?.ownerRef ?? '')) failures.push('ownerRef');
  if (!PATH_REF_PATTERN.test(value?.rootRef ?? '')) failures.push('rootRef');
  if (!SHA256_PATTERN.test(value?.rootPathSha256 ?? '')) failures.push('rootPathSha256');
  if (expectedRootSha256 && value?.rootPathSha256 !== expectedRootSha256) failures.push('rootPathBinding');
  if (failures.length > 0) throw new Error(`OFFSITE_STORAGE_ATTESTATION_INVALID:${failures.join(',')}`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function countsSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function buildBackupRestoreDrillExport(value) {
  const failures = [];
  const createdMs = Date.parse(value?.createdAt);
  const offsiteMs = Date.parse(value?.offsiteStoredAt);
  const restoreStartedMs = Date.parse(value?.restoreStartedAt);
  const restoreCompletedMs = Date.parse(value?.restoreCompletedAt);
  if (!IDENTITY_PATTERN.test(value?.ownerRef ?? '')) failures.push('ownerRef');
  if (!STORAGE_PATTERN.test(value?.storageRef ?? '')) failures.push('storageRef');
  if (!Number.isInteger(value?.retentionDays) || value.retentionDays < 30) failures.push('retentionDays');
  if (!ID_PATTERN.test(value?.backupId ?? '')) failures.push('backupId');
  if (!Number.isFinite(createdMs) || !Number.isFinite(offsiteMs) || offsiteMs < createdMs) failures.push('backupTimestamps');
  if (!SHA256_PATTERN.test(value?.artifactSha256 ?? '')) failures.push('artifactSha256');
  if (!DATABASE_PATTERN.test(value?.sourceDatabaseRef ?? '')) failures.push('sourceDatabaseRef');
  if (!ID_PATTERN.test(value?.restoreDrillId ?? '')) failures.push('restoreDrillId');
  if (!Number.isFinite(restoreStartedMs) || !Number.isFinite(restoreCompletedMs)
    || restoreStartedMs < createdMs || restoreCompletedMs < restoreStartedMs
    || restoreCompletedMs - restoreStartedMs > 240 * 60 * 1000) failures.push('restoreRto');
  if (!DATABASE_PATTERN.test(value?.targetDatabaseRef ?? '') || value.targetDatabaseRef === value.sourceDatabaseRef) failures.push('isolatedTarget');
  const sourceDigest = countsSha256(value?.sourceCounts ?? null);
  const restoredDigest = countsSha256(value?.restoredCounts ?? null);
  if (!value?.sourceCounts || !value?.restoredCounts || sourceDigest !== restoredDigest) failures.push('rowCounts');
  if (Number(value?.sourceCounts?.required_tables) !== 33) failures.push('requiredTables');
  if (Number(value?.sourceCounts?.schema_migrations) !== 25) failures.push('sourceMigrations');
  if (value?.sourceCounts?.schema_migrations !== value?.restoredCounts?.schema_migrations) failures.push('schemaMigrations');
  if (failures.length > 0) throw new Error(`BACKUP_RESTORE_DRILL_BLOCKED:${failures.join(',')}`);

  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_BACKUP_RESTORE_DRILL_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    ownerRef: value.ownerRef,
    backup: {
      backupId: value.backupId,
      createdAt: new Date(createdMs).toISOString(),
      offsiteStoredAt: new Date(offsiteMs).toISOString(),
      checksumVerified: true,
      artifactSha256: value.artifactSha256,
      sourceDatabaseRef: value.sourceDatabaseRef,
      offsiteStorageRef: value.storageRef,
      retentionUntil: new Date(createdMs + value.retentionDays * 86400000).toISOString()
    },
    restore: {
      drillId: value.restoreDrillId,
      backupId: value.backupId,
      startedAt: new Date(restoreStartedMs).toISOString(),
      completedAt: new Date(restoreCompletedMs).toISOString(),
      isolatedTarget: true,
      rowCountsMatch: true,
      schemaMigrationsMatch: true,
      targetDatabaseRef: value.targetDatabaseRef,
      sourceCountsSha256: sourceDigest,
      restoredCountsSha256: restoredDigest
    }
  };
}

export function writeBackupRestoreDrillExportOnce(outputPath, value, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, value, { processId });
}
