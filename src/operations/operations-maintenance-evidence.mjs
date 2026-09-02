import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const MAINTENANCE_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-MAINTENANCE-EVIDENCE';
export const MAINTENANCE_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const REQUIRED_DAILY_MAINTENANCE_CHECKS = [
  'frontend_health',
  'api_health',
  'database_health',
  'http_5xx',
  'login_failure_spike',
  'backup_success'
];

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const SCHEDULE_PATTERN = /^maintenance:\/\/[A-Za-z0-9._/@:-]+$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsMaintenanceEvidenceCompiler({
  p6EvidenceComplete = false,
  p7InProgress = false,
  inputPresent = false,
  outputPresent = false,
  execute = false,
  confirmed = false
} = {}) {
  const missing = [];
  if (!inputPresent) missing.push('input');
  if (!outputPresent) missing.push('output');
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_MAINTENANCE_EXECUTION', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_MAINTENANCE_EXECUTION_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_MAINTENANCE_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_MAINTENANCE_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_MAINTENANCE_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsMaintenanceEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_MAINTENANCE_EXECUTION_EXPORT') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== MAINTENANCE_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!RELEASE_SHA_PATTERN.test(source?.releaseSha ?? '')) failures.push('source releaseSha must be an immutable SHA');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const execution = source?.execution ?? {};
  if (!ID_PATTERN.test(execution.executionId ?? '')) failures.push('executionId is invalid');
  if (!SCHEDULE_PATTERN.test(execution.scheduleRef ?? '')) failures.push('scheduleRef is required');
  if (execution.contractRef !== 'docs/maintenance.md') failures.push('contractRef must be docs/maintenance.md');
  if (!IDENTITY_PATTERN.test(execution.operatorRef ?? '')) failures.push('operatorRef is required');
  if (execution.blockingFindingCount !== 0) failures.push('blockingFindingCount must be zero');
  for (const field of ['startedAt', 'completedAt', 'nextScheduledAt']) {
    if (!validDate(execution[field])) failures.push(`execution ${field} is required`);
  }

  const checkedMs = Date.parse(checkedAt);
  const startedMs = Date.parse(execution.startedAt);
  const completedMs = Date.parse(execution.completedAt);
  const nextScheduledMs = Date.parse(execution.nextScheduledAt);
  if (validDate(execution.startedAt) && validDate(execution.completedAt) && completedMs < startedMs) failures.push('maintenance completion must follow start');
  if (validDate(checkedAt) && validDate(execution.completedAt) && (completedMs > checkedMs || checkedMs - completedMs > 24 * 60 * 60000)) failures.push('maintenance execution must be completed within the last 24 hours');
  if (validDate(execution.completedAt) && validDate(execution.nextScheduledAt)
    && (nextScheduledMs <= completedMs || nextScheduledMs - completedMs > 24 * 60 * 60000)) failures.push('next daily maintenance must be scheduled within 24 hours');

  const checks = Array.isArray(execution.checks) ? execution.checks : [];
  if (JSON.stringify(checks.map((item) => item?.id)) !== JSON.stringify(REQUIRED_DAILY_MAINTENANCE_CHECKS)) failures.push('daily maintenance checks must match the approved order');
  const receiptIds = [];
  for (const check of checks) {
    if (check?.status !== 'PASS') failures.push(`${check?.id ?? 'maintenance'} check must PASS`);
    if (!validDate(check?.observedAt)) failures.push(`${check?.id ?? 'maintenance'} observedAt is required`);
    if (!ID_PATTERN.test(check?.receiptId ?? '')) failures.push(`${check?.id ?? 'maintenance'} receiptId is invalid`);
    if (ID_PATTERN.test(check?.receiptId ?? '')) receiptIds.push(check.receiptId);
    const observedMs = Date.parse(check?.observedAt);
    if (validDate(check?.observedAt) && validDate(execution.startedAt) && validDate(execution.completedAt)
      && (observedMs < startedMs || observedMs > completedMs)) failures.push(`${check.id} observation must be within the execution window`);
  }
  if (new Set(receiptIds).size !== receiptIds.length) failures.push('maintenance receiptIds must be unique');

  if (failures.length > 0) return { status: 'BLOCKED_MAINTENANCE_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_MAINTENANCE_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'maintenance',
      status: 'PASS',
      checkedAt,
      metrics: {
        contractRef: 'docs/maintenance.md',
        executionPassed: true,
        executedAt: execution.completedAt
      },
      provenance: {
        targetUrl: MAINTENANCE_TARGET_URL,
        releaseSha: source.releaseSha,
        sourceSha256,
        executionId: execution.executionId,
        scheduleRef: execution.scheduleRef,
        operatorRef: execution.operatorRef,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        nextScheduledAt: execution.nextScheduledAt,
        blockingFindingCount: 0,
        checks: checks.map((check) => ({ id: check.id, observedAt: check.observedAt, receiptId: check.receiptId }))
      }
    }
  };
}

export function sha256MaintenanceBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsMaintenanceEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, evidence, { processId });
}
