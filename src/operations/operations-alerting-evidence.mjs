import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const ALERTING_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-ALERTING-EVIDENCE';
export const ALERTING_TARGET_URL = 'https://inventory.safe-link.co.kr';
export const REQUIRED_ALERT_SIGNALS = ['availability', 'latency_p95', 'http_5xx', 'backup_failure', 'certificate_expiry'];

const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const PROVIDER_PATTERN = /^provider:\/\/[A-Za-z0-9._/@:-]+$/;
const CHANNEL_PATTERN = /^channel:\/\/[A-Za-z0-9._/@:-]+$/;
const RECEIPT_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function evaluateOperationsAlertingEvidenceCompiler({
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
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_ALERT_RECEIPTS', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_ALERT_RECEIPTS_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_ALERTING_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_ALERTING_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_ALERTING_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsAlertingEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.receiptType !== 'PRODUCTION_ALERT_RECEIPT_EXPORT') failures.push('source receiptType mismatch');
  if (source?.targetUrl !== ALERTING_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!PROVIDER_PATTERN.test(source?.providerRef ?? '')) failures.push('providerRef is required');
  if (!CHANNEL_PATTERN.test(source?.channelRef ?? '')) failures.push('channelRef is required');
  if (!IDENTITY_PATTERN.test(source?.recipientRef ?? '')) failures.push('recipientRef is required');
  if (!IDENTITY_PATTERN.test(source?.ownerRef ?? '')) failures.push('ownerRef is required');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const signals = Array.isArray(source?.signals) ? source.signals : [];
  if (JSON.stringify(signals.map((signal) => signal?.id)) !== JSON.stringify(REQUIRED_ALERT_SIGNALS)) {
    failures.push('signals must contain five ordered required ids');
  }
  const receiptIds = new Set();
  const compiledSignals = [];
  for (const signal of signals) {
    if (signal?.received !== true) failures.push(`${signal?.id ?? 'unknown'} receipt must be received`);
    if (!RECEIPT_PATTERN.test(signal?.receiptId ?? '')) failures.push(`${signal?.id ?? 'unknown'} receiptId is invalid`);
    if (receiptIds.has(signal?.receiptId)) failures.push('receiptIds must be unique');
    receiptIds.add(signal?.receiptId);
    if (!validDate(signal?.triggeredAt) || !validDate(signal?.receivedAt)) failures.push(`${signal?.id ?? 'unknown'} timestamps are required`);
    const triggeredAt = Date.parse(signal?.triggeredAt);
    const receivedAt = Date.parse(signal?.receivedAt);
    if (validDate(signal?.triggeredAt) && validDate(signal?.receivedAt) && receivedAt < triggeredAt) failures.push(`${signal?.id ?? 'unknown'} receivedAt must not precede triggeredAt`);
    if (validDate(signal?.receivedAt) && validDate(checkedAt) && receivedAt > Date.parse(checkedAt)) failures.push(`${signal?.id ?? 'unknown'} receivedAt must not be in the future`);
    compiledSignals.push({
      id: signal?.id,
      received: signal?.received === true,
      receiptId: signal?.receiptId,
      triggeredAt: signal?.triggeredAt,
      receivedAt: signal?.receivedAt,
      deliveryLatencySeconds: Number.isFinite(receivedAt - triggeredAt) ? Math.round((receivedAt - triggeredAt) / 1000) : null
    });
  }

  if (failures.length > 0) return { status: 'BLOCKED_ALERTING_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_ALERTING_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'alerting',
      status: 'PASS',
      checkedAt,
      metrics: { signals: compiledSignals },
      provenance: {
        targetUrl: ALERTING_TARGET_URL,
        providerRef: source.providerRef,
        channelRef: source.channelRef,
        recipientRef: source.recipientRef,
        ownerRef: source.ownerRef,
        sourceSha256
      }
    }
  };
}

export function sha256AlertingBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsAlertingEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, evidence, { processId });
}
