import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const ONCALL_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-ONCALL-EVIDENCE';
export const ONCALL_TARGET_URL = 'https://inventory.safe-link.co.kr';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const SCHEDULE_PATTERN = /^schedule:\/\/[A-Za-z0-9._/@:-]+$/;
const CHANNEL_PATTERN = /^channel:\/\/[A-Za-z0-9._/@:-]+$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsOnCallEvidenceCompiler({
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
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_ONCALL_HANDOVER', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_ONCALL_HANDOVER_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_ONCALL_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_ONCALL_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_ONCALL_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsOnCallEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.evidenceType !== 'PRODUCTION_ONCALL_HANDOVER_EXPORT') failures.push('source evidenceType mismatch');
  if (source?.targetUrl !== ONCALL_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!SHA256_PATTERN.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const schedule = source?.schedule ?? {};
  if (!SCHEDULE_PATTERN.test(schedule.scheduleRef ?? '')) failures.push('scheduleRef is required');
  if (schedule.timezone !== 'Asia/Seoul') failures.push('schedule timezone must be Asia/Seoul');
  if (schedule.continuousCoverage !== true) failures.push('schedule must provide continuous coverage');
  if (!IDENTITY_PATTERN.test(schedule.primaryOwnerRef ?? '')) failures.push('primaryOwnerRef is required');
  if (!IDENTITY_PATTERN.test(schedule.escalationOwnerRef ?? '')) failures.push('escalationOwnerRef is required');
  if (schedule.primaryOwnerRef === schedule.escalationOwnerRef) failures.push('primary and escalation owners must be distinct');
  for (const field of ['effectiveFrom', 'effectiveUntil', 'primaryAcceptedAt', 'escalationAcceptedAt']) {
    if (!validDate(schedule[field])) failures.push(`schedule ${field} is required`);
  }

  const checkedMs = Date.parse(checkedAt);
  const effectiveFromMs = Date.parse(schedule.effectiveFrom);
  const effectiveUntilMs = Date.parse(schedule.effectiveUntil);
  const primaryAcceptedMs = Date.parse(schedule.primaryAcceptedAt);
  const escalationAcceptedMs = Date.parse(schedule.escalationAcceptedAt);
  if (validDate(checkedAt) && validDate(schedule.effectiveFrom) && checkedMs < effectiveFromMs) failures.push('on-call schedule must already be effective');
  if (validDate(checkedAt) && validDate(schedule.effectiveUntil) && effectiveUntilMs - checkedMs < 30 * 86400000) failures.push('on-call schedule must cover at least 30 future days');
  if (validDate(schedule.effectiveFrom) && validDate(schedule.effectiveUntil) && effectiveUntilMs <= effectiveFromMs) failures.push('schedule effectiveUntil must follow effectiveFrom');
  for (const [label, acceptedMs] of [['primary', primaryAcceptedMs], ['escalation', escalationAcceptedMs]]) {
    if (validDate(checkedAt) && Number.isFinite(acceptedMs) && acceptedMs > checkedMs) failures.push(`${label} acceptance must not be in the future`);
    if (validDate(schedule.effectiveFrom) && Number.isFinite(acceptedMs) && acceptedMs < effectiveFromMs) failures.push(`${label} acceptance must not precede schedule`);
  }

  const drill = source?.drill ?? {};
  if (!ID_PATTERN.test(drill.drillId ?? '')) failures.push('drillId is invalid');
  if (!CHANNEL_PATTERN.test(drill.channelRef ?? '')) failures.push('drill channelRef is required');
  if (drill.primaryOwnerRef !== schedule.primaryOwnerRef) failures.push('drill primary owner must match schedule');
  if (drill.escalationOwnerRef !== schedule.escalationOwnerRef) failures.push('drill escalation owner must match schedule');
  for (const field of ['initiatedAt', 'primaryAcknowledgedAt', 'escalationTriggeredAt', 'escalationAcknowledgedAt']) {
    if (!validDate(drill[field])) failures.push(`drill ${field} is required`);
  }
  if (!ID_PATTERN.test(drill.primaryReceiptId ?? '')) failures.push('primaryReceiptId is invalid');
  if (!ID_PATTERN.test(drill.escalationReceiptId ?? '')) failures.push('escalationReceiptId is invalid');
  if (drill.primaryReceiptId === drill.escalationReceiptId) failures.push('on-call receiptIds must be unique');

  const initiatedMs = Date.parse(drill.initiatedAt);
  const primaryAckMs = Date.parse(drill.primaryAcknowledgedAt);
  const escalationTriggeredMs = Date.parse(drill.escalationTriggeredAt);
  const escalationAckMs = Date.parse(drill.escalationAcknowledgedAt);
  const primaryAckMinutes = (primaryAckMs - initiatedMs) / 60000;
  const escalationAckMinutes = (escalationAckMs - escalationTriggeredMs) / 60000;
  const drillAgeMinutes = (checkedMs - initiatedMs) / 60000;
  if (validDate(drill.initiatedAt) && validDate(drill.primaryAcknowledgedAt) && (primaryAckMinutes < 0 || primaryAckMinutes > 5)) failures.push('primary acknowledgement must be within 5 minutes');
  if (validDate(drill.initiatedAt) && validDate(drill.escalationTriggeredAt) && escalationTriggeredMs < initiatedMs) failures.push('escalation trigger must not precede drill');
  if (validDate(drill.escalationTriggeredAt) && validDate(drill.escalationAcknowledgedAt) && (escalationAckMinutes < 0 || escalationAckMinutes > 15)) failures.push('escalation acknowledgement must be within 15 minutes');
  if (validDate(checkedAt) && validDate(drill.initiatedAt) && (drillAgeMinutes < 0 || drillAgeMinutes > 7 * 1440)) failures.push('on-call drill must be within 7 days');
  for (const [label, timestamp] of [['primary acknowledgement', primaryAckMs], ['escalation trigger', escalationTriggeredMs], ['escalation acknowledgement', escalationAckMs]]) {
    if (validDate(checkedAt) && Number.isFinite(timestamp) && timestamp > checkedMs) failures.push(`${label} must not be in the future`);
  }

  if (failures.length > 0) return { status: 'BLOCKED_ONCALL_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_ONCALL_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'onCall',
      status: 'PASS',
      checkedAt,
      metrics: {
        primaryOwnerRef: schedule.primaryOwnerRef,
        escalationOwnerRef: schedule.escalationOwnerRef
      },
      provenance: {
        targetUrl: ONCALL_TARGET_URL,
        sourceSha256,
        scheduleRef: schedule.scheduleRef,
        timezone: 'Asia/Seoul',
        continuousCoverage: true,
        effectiveFrom: schedule.effectiveFrom,
        effectiveUntil: schedule.effectiveUntil,
        primaryAcceptedAt: schedule.primaryAcceptedAt,
        escalationAcceptedAt: schedule.escalationAcceptedAt,
        drillId: drill.drillId,
        channelRef: drill.channelRef,
        initiatedAt: drill.initiatedAt,
        primaryAcknowledgedAt: drill.primaryAcknowledgedAt,
        primaryAckMinutes,
        primaryReceiptId: drill.primaryReceiptId,
        escalationTriggeredAt: drill.escalationTriggeredAt,
        escalationAcknowledgedAt: drill.escalationAcknowledgedAt,
        escalationAckMinutes,
        escalationReceiptId: drill.escalationReceiptId
      }
    }
  };
}

export function sha256OnCallBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsOnCallEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
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
