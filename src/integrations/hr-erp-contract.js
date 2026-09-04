const crypto = require('node:crypto');

const INBOUND_SIGNATURE_VERSION = 'v1';
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const HR_EVENT_TYPES = new Set(['employee.upserted', 'employee.transferred', 'employee.terminated']);
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_EVENT_TYPE = /^[A-Z][A-Z0-9_]{2,79}$/;
const PROHIBITED_PAYLOAD_KEY = /(?:password|secret|token|authorization|cookie|residentregistration|rrn|ssn)/i;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

class IntegrationContractError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'IntegrationContractError';
    this.code = code;
    this.status = status;
  }
}

function reject(code, status) {
  throw new IntegrationContractError(code, status);
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === 'function') return String(headers.get(name) || '').trim();
  const match = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name);
  return String(match?.[1] || '').trim();
}

function requireRawBody(rawBody) {
  if (!Buffer.isBuffer(rawBody)) reject('WEBHOOK_RAW_BODY_REQUIRED');
  if (!rawBody.length) reject('WEBHOOK_BODY_EMPTY');
  if (rawBody.length > MAX_WEBHOOK_BYTES) reject('WEBHOOK_BODY_TOO_LARGE', 413);
  return rawBody;
}

function requireSecret(secret) {
  const value = String(secret || '');
  if (Buffer.byteLength(value, 'utf8') < 32) reject('WEBHOOK_SECRET_INVALID', 500);
  return value;
}

function signWebhookPayload({ rawBody, timestamp, secret }) {
  const body = requireRawBody(rawBody);
  const signingSecret = requireSecret(secret);
  return crypto.createHmac('sha256', signingSecret).update(String(timestamp)).update('.').update(body).digest('hex');
}

function exactText(value, code, { max = 128, pattern } = {}) {
  const text = String(value || '').trim();
  if (!text || Buffer.byteLength(text, 'utf8') > max || (pattern && !pattern.test(text))) reject(code);
  return text;
}

function optionalText(value, code, { max = 160, lower = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const text = String(value).trim();
  if (Buffer.byteLength(text, 'utf8') > max) reject(code);
  return lower ? text.toLowerCase() : text;
}

function normalizeHrEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('HR_EVENT_OBJECT_REQUIRED');
  if (input.schemaVersion !== 1) reject('HR_SCHEMA_VERSION_UNSUPPORTED');
  const type = exactText(input.type, 'HR_EVENT_TYPE_REQUIRED');
  if (!HR_EVENT_TYPES.has(type)) reject('HR_EVENT_TYPE_UNSUPPORTED');
  const occurredAtDate = new Date(input.occurredAt);
  if (!input.occurredAt || Number.isNaN(occurredAtDate.getTime())) reject('HR_OCCURRED_AT_INVALID');
  if (!input.employee || typeof input.employee !== 'object' || Array.isArray(input.employee)) reject('HR_EMPLOYEE_REQUIRED');

  const employeeId = exactText(input.employee.employeeId, 'HR_EMPLOYEE_ID_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const displayName = optionalText(input.employee.displayName, 'HR_DISPLAY_NAME_INVALID', { max: 100 });
  if (type === 'employee.upserted' && !displayName) reject('HR_DISPLAY_NAME_REQUIRED');
  const employee = { employeeId };
  const email = optionalText(input.employee.email, 'HR_EMAIL_INVALID', { max: 254, lower: true });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject('HR_EMAIL_INVALID');
  const organizationCode = optionalText(input.employee.organizationCode, 'HR_ORGANIZATION_CODE_INVALID', { max: 80 });
  const departmentCode = optionalText(input.employee.departmentCode, 'HR_DEPARTMENT_CODE_INVALID', { max: 80 });
  if (email) employee.email = email;
  if (displayName) employee.displayName = displayName;
  if (organizationCode) employee.organizationCode = organizationCode;
  if (departmentCode) employee.departmentCode = departmentCode;

  return { schemaVersion: 1, type, occurredAt: occurredAtDate.toISOString(), employee };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) reject('ERP_PAYLOAD_INVALID');
  return serialized;
}

function parseSignature(value) {
  const match = /^v1=([a-f0-9]{64})$/.exec(value);
  if (!match) reject('WEBHOOK_SIGNATURE_FORMAT_INVALID', 401);
  return Buffer.from(match[1], 'hex');
}

