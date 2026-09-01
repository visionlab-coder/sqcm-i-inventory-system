import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const IMPROVEMENT_QUEUE_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-IMPROVEMENT-QUEUE-EVIDENCE';
export const IMPROVEMENT_QUEUE_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const IMPROVEMENT_QUEUE_REF = 'github://visionlab-coder/sqcm-i-inventory-system/issues?label=operations';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const ISSUE_PATTERN = /^github:\/\/visionlab-coder\/sqcm-i-inventory-system\/issues\/[1-9][0-9]*$/;
const ACCEPTANCE_PATTERN = /^acceptance:\/\/[A-Za-z0-9._/@:-]+$/;
const SOURCES = new Set(['incident', 'security', 'performance', 'dependency', 'migration', 'backup', 'user_feedback']);
const SEVERITIES = new Set(['P1', 'P2', 'P3', 'P4']);
const STATUSES = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']);

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsImprovementQueueEvidenceCompiler({
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
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_IMPROVEMENT_QUEUE_EXPORT', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_IMPROVEMENT_QUEUE_EXPORT_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_IMPROVEMENT_QUEUE_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_IMPROVEMENT_QUEUE_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsImprovementQueueEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_IMPROVEMENT_QUEUE_EXPORT') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== IMPROVEMENT_QUEUE_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const queue = source?.queue ?? {};
  if (queue.provider !== 'GITHUB_ISSUES') failures.push('queue provider must be GITHUB_ISSUES');
  if (queue.repository !== 'visionlab-coder/sqcm-i-inventory-system') failures.push('queue repository mismatch');
  if (queue.queueRef !== IMPROVEMENT_QUEUE_REF) failures.push('queueRef must use the Production operations queue');
  if (!IDENTITY_PATTERN.test(queue.triageOwnerRef ?? '')) failures.push('triageOwnerRef is required');
  if (!ID_PATTERN.test(queue.triageReceiptId ?? '')) failures.push('triageReceiptId is invalid');
  if (queue.untrackedFindingCount !== 0) failures.push('untrackedFindingCount must be zero');
  for (const field of ['exportedAt', 'lastTriagedAt', 'nextTriageAt']) {
    if (!validDate(queue[field])) failures.push(`queue ${field} is required`);
  }

  const checkedMs = Date.parse(checkedAt);
  const exportedMs = Date.parse(queue.exportedAt);
  const lastTriagedMs = Date.parse(queue.lastTriagedAt);
  const nextTriageMs = Date.parse(queue.nextTriageAt);
  if (validDate(checkedAt) && validDate(queue.exportedAt) && (exportedMs > checkedMs || checkedMs - exportedMs > 24 * 60 * 60000)) failures.push('queue export must be within the last 24 hours');
  if (validDate(checkedAt) && validDate(queue.lastTriagedAt) && (lastTriagedMs > checkedMs || checkedMs - lastTriagedMs > 7 * 24 * 60 * 60000)) failures.push('queue triage must be within the last 7 days');
  if (validDate(checkedAt) && validDate(queue.nextTriageAt)
    && (nextTriageMs <= checkedMs || nextTriageMs - checkedMs > 7 * 24 * 60 * 60000)) failures.push('next queue triage must be scheduled within 7 days');

  const items = Array.isArray(queue.items) ? queue.items : [];
  if (!Number.isInteger(queue.openItemCount) || queue.openItemCount < 0 || queue.openItemCount !== items.length) failures.push('openItemCount must match queue items');
  const issueRefs = [];
  for (const item of items) {
    if (!ISSUE_PATTERN.test(item?.issueRef ?? '')) failures.push('queue item issueRef is invalid');
    if (ISSUE_PATTERN.test(item?.issueRef ?? '')) issueRefs.push(item.issueRef);
    if (!SOURCES.has(item?.source)) failures.push(`${item?.issueRef ?? 'queue item'} source is invalid`);
    if (!SEVERITIES.has(item?.severity)) failures.push(`${item?.issueRef ?? 'queue item'} severity is invalid`);
    if (!STATUSES.has(item?.status)) failures.push(`${item?.issueRef ?? 'queue item'} status is invalid`);
    if (!IDENTITY_PATTERN.test(item?.ownerRef ?? '')) failures.push(`${item?.issueRef ?? 'queue item'} ownerRef is required`);
    if (!ACCEPTANCE_PATTERN.test(item?.acceptanceRef ?? '')) failures.push(`${item?.issueRef ?? 'queue item'} acceptanceRef is required`);
    for (const field of ['createdAt', 'triagedAt', 'nextActionAt']) {
      if (!validDate(item?.[field])) failures.push(`${item?.issueRef ?? 'queue item'} ${field} is required`);
    }
    const createdMs = Date.parse(item?.createdAt);
    const triagedMs = Date.parse(item?.triagedAt);
    const nextActionMs = Date.parse(item?.nextActionAt);
    if (validDate(item?.createdAt) && validDate(item?.triagedAt) && triagedMs < createdMs) failures.push(`${item.issueRef} triage must follow creation`);
    if (validDate(checkedAt) && validDate(item?.triagedAt) && triagedMs > checkedMs) failures.push(`${item.issueRef} triage must not be in the future`);
    if (validDate(checkedAt) && validDate(item?.nextActionAt)
      && (nextActionMs < checkedMs || nextActionMs - checkedMs > 30 * 24 * 60 * 60000)) failures.push(`${item.issueRef} next action must be due within 30 days`);
    if (item?.status === 'BLOCKED' && !ISSUE_PATTERN.test(item?.blockerRef ?? '')) failures.push(`${item.issueRef} blocked item requires blockerRef`);
  }
  if (new Set(issueRefs).size !== issueRefs.length) failures.push('queue issueRefs must be unique');

  if (failures.length > 0) return { status: 'BLOCKED_IMPROVEMENT_QUEUE_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_IMPROVEMENT_QUEUE_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'improvementQueue',
      status: 'PASS',
      checkedAt,
      metrics: {
        queueRef: queue.queueRef,
        triageOwnerRef: queue.triageOwnerRef
      },
      provenance: {
        targetUrl: IMPROVEMENT_QUEUE_TARGET_URL,
        sourceSha256,
        provider: queue.provider,
        repository: queue.repository,
        exportedAt: queue.exportedAt,
        lastTriagedAt: queue.lastTriagedAt,
        nextTriageAt: queue.nextTriageAt,
        triageReceiptId: queue.triageReceiptId,
        untrackedFindingCount: 0,
        openItemCount: items.length,
        items: items.map((item) => ({
          issueRef: item.issueRef,
          source: item.source,
          severity: item.severity,
          status: item.status,
          ownerRef: item.ownerRef,
          acceptanceRef: item.acceptanceRef,
          createdAt: item.createdAt,
          triagedAt: item.triagedAt,
          nextActionAt: item.nextActionAt,
          ...(item.blockerRef ? { blockerRef: item.blockerRef } : {})
        }))
      }
    }
  };
}

export function sha256ImprovementQueueBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsImprovementQueueEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  if (!outputPath || !fs.existsSync(path.dirname(outputPath))) throw new Error('OUTPUT_DIRECTORY_MISSING');
  if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${processId}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
  return outputPath;
}
