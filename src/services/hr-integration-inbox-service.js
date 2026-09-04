const crypto = require('node:crypto');
const { canonicalJson, normalizeHrEvent } = require('../integrations/hr-erp-contract');

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const OUTCOMES = new Set(['APPLIED', 'REJECTED', 'RETRY']);

class HrInboxError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'HrInboxError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) { throw new HrInboxError(code, status); }

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(code);
  return number;
}

function safeIdentifier(value, code, max = 128) {
  const text = String(value || '').trim();
  if (!text || Buffer.byteLength(text, 'utf8') > max || !SAFE_IDENTIFIER.test(text)) fail(code);
  return text;
}

function retryDelaySeconds(attempts) {
  const count = Math.max(1, Number(attempts) || 1);
  return Math.min(3600, 2 ** Math.min(12, count));
}

function failureCode(error) {
  const value = String(error?.code || '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_:-]{2,100}$/.test(value) ? value : 'HR_PROCESSING_FAILED';
}

async function audit(client, action, id, metadata = {}, trace = {}) {
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES(NULL,$1,'HR_INTEGRATION_EVENT',$2,$3::jsonb,$4,$5)`,
  [action, String(id), JSON.stringify(metadata), trace.requestId || null, trace.ip || null]);
}

async function recordHrInboxEvent(pool, { organizationId, event, trace = {} }) {
  const organization = positiveInteger(organizationId, 'HR_ORGANIZATION_ID_INVALID');
  const providerId = safeIdentifier(event?.providerId, 'HR_PROVIDER_ID_INVALID');
  const externalEventId = safeIdentifier(event?.eventId, 'HR_EXTERNAL_EVENT_ID_INVALID');
  const normalized = normalizeHrEvent(event);
  const serialized = canonicalJson(normalized);
  const payloadSha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  const client = await pool.connect();
  let result;
  let errorAfterCommit;
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`INSERT INTO hr_integration_inbox(
        organization_id,provider_id,external_event_id,event_type,occurred_at,employee_external_id,normalized_payload,payload_sha256)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT(organization_id,provider_id,external_event_id) DO NOTHING
      RETURNING id,status,payload_sha256,attempt_count,received_at`,
    [organization, providerId, externalEventId, normalized.type, normalized.occurredAt,
      normalized.employee.employeeId, serialized, payloadSha256]);
    if (inserted.rowCount) {
      const row = inserted.rows[0];
      await audit(client, 'HR_EVENT_RECEIVED', row.id, { providerId, externalEventId, type: normalized.type, payloadSha256 }, trace);
      result = { status: 'recorded', event: row };
    } else {
      const existing = await client.query(`SELECT id,status,payload_sha256,attempt_count,received_at
        FROM hr_integration_inbox WHERE organization_id=$1 AND provider_id=$2 AND external_event_id=$3 FOR UPDATE`,
      [organization, providerId, externalEventId]);
      if (!existing.rowCount) fail('HR_EVENT_CONFLICT_LOOKUP_FAILED', 409);
      const row = existing.rows[0];
      if (row.payload_sha256 === payloadSha256) {
        await audit(client, 'HR_EVENT_DUPLICATE', row.id, { providerId, externalEventId, status: row.status }, trace);
        result = { status: 'duplicate', event: row };
      } else {
        await audit(client, 'HR_EVENT_CONFLICT', row.id, { providerId, externalEventId, existingPayloadSha256: row.payload_sha256, receivedPayloadSha256: payloadSha256 }, trace);
        errorAfterCommit = new HrInboxError('HR_EVENT_ID_CONFLICT', 409);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  if (errorAfterCommit) throw errorAfterCommit;
  return result;
}

async function claimNextHrInboxEvent(pool, workerId, { organizationId = null, providerId = null } = {}) {
  const worker = safeIdentifier(workerId, 'HR_WORKER_ID_INVALID', 100);
  const organization = organizationId == null ? null : positiveInteger(organizationId, 'HR_ORGANIZATION_ID_INVALID');
  const provider = providerId == null ? null : safeIdentifier(providerId, 'HR_PROVIDER_ID_INVALID');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,organization_id,provider_id,external_event_id,event_type,occurred_at,
        employee_external_id,normalized_payload,payload_sha256,status,attempt_count
      FROM hr_integration_inbox
      WHERE ((status IN ('RECEIVED','RETRY_PENDING') AND next_attempt_at<=now())
        OR (status='PROCESSING' AND locked_at<now()-interval '5 minutes'))
        AND ($1::bigint IS NULL OR organization_id=$1) AND ($2::text IS NULL OR provider_id=$2)
        AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
      ORDER BY received_at,id FOR UPDATE SKIP LOCKED LIMIT 1`, [organization, provider]);
    if (!found.rowCount) { await client.query('COMMIT'); return null; }
    const updated = await client.query(`UPDATE hr_integration_inbox
      SET status='PROCESSING',attempt_count=attempt_count+1,locked_at=now(),locked_by=$1,updated_at=now()
      WHERE id=$2 RETURNING *`, [worker, found.rows[0].id]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function completeHrInboxEvent(pool, { id, workerId, outcome, error, trace = {} }) {
  const eventId = positiveInteger(id, 'HR_INBOX_ID_INVALID');
  const worker = safeIdentifier(workerId, 'HR_WORKER_ID_INVALID', 100);
  const normalizedOutcome = String(outcome || '').trim().toUpperCase();
  if (!OUTCOMES.has(normalizedOutcome)) fail('HR_EVENT_OUTCOME_INVALID');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,organization_id,status,attempt_count FROM hr_integration_inbox
      WHERE id=$1 AND status='PROCESSING' AND locked_by=$2 FOR UPDATE`, [eventId, worker]);
    if (!found.rowCount) fail('HR_EVENT_LOCK_NOT_OWNED', 409);
    const current = found.rows[0];
    const code = normalizedOutcome === 'APPLIED' ? null : failureCode(error);
    const terminal = normalizedOutcome !== 'RETRY' || Number(current.attempt_count) >= 10;
    const status = normalizedOutcome === 'RETRY'
      ? (terminal ? 'DEAD_LETTER' : 'RETRY_PENDING')
      : normalizedOutcome;
    const delay = status === 'RETRY_PENDING' ? retryDelaySeconds(current.attempt_count) : 0;
    const updated = await client.query(`UPDATE hr_integration_inbox SET status=$1::varchar(20),last_error_code=$2,
        next_attempt_at=CASE WHEN $1::varchar(20)='RETRY_PENDING' THEN now()+($3::text||' seconds')::interval ELSE now() END,
        processed_at=CASE WHEN $1::varchar(20) IN ('APPLIED','REJECTED','DEAD_LETTER') THEN now() ELSE NULL END,
        locked_at=NULL,locked_by=NULL,updated_at=now()
      WHERE id=$4 RETURNING id,status,attempt_count,next_attempt_at,processed_at`, [status, code, delay, eventId]);
    const action = status === 'APPLIED' ? 'HR_EVENT_APPLIED'
      : status === 'REJECTED' ? 'HR_EVENT_REJECTED'
        : status === 'DEAD_LETTER' ? 'HR_EVENT_DEAD_LETTERED' : 'HR_EVENT_RETRY_SCHEDULED';
    await audit(client, action, eventId, { status, attemptCount: Number(current.attempt_count), failureCode: code }, trace);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (caught) {
    await client.query('ROLLBACK');
    throw caught;
  } finally { client.release(); }
}

module.exports = {
  HrInboxError,
  claimNextHrInboxEvent,
  completeHrInboxEvent,
  failureCode,
  recordHrInboxEvent,
  retryDelaySeconds
};
