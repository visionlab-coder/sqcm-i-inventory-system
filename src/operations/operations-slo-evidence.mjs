import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeCreateOnlyJsonOutput } from './operations-create-only-json-output.mjs';

export const SLO_EVIDENCE_CONFIRMATION = 'ACK-COMPILE-P7-PRODUCTION-SLO-EVIDENCE';
export const SLO_TARGET_URL = 'https://inventory.safe-link.co.kr';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_WINDOW_DAYS = 30;
const MAXIMUM_WINDOW_DAYS = 31;

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function percentile95(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)];
}

export function evaluateOperationsSloEvidenceCompiler({
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
  if (!p6EvidenceComplete) return { status: 'READY_WAIT_P6_COMPLETION_AND_SLO_INPUT', missing, evidenceCreated: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, evidenceCreated: false };
  if (missing.length > 0) return { status: 'READY_WAIT_SLO_INPUT_AND_OUTPUT', missing, evidenceCreated: false };
  if (!execute) return { status: 'PASS_SLO_EVIDENCE_COMPILER_DRY_RUN_READY', missing, evidenceCreated: false };
  if (!confirmed) return { status: 'READY_WAIT_SLO_EVIDENCE_CONFIRMATION', missing, evidenceCreated: false };
  return { status: 'READY_SLO_EVIDENCE_COMPILATION', missing, evidenceCreated: false };
}

export function compileOperationsSloEvidence(source, { checkedAt = new Date().toISOString(), sourceSha256 } = {}) {
  const failures = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) failures.push('source must be an object');
  if (source?.schemaVersion !== 1) failures.push('source schemaVersion must be 1');
  if (source?.template !== false) failures.push('source template must be false');
  if (source?.environment !== 'production') failures.push('source environment must be production');
  if (source?.activationState !== 'actual') failures.push('source activationState must be actual');
  if (source?.measurementType !== 'PRODUCTION_HTTPS_MONITORING_EXPORT') failures.push('source measurementType mismatch');
  if (source?.targetUrl !== SLO_TARGET_URL) failures.push('source targetUrl must match Production');
  if (!validDate(source?.measurementStart) || !validDate(source?.measurementEnd)) failures.push('measurement start and end are required');

  const start = Date.parse(source?.measurementStart);
  const end = Date.parse(source?.measurementEnd);
  const durationDays = (end - start) / DAY_MS;
  if (!(durationDays >= MINIMUM_WINDOW_DAYS && durationDays < MAXIMUM_WINDOW_DAYS)) failures.push('measurement window must cover 30 days');

  const samples = Array.isArray(source?.samples) ? source.samples : [];
  if (samples.length === 0) failures.push('measurement samples are required');
  const timestamps = new Set();
  const coveredDays = new Set();
  const latencies = [];
  let availableCount = 0;
  for (const sample of samples) {
    const timestamp = Date.parse(sample?.timestamp);
    if (!validDate(sample?.timestamp) || timestamp < start || timestamp > end) failures.push('sample timestamp must be inside the measurement window');
    if (timestamps.has(sample?.timestamp)) failures.push('sample timestamps must be unique');
    timestamps.add(sample?.timestamp);
    if (validDate(sample?.timestamp)) coveredDays.add(new Date(timestamp).toISOString().slice(0, 10));
    if (typeof sample?.available !== 'boolean') failures.push('sample availability must be boolean');
    if (sample?.available === true) {
      availableCount += 1;
      if (!(typeof sample.latencyMs === 'number' && Number.isFinite(sample.latencyMs) && sample.latencyMs >= 0)) failures.push('available sample latency must be a non-negative number');
      else latencies.push(sample.latencyMs);
    }
  }
  if (coveredDays.size < MINIMUM_WINDOW_DAYS) failures.push('samples must cover at least 30 distinct UTC dates');
  if (latencies.length === 0) failures.push('at least one available latency sample is required');
  if (!validDate(checkedAt)) failures.push('checkedAt is required');
  if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? '')) failures.push('source sha256 is required');

  const availabilityPercent = samples.length > 0 ? Number(((availableCount / samples.length) * 100).toFixed(4)) : 0;
  const p95Ms = latencies.length > 0 ? percentile95(latencies) : null;
  if (availabilityPercent < 99.5) failures.push('availability target not met');
  if (!(p95Ms !== null && p95Ms <= 1000)) failures.push('p95 target not met');

  if (failures.length > 0) return { status: 'BLOCKED_SLO_EVIDENCE_INVALID', failures, evidence: null };
  return {
    status: 'PASS_SLO_EVIDENCE_COMPILED',
    failures,
    evidence: {
      schemaVersion: 1,
      environment: 'production',
      activationState: 'actual',
      evidenceType: 'P7_OPERATIONS_DOMAIN_ACTUAL',
      domain: 'slo',
      status: 'PASS',
      checkedAt,
      metrics: {
        availabilityPercent,
        p95Ms,
        measurementWindowDays: 30,
        sampleCount: samples.length
      },
      provenance: {
        targetUrl: SLO_TARGET_URL,
        measurementStart: source.measurementStart,
        measurementEnd: source.measurementEnd,
        sourceSha256
      }
    }
  };
}

export function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeOperationsSloEvidenceOnce(outputPath, evidence, { processId = process.pid } = {}) {
  return writeCreateOnlyJsonOutput(outputPath, evidence, { processId });
}
