import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { REQUIRED_ALERT_SIGNALS } from './operations-alerting-evidence.mjs';

export const ALERT_DELIVERY_CONFIRMATION = 'ACK-SEND-P7-PRODUCTION-ALERT-DELIVERY-DRILL';
export const ALERT_DELIVERY_API_CONTRACT = 'SQCM_I_ALERT_TEST_V1';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const PROVIDER_PATTERN = /^provider:\/\/[A-Za-z0-9._/@:-]+$/;
const CHANNEL_PATTERN = /^channel:\/\/[A-Za-z0-9._/@:-]+$/;

function waiting(status, missing = []) {
  return { status, missing, externalMessageAllowed: false, secretReadAllowed: false, localEvidenceWriteAllowed: false };
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function publicHttpsEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || hostname.endsWith('.internal') || hostname.endsWith('.lan')) return false;
    if (!net.isIP(hostname) && !hostname.includes('.')) return false;
    if (net.isIP(hostname)) {
      if (hostname === '::' || hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || /^fe[89ab]/.test(hostname)) return false;
      if (hostname.startsWith('::ffff:') && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname.slice(7))) return false;
      if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname)) return false;
    }
    return true;
  } catch { return false; }
}

export function evaluateAlertDeliveryGate({
  p6EvidenceComplete = false,
  p7InProgress = false,
  productionGo = false,
  manifestPresent = false,
  credentialReferencePresent = false,
  outputConfigured = false,
  outputExists = false,
  execute = false,
  confirmed = false
} = {}) {
  if (!p6EvidenceComplete) return waiting('READY_WAIT_P6_ACTUAL_CUTOVER');
  if (!p7InProgress) return waiting('READY_WAIT_P7_ACTIVATION');
  if (!productionGo) return waiting('READY_WAIT_PRODUCTION_GO');
  if (outputExists) return waiting('PASS_ALERT_DELIVERY_EXPORT_ALREADY_COMPLETE');
  const missing = [];
  if (!manifestPresent) missing.push('providerManifest');
  if (!credentialReferencePresent) missing.push('credentialReference');
  if (!outputConfigured) missing.push('output');
  if (missing.length) return waiting('READY_WAIT_ALERT_DELIVERY_INPUTS', missing);
  if (!execute) return waiting('PASS_ALERT_DELIVERY_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_ALERT_DELIVERY_CONFIRMATION');
  return {
    status: 'READY_SEND_PRODUCTION_ALERT_DELIVERY_DRILL', missing,
    externalMessageAllowed: true, secretReadAllowed: true, localEvidenceWriteAllowed: true
  };
}

export function validateAlertDeliveryProviderManifest(value) {
  const failures = [];
  if (value?.schemaVersion !== 1) failures.push('schemaVersion');
  if (value?.environment !== 'production') failures.push('environment');
  if (value?.activationState !== 'actual') failures.push('activationState');
  if (value?.approved !== true) failures.push('approved');
  if (value?.apiContract !== ALERT_DELIVERY_API_CONTRACT) failures.push('apiContract');
  if (!PROVIDER_PATTERN.test(value?.providerRef ?? '')) failures.push('providerRef');
  if (!CHANNEL_PATTERN.test(value?.channelRef ?? '')) failures.push('channelRef');
  if (!IDENTITY_PATTERN.test(value?.recipientRef ?? '')) failures.push('recipientRef');
  if (!IDENTITY_PATTERN.test(value?.ownerRef ?? '')) failures.push('ownerRef');
  if (!ID_PATTERN.test(value?.deliveryRunId ?? '')) failures.push('deliveryRunId');
  if (!publicHttpsEndpoint(value?.endpoint ?? '')) failures.push('endpoint');
  if (!Number.isInteger(value?.maxDeliverySeconds) || value.maxDeliverySeconds < 1 || value.maxDeliverySeconds > 300) failures.push('maxDeliverySeconds');
  if (failures.length) throw new Error(`ALERT_DELIVERY_PROVIDER_MANIFEST_INVALID:${failures.join(',')}`);
  return value;
}

