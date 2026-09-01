import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const ONCALL_DRILL_CONFIRMATION = 'ACK-SEND-P7-PRODUCTION-ONCALL-ESCALATION-DRILL';
export const ONCALL_DRILL_API_CONTRACT = 'SQCM_I_ONCALL_DRILL_V1';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const IDENTITY_PATTERN = /^identity:\/\/[A-Za-z0-9._/@:-]+$/;
const PROVIDER_PATTERN = /^provider:\/\/[A-Za-z0-9._/@:-]+$/;
const SCHEDULE_PATTERN = /^schedule:\/\/[A-Za-z0-9._/@:-]+$/;
const CHANNEL_PATTERN = /^channel:\/\/[A-Za-z0-9._/@:-]+$/;
const ROLES = ['PRIMARY', 'ESCALATION'];

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
      if (/^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|224\.|23[2-9]\.|24[0-9]\.|25[0-5]\.)/.test(hostname)) return false;
    }
    return true;
  } catch { return false; }
}

export function evaluateOnCallDrillGate({
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
  if (outputExists) return waiting('PASS_ONCALL_DRILL_EXPORT_ALREADY_COMPLETE');
  const missing = [];
  if (!manifestPresent) missing.push('providerManifest');
  if (!credentialReferencePresent) missing.push('credentialReference');
  if (!outputConfigured) missing.push('output');
  if (missing.length) return waiting('READY_WAIT_ONCALL_DRILL_INPUTS', missing);
  if (!execute) return waiting('PASS_ONCALL_DRILL_DRY_RUN_READY');
  if (!confirmed) return waiting('READY_WAIT_ONCALL_DRILL_CONFIRMATION');
  return {
    status: 'READY_SEND_PRODUCTION_ONCALL_ESCALATION_DRILL', missing,
    externalMessageAllowed: true, secretReadAllowed: true, localEvidenceWriteAllowed: true
  };
}

export function validateOnCallDrillProviderManifest(value) {
  const failures = [];
  if (value?.schemaVersion !== 1) failures.push('schemaVersion');
  if (value?.environment !== 'production') failures.push('environment');
  if (value?.activationState !== 'actual') failures.push('activationState');
  if (value?.approved !== true) failures.push('approved');
  if (value?.apiContract !== ONCALL_DRILL_API_CONTRACT) failures.push('apiContract');
  if (!PROVIDER_PATTERN.test(value?.providerRef ?? '')) failures.push('providerRef');
  if (!CHANNEL_PATTERN.test(value?.channelRef ?? '')) failures.push('channelRef');
  if (!ID_PATTERN.test(value?.drillId ?? '')) failures.push('drillId');
  if (!publicHttpsEndpoint(value?.endpoint ?? '')) failures.push('endpoint');
  const schedule = value?.schedule ?? {};
  if (!SCHEDULE_PATTERN.test(schedule.scheduleRef ?? '')) failures.push('scheduleRef');
  if (schedule.timezone !== 'Asia/Seoul') failures.push('timezone');
  if (schedule.continuousCoverage !== true) failures.push('continuousCoverage');
  if (!IDENTITY_PATTERN.test(schedule.primaryOwnerRef ?? '')) failures.push('primaryOwnerRef');
  if (!IDENTITY_PATTERN.test(schedule.escalationOwnerRef ?? '')) failures.push('escalationOwnerRef');
  if (schedule.primaryOwnerRef === schedule.escalationOwnerRef) failures.push('distinctOwners');
  for (const field of ['effectiveFrom', 'effectiveUntil', 'primaryAcceptedAt', 'escalationAcceptedAt']) {
    if (!validDate(schedule[field])) failures.push(field);
  }
  if (value?.primaryMaxAckSeconds !== 300) failures.push('primaryMaxAckSeconds');
  if (value?.escalationMaxAckSeconds !== 900) failures.push('escalationMaxAckSeconds');
  if (failures.length) throw new Error(`ONCALL_DRILL_PROVIDER_MANIFEST_INVALID:${failures.join(',')}`);
  return value;
}

export function onCallDrillIdempotencyKey(drillId, role) {
  if (!ID_PATTERN.test(drillId ?? '') || !ROLES.includes(role)) throw new Error('ONCALL_DRILL_IDEMPOTENCY_INPUT_INVALID');
  return `sqcmi:p7-oncall:${drillId}:${role.toLowerCase()}`;
}

export function buildOnCallHandoverExport({ manifest, acknowledgementResults, checkedAt = new Date().toISOString() } = {}) {
  const approved = validateOnCallDrillProviderManifest(manifest);
  const failures = [];
  if (!validDate(checkedAt)) failures.push('checkedAt');
  const checkedMs = Date.parse(checkedAt);
  const schedule = approved.schedule;
  const effectiveFromMs = Date.parse(schedule.effectiveFrom);
  const effectiveUntilMs = Date.parse(schedule.effectiveUntil);
  if (checkedMs < effectiveFromMs) failures.push('scheduleNotEffective');
  if (effectiveUntilMs - checkedMs < 30 * 86400000) failures.push('scheduleCoverage');
  if (effectiveUntilMs <= effectiveFromMs) failures.push('scheduleOrder');
  for (const field of ['primaryAcceptedAt', 'escalationAcceptedAt']) {
    const acceptedMs = Date.parse(schedule[field]);
    if (acceptedMs < effectiveFromMs || acceptedMs > checkedMs) failures.push(field);
  }

  const results = Array.isArray(acknowledgementResults) ? acknowledgementResults : [];
  if (JSON.stringify(results.map((item) => item?.role)) !== JSON.stringify(ROLES)) failures.push('roleOrder');
  const receiptIds = new Set();
  const verified = results.map((result, index) => {
    const role = ROLES[index];
    const expectedOwner = role === 'PRIMARY' ? schedule.primaryOwnerRef : schedule.escalationOwnerRef;
    const expectedKey = onCallDrillIdempotencyKey(approved.drillId, role);
    if (result?.schemaVersion !== 1 || result?.environment !== 'production' || result?.test !== true) failures.push(`${role}:contract`);
    if (result?.drillId !== approved.drillId || result?.role !== role) failures.push(`${role}:drillRole`);
    if (result?.providerRef !== approved.providerRef || result?.channelRef !== approved.channelRef || result?.ownerRef !== expectedOwner) failures.push(`${role}:provenance`);
    if (result?.idempotencyKey !== expectedKey) failures.push(`${role}:idempotencyKey`);
    if (result?.acknowledgementStatus !== 'ACKNOWLEDGED') failures.push(`${role}:acknowledgementStatus`);
    if (!ID_PATTERN.test(result?.receiptId ?? '')) failures.push(`${role}:receiptId`);
    if (receiptIds.has(result?.receiptId)) failures.push('duplicateReceiptId');
    receiptIds.add(result?.receiptId);
    if (!validDate(result?.triggeredAt) || !validDate(result?.acknowledgedAt)) failures.push(`${role}:timestamps`);
    const triggeredMs = Date.parse(result?.triggeredAt);
    const acknowledgedMs = Date.parse(result?.acknowledgedAt);
    const maximumMs = (role === 'PRIMARY' ? approved.primaryMaxAckSeconds : approved.escalationMaxAckSeconds) * 1000;
    if (Number.isFinite(triggeredMs) && Number.isFinite(acknowledgedMs)
      && (acknowledgedMs < triggeredMs || acknowledgedMs - triggeredMs > maximumMs)) failures.push(`${role}:acknowledgementWindow`);
    if (Number.isFinite(triggeredMs) && triggeredMs > checkedMs) failures.push(`${role}:futureTrigger`);
    if (Number.isFinite(acknowledgedMs) && acknowledgedMs > checkedMs) failures.push(`${role}:futureAcknowledgement`);
    return result;
  });
  const primary = verified[0] ?? {};
  const escalation = verified[1] ?? {};
  if (validDate(primary.triggeredAt) && checkedMs - Date.parse(primary.triggeredAt) > 7 * 86400000) failures.push('drillFreshness');
  if (validDate(primary.triggeredAt) && validDate(escalation.triggeredAt) && Date.parse(escalation.triggeredAt) < Date.parse(primary.triggeredAt)) failures.push('escalationOrder');
  if (failures.length) throw new Error(`ONCALL_DRILL_ACKNOWLEDGEMENTS_INVALID:${[...new Set(failures)].join(',')}`);

  return {
    schemaVersion: 1, template: false, environment: 'production', activationState: 'actual',
    evidenceType: 'PRODUCTION_ONCALL_HANDOVER_EXPORT', targetUrl: 'https://inventory.safe-link.co.kr',
    schedule: { ...schedule },
    drill: {
      drillId: approved.drillId, channelRef: approved.channelRef,
      primaryOwnerRef: schedule.primaryOwnerRef, escalationOwnerRef: schedule.escalationOwnerRef,
      initiatedAt: primary.triggeredAt, primaryAcknowledgedAt: primary.acknowledgedAt,
      primaryReceiptId: primary.receiptId, escalationTriggeredAt: escalation.triggeredAt,
      escalationAcknowledgedAt: escalation.acknowledgedAt, escalationReceiptId: escalation.receiptId
    }
  };
}

export function writeOnCallHandoverExportOnce(outputPath, value, { processId = process.pid } = {}) {
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