async function verifyHrWebhook({ providerId, rawBody, headers, secret, now = new Date(), reserveReplayKey }) {
  const body = requireRawBody(rawBody);
  const approvedProvider = exactText(providerId, 'WEBHOOK_PROVIDER_REQUIRED', { pattern: SAFE_IDENTIFIER });
  if (!/^application\/json(?:\s*;|$)/i.test(headerValue(headers, 'content-type'))) reject('WEBHOOK_CONTENT_TYPE_INVALID', 415);
  const eventId = exactText(headerValue(headers, 'x-sqcm-event-id'), 'WEBHOOK_EVENT_ID_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const timestampText = headerValue(headers, 'x-sqcm-timestamp');
  if (!/^\d{10}$/.test(timestampText)) reject('WEBHOOK_TIMESTAMP_INVALID', 401);
  const timestamp = Number(timestampText);
  const nowSeconds = Math.floor(new Date(now).getTime() / 1000);
  if (!Number.isFinite(nowSeconds)) reject('WEBHOOK_NOW_INVALID', 500);
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) reject('WEBHOOK_TIMESTAMP_EXPIRED', 401);

  const supplied = parseSignature(headerValue(headers, 'x-sqcm-signature'));
  const expected = Buffer.from(signWebhookPayload({ rawBody: body, timestamp, secret }), 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) reject('WEBHOOK_SIGNATURE_INVALID', 401);

  let parsed;
  try { parsed = JSON.parse(utf8Decoder.decode(body)); } catch { reject('WEBHOOK_JSON_INVALID'); }
  const event = normalizeHrEvent(parsed);
  if (typeof reserveReplayKey !== 'function') reject('WEBHOOK_REPLAY_GUARD_REQUIRED', 500);
  const replayKey = `${approvedProvider}:${eventId}`;
  if (await reserveReplayKey(replayKey, { expiresAt: new Date((nowSeconds + (MAX_CLOCK_SKEW_SECONDS * 2)) * 1000).toISOString() }) !== true) {
    reject('WEBHOOK_REPLAYED', 409);
  }
  return { providerId: approvedProvider, eventId, ...event };
}

function inspectPayload(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) reject('ERP_PAYLOAD_CIRCULAR');
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (PROHIBITED_PAYLOAD_KEY.test(key)) reject('ERP_PAYLOAD_PROHIBITED_FIELD');
    inspectPayload(child, seen);
  }
  seen.delete(value);
}

function buildErpOutboxEnvelope(event, { source = 'sqcm-i-inventory', occurredAt = new Date().toISOString() } = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) reject('ERP_EVENT_OBJECT_REQUIRED');
  const eventId = exactText(event.id, 'ERP_EVENT_ID_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const type = exactText(event.type, 'ERP_EVENT_TYPE_REQUIRED');
  if (!SAFE_EVENT_TYPE.test(type)) reject('ERP_EVENT_TYPE_INVALID');
  const aggregateType = exactText(event.aggregateType, 'ERP_AGGREGATE_TYPE_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const aggregateId = exactText(event.aggregateId, 'ERP_AGGREGATE_ID_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const idempotencyKey = exactText(event.idempotencyKey, 'ERP_IDEMPOTENCY_KEY_REQUIRED', { pattern: /^[A-Za-z0-9._:-]{8,100}$/ });
  const sourceName = exactText(source, 'ERP_SOURCE_REQUIRED', { pattern: SAFE_IDENTIFIER });
  const occurredAtDate = new Date(occurredAt);
  if (Number.isNaN(occurredAtDate.getTime())) reject('ERP_OCCURRED_AT_INVALID');
  const payload = event.payload ?? {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) reject('ERP_PAYLOAD_OBJECT_REQUIRED');
  inspectPayload(payload);
  let serialized;
  try { serialized = canonicalJson(payload); } catch (error) {
    if (error instanceof IntegrationContractError) throw error;
    reject('ERP_PAYLOAD_INVALID');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_WEBHOOK_BYTES) reject('ERP_PAYLOAD_TOO_LARGE');

  return {
    schemaVersion: 1,
    source: sourceName,
    eventId,
    type,
    aggregateType,
    aggregateId,
    occurredAt: occurredAtDate.toISOString(),
    idempotencyKey,
    payloadSha256: crypto.createHash('sha256').update(serialized).digest('hex'),
    payload
  };
}

module.exports = {
  INBOUND_SIGNATURE_VERSION,
  IntegrationContractError,
  MAX_CLOCK_SKEW_SECONDS,
  MAX_WEBHOOK_BYTES,
  buildErpOutboxEnvelope,
  canonicalJson,
  normalizeHrEvent,
  signWebhookPayload,
  verifyHrWebhook
};