export function alertIdempotencyKey(runId, signalId) {
  if (!ID_PATTERN.test(runId ?? '') || !REQUIRED_ALERT_SIGNALS.includes(signalId)) throw new Error('ALERT_IDEMPOTENCY_INPUT_INVALID');
  return `sqcmi:p7-alert:${runId}:${signalId}`;
}

export function buildAlertReceiptExport({ manifest, deliveryResults, checkedAt = new Date().toISOString() } = {}) {
  const approved = validateAlertDeliveryProviderManifest(manifest);
  const failures = [];
  if (!validDate(checkedAt)) failures.push('checkedAt');
  const results = Array.isArray(deliveryResults) ? deliveryResults : [];
  if (JSON.stringify(results.map((item) => item?.signalId)) !== JSON.stringify(REQUIRED_ALERT_SIGNALS)) failures.push('signalOrder');
  const receiptIds = new Set();
  const signals = results.map((result) => {
    const expectedKey = alertIdempotencyKey(approved.deliveryRunId, result?.signalId);
    if (result?.schemaVersion !== 1 || result?.environment !== 'production' || result?.test !== true) failures.push(`${result?.signalId}:contract`);
    if (result?.deliveryRunId !== approved.deliveryRunId) failures.push(`${result?.signalId}:deliveryRunId`);
    if (result?.providerRef !== approved.providerRef || result?.channelRef !== approved.channelRef || result?.recipientRef !== approved.recipientRef) failures.push(`${result?.signalId}:provenance`);
    if (result?.idempotencyKey !== expectedKey) failures.push(`${result?.signalId}:idempotencyKey`);
    if (result?.deliveryStatus !== 'DELIVERED') failures.push(`${result?.signalId}:deliveryStatus`);
    if (!ID_PATTERN.test(result?.receiptId ?? '')) failures.push(`${result?.signalId}:receiptId`);
    if (receiptIds.has(result?.receiptId)) failures.push('duplicateReceiptId');
    receiptIds.add(result?.receiptId);
    if (!validDate(result?.triggeredAt) || !validDate(result?.receivedAt)) failures.push(`${result?.signalId}:timestamps`);
    const triggeredMs = Date.parse(result?.triggeredAt);
    const receivedMs = Date.parse(result?.receivedAt);
    const checkedMs = Date.parse(checkedAt);
    if (Number.isFinite(triggeredMs) && Number.isFinite(receivedMs)
      && (receivedMs < triggeredMs || receivedMs - triggeredMs > approved.maxDeliverySeconds * 1000)) failures.push(`${result?.signalId}:deliveryWindow`);
    if (Number.isFinite(receivedMs) && Number.isFinite(checkedMs) && receivedMs > checkedMs) failures.push(`${result?.signalId}:futureReceipt`);
    return { id: result?.signalId, received: result?.deliveryStatus === 'DELIVERED', receiptId: result?.receiptId, triggeredAt: result?.triggeredAt, receivedAt: result?.receivedAt };
  });
  if (failures.length) throw new Error(`ALERT_DELIVERY_RECEIPTS_INVALID:${[...new Set(failures)].join(',')}`);
  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    receiptType: 'PRODUCTION_ALERT_RECEIPT_EXPORT', targetUrl: 'https://inventory.safe-link.co.kr',
    providerRef: approved.providerRef, channelRef: approved.channelRef,
    recipientRef: approved.recipientRef, ownerRef: approved.ownerRef,
    deliveryRunId: approved.deliveryRunId, signals
  };
}

export function writeAlertReceiptExportOnce(outputPath, value, { processId = process.pid } = {}) {
  const directory = outputPath ? path.dirname(outputPath) : null;
  if (!directory || !fs.existsSync(directory)) throw new Error('OUTPUT_DIRECTORY_MISSING');
  if (fs.existsSync(outputPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
  const temporaryPath = path.join(directory, `.${path.basename(outputPath)}.${processId}.tmp`);
  try {
    const handle = fs.openSync(temporaryPath, 'wx', 0o600);
    try { fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(handle); }
    finally { fs.closeSync(handle); }
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
    throw error;
  }
  return outputPath;
}
