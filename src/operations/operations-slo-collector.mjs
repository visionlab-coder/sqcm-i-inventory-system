import fs from 'node:fs';
import path from 'node:path';
import { SLO_TARGET_URL } from './operations-slo-evidence.mjs';

export const SLO_COLLECTION_CONFIRMATION = 'ACK-COLLECT-P7-PRODUCTION-SLO-SAMPLE';
const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateSloCollectionGate({ p6EvidenceComplete = false, p7InProgress = false, productionGo = false, ledgerConfigured = false, exportConfigured = false, exportExists = false, execute = false, confirmed = false } = {}) {
  const missing = [];
  if (!ledgerConfigured) missing.push('P7_SLO_LEDGER_FILE');
  if (!exportConfigured) missing.push('P7_SLO_MEASUREMENT_INPUT_FILE');
  if (!p6EvidenceComplete || !productionGo) return { status: 'READY_WAIT_P6_ACTUAL_CUTOVER', missing, shouldProbe: false, shouldWrite: false };
  if (!p7InProgress) return { status: 'READY_WAIT_P7_ACTIVATION', missing, shouldProbe: false, shouldWrite: false };
  if (exportExists) return { status: 'PASS_P7_SLO_30_DAY_EXPORT_ALREADY_COMPLETE', missing: [], shouldProbe: false, shouldWrite: false };
  if (missing.length) return { status: 'READY_WAIT_SLO_COLLECTION_PATHS', missing, shouldProbe: false, shouldWrite: false };
  if (!execute) return { status: 'PASS_SLO_COLLECTION_DRY_RUN_READY', missing, shouldProbe: false, shouldWrite: false };
  if (!confirmed) return { status: 'READY_WAIT_SLO_COLLECTION_CONFIRMATION', missing, shouldProbe: false, shouldWrite: false };
  return { status: 'READY_COLLECT_P7_SLO_SAMPLE', missing, shouldProbe: true, shouldWrite: true };
}

export function validateSloSample(sample) {
  if (!sample || sample.schemaVersion !== 1 || sample.environment !== 'production' || sample.activationState !== 'actual') return false;
  if (sample.measurementType !== 'PRODUCTION_HTTPS_MONITORING_SAMPLE' || sample.targetUrl !== SLO_TARGET_URL) return false;
  if (typeof sample.timestamp !== 'string' || Number.isNaN(Date.parse(sample.timestamp)) || typeof sample.available !== 'boolean') return false;
  return sample.available === false || (typeof sample.latencyMs === 'number' && Number.isFinite(sample.latencyMs) && sample.latencyMs >= 0);
}

export function parseSloLedger(raw) {
  if (!raw.trim()) return [];
  const samples = raw.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (!samples.every(validateSloSample)) throw new Error('SLO_LEDGER_SAMPLE_INVALID');
  const timestamps = new Set(); const days = new Set();
  for (const sample of samples) {
    const day = sample.timestamp.slice(0, 10);
    if (timestamps.has(sample.timestamp) || days.has(day)) throw new Error('SLO_LEDGER_DUPLICATE_TIMESTAMP_OR_DAY');
    timestamps.add(sample.timestamp); days.add(day);
  }
  return samples.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function buildSloMeasurementExport(samples) {
  if (!Array.isArray(samples) || samples.length < 30 || !samples.every(validateSloSample)) throw new Error('SLO_LEDGER_REQUIRES_30_VALID_SAMPLES');
  const ordered = [...samples].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)).slice(0, 30);
  const days = ordered.map((sample) => sample.timestamp.slice(0, 10));
  if (new Set(days).size !== 30) throw new Error('SLO_LEDGER_REQUIRES_30_DISTINCT_DAYS');
  const start = Date.parse(`${days[0]}T00:00:00.000Z`);
  for (let index = 0; index < days.length; index += 1) {
    if (days[index] !== new Date(start + index * DAY_MS).toISOString().slice(0, 10)) throw new Error('SLO_LEDGER_DAYS_NOT_CONSECUTIVE');
  }
  return { schemaVersion: 1, template: false, environment: 'production', activationState: 'actual', measurementType: 'PRODUCTION_HTTPS_MONITORING_EXPORT', targetUrl: SLO_TARGET_URL, measurementStart: new Date(start).toISOString(), measurementEnd: new Date(start + 30 * DAY_MS).toISOString(), samples: ordered.map(({ timestamp, available, latencyMs }) => ({ timestamp, available, latencyMs })) };
}

export function appendSloSampleOnce(ledgerPath, sample, { processId = process.pid } = {}) {
  if (!validateSloSample(sample)) throw new Error('SLO_SAMPLE_INVALID');
  const directory = path.dirname(ledgerPath);
  if (!fs.existsSync(directory)) throw new Error('SLO_LEDGER_DIRECTORY_MISSING');
  const lockPath = `${ledgerPath}.lock`;
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600);
    const existing = fs.existsSync(ledgerPath) ? parseSloLedger(fs.readFileSync(ledgerPath, 'utf8')) : [];
    const day = sample.timestamp.slice(0, 10);
    if (existing.some((item) => item.timestamp.slice(0, 10) === day)) return { status: 'PASS_SLO_SAMPLE_ALREADY_RECORDED_FOR_UTC_DAY', sampleCount: existing.length, appended: false };
    const fd = fs.openSync(ledgerPath, 'a', 0o600);
    try { fs.writeSync(fd, `${JSON.stringify(sample)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return { status: 'PASS_SLO_SAMPLE_APPENDED', sampleCount: existing.length + 1, appended: true, processId };
  } finally {
    if (lock !== undefined) fs.closeSync(lock);
    if (fs.existsSync(lockPath)) fs.rmSync(lockPath);
  }
}

export function writeSloMeasurementExportOnce(outputPath, value, { processId = process.pid } = {}) {
  if (fs.existsSync(outputPath)) throw new Error('SLO_EXPORT_ALREADY_EXISTS');
  const temporary = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${processId}.tmp`);
  try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, outputPath); }
  catch (error) { if (fs.existsSync(temporary)) fs.rmSync(temporary); throw error; }
  return outputPath;
}
