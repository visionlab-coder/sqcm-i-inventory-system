import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const MAINTENANCE_RUNNER_CONFIRMATION = 'ACK-EXECUTE-P7-PRODUCTION-DAILY-MAINTENANCE';
export const REQUIRED_MAINTENANCE_RUNNER_CHECKS = [
  'frontend_health',
  'api_health',
  'database_health',
  'http_5xx',
  'login_failure_spike',
  'backup_success'
];

const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const SCHEDULE_PATTERN = /^maintenance:\/\/[A-Za-z0-9._/@:-]+$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;

function waiting(status, missing = []) {
  return { status, missing, externalReadAllowed: false, localEvidenceWriteAllowed: false };
}

export function evaluateOperationsMaintenanceRunnerGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  outputPresent = false,
  operatorRef,
  scheduleRef,
  nextScheduledAt,
  execute = false,
  confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  const missing = [];
  if (!outputPresent) missing.push('output');
  if (!IDENTITY_PATTERN.test(operatorRef ?? '')) missing.push('operatorRef');
  if (!SCHEDULE_PATTERN.test(scheduleRef ?? '')) missing.push('scheduleRef');
  if (typeof nextScheduledAt !== 'string' || Number.isNaN(Date.parse(nextScheduledAt))) missing.push('nextScheduledAt');
  if (missing.length > 0) return waiting('READY_WAIT_MAINTENANCE_EXECUTION_INPUTS', missing);
  if (!execute) return waiting('PASS_MAINTENANCE_RUNNER_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_MAINTENANCE_EXECUTION_CONFIRMATION');
  return { status: 'READY_EXECUTE_PRODUCTION_DAILY_MAINTENANCE', missing, externalReadAllowed: true, localEvidenceWriteAllowed: true };
}

function receiptId(checkId, completedAt, details) {
  const digest = createHash('sha256').update(JSON.stringify({ checkId, completedAt, details })).digest('hex').slice(0, 20);
  return `maintenance-${checkId}-${digest}`;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function buildMaintenanceExecutionExport(observation) {
  const failures = [];
  const startedMs = Date.parse(observation?.startedAt);
  const completedMs = Date.parse(observation?.completedAt);
  const nextMs = Date.parse(observation?.nextScheduledAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs < startedMs) failures.push('executionWindow');
  if (!Number.isFinite(nextMs) || nextMs <= completedMs || nextMs - completedMs > 24 * 60 * 60 * 1000) failures.push('nextScheduledAt');
  if (!IDENTITY_PATTERN.test(observation?.operatorRef ?? '')) failures.push('operatorRef');
  if (!SCHEDULE_PATTERN.test(observation?.scheduleRef ?? '')) failures.push('scheduleRef');
  if (!RELEASE_SHA_PATTERN.test(observation?.releaseSha ?? '')) failures.push('releaseSha');
  if (observation?.frontendStatus !== 200) failures.push('frontendHealth');
  if (observation?.apiStatus !== 200) failures.push('apiHealth');
  if (observation?.readinessStatus !== 200 || observation?.databaseQueryOk !== true || observation?.databaseName !== 'seowon_inventory') failures.push('databaseHealth');
  if (!nonNegativeInteger(observation?.recent5xx) || observation.recent5xx !== 0) failures.push('http5xx');
  if (!nonNegativeInteger(observation?.recentLoginFailures) || !nonNegativeInteger(observation?.priorLoginFailures)) failures.push('loginFailureCounts');
  const loginThreshold = nonNegativeInteger(observation?.priorLoginFailures)
    ? Math.max(5, Math.ceil((observation.priorLoginFailures / 95) * 3))
    : 5;
  if (nonNegativeInteger(observation?.recentLoginFailures) && observation.recentLoginFailures > loginThreshold) failures.push('loginFailureSpike');
  if (observation?.backupVerified !== true || !nonNegativeInteger(observation?.backupAgeMinutes) || observation.backupAgeMinutes > 1440) failures.push('backupSuccess');
  if (failures.length > 0) throw new Error(`MAINTENANCE_EXECUTION_BLOCKED:${failures.join(',')}`);

  const detailsById = {
    frontend_health: { status: observation.frontendStatus, target: 'https://inventory.safe-link.co.kr/health' },
    api_health: { status: observation.apiStatus, target: 'https://inventory.safe-link.co.kr/api/health' },
    database_health: { readinessStatus: observation.readinessStatus, databaseName: observation.databaseName, queryOk: true },
    http_5xx: { count: observation.recent5xx, windowMinutes: 15 },
    login_failure_spike: { count: observation.recentLoginFailures, prior24HourExcludingCurrent: observation.priorLoginFailures, threshold: loginThreshold },
    backup_success: { checksumVerified: true, ageMinutes: observation.backupAgeMinutes, maximumAgeMinutes: 1440 }
  };
  const checks = REQUIRED_MAINTENANCE_RUNNER_CHECKS.map((id) => ({
    id,
    status: 'PASS',
    observedAt: new Date(completedMs).toISOString(),
    receiptId: receiptId(id, new Date(completedMs).toISOString(), detailsById[id]),
    details: detailsById[id]
  }));
  const executionId = `maintenance-${new Date(completedMs).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${observation.releaseSha.slice(0, 12)}`;
  return {
    schemaVersion: 1,
    template: false,
    environment: 'production',
    activationState: 'actual',
    evidenceType: 'PRODUCTION_MAINTENANCE_EXECUTION_EXPORT',
    targetUrl: 'https://inventory.safe-link.co.kr',
    releaseSha: observation.releaseSha,
    execution: {
      executionId,
      scheduleRef: observation.scheduleRef,
      contractRef: 'docs/maintenance.md',
      operatorRef: observation.operatorRef,
      startedAt: new Date(startedMs).toISOString(),
      completedAt: new Date(completedMs).toISOString(),
      nextScheduledAt: new Date(nextMs).toISOString(),
      blockingFindingCount: 0,
      checks
    }
  };
}

export function writeMaintenanceExecutionExportOnce(outputPath, value, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, value, { processId });
}
