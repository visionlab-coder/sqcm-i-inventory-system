import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPool, initializeDatabase } = require('../src/db');
const { claimNextHrInboxEvent, completeHrInboxEvent, recordHrInboxEvent } = require('../src/services/hr-integration-inbox-service');

if (!process.env.DATABASE_URL) throw new Error('Local integration DATABASE_URL is required.');
process.env.DB_AUTO_MIGRATE = 'false';
process.env.DB_RUN_SEEDS = 'false';
process.env.DB_MIGRATION_HISTORY_MODE = 'application';

const pool = createPool(process.env.DATABASE_URL);
const providerId = 'contract-test';
const marker = crypto.randomUUID();
const ids = [];

function event(eventId, type = 'employee.transferred', departmentCode = 'SITE-01') {
  return {
    providerId, eventId, schemaVersion: 1, type, occurredAt: new Date().toISOString(),
    employee: { employeeId: `EMP-${marker}`, email: `synthetic-${marker}@example.invalid`, displayName: '합성 연동 시험', organizationCode: 'SEOWON', departmentCode }
  };
}

try {
  await initializeDatabase(pool, { dbAutoMigrate: false, dbRunSeeds: false, dbMigrationHistoryMode: 'application' });
  const organization = await pool.query("SELECT id FROM organizations WHERE code='SEOWON'");
  assert.equal(organization.rowCount, 1);
  const organizationId = organization.rows[0].id;

  const firstEventId = `integration-${marker}-apply`;
  const firstEvent = event(firstEventId);
  const recorded = await recordHrInboxEvent(pool, { organizationId, event: firstEvent });
  ids.push(recorded.event.id);
  assert.equal(recorded.status, 'recorded');
  assert.equal((await recordHrInboxEvent(pool, { organizationId, event: firstEvent })).status, 'duplicate');
  await assert.rejects(recordHrInboxEvent(pool, { organizationId, event: { ...firstEvent, employee: { ...firstEvent.employee, departmentCode: 'OTHER' } } }), /HR_EVENT_ID_CONFLICT/);

  let claimed = await claimNextHrInboxEvent(pool, `test-${marker}`, { organizationId, providerId });
  assert.equal(claimed.id, recorded.event.id);
  assert.equal((await completeHrInboxEvent(pool, { id: claimed.id, workerId: `test-${marker}`, outcome: 'RETRY', error: { code: 'HR_MAPPING_NOT_FOUND' } })).status, 'RETRY_PENDING');
  await pool.query('UPDATE hr_integration_inbox SET next_attempt_at=now() WHERE id=$1', [claimed.id]);
  claimed = await claimNextHrInboxEvent(pool, `test-${marker}`, { organizationId, providerId });
  assert.equal((await completeHrInboxEvent(pool, { id: claimed.id, workerId: `test-${marker}`, outcome: 'APPLIED' })).status, 'APPLIED');

  const rejectedEventId = `integration-${marker}-reject`;
  const rejected = await recordHrInboxEvent(pool, { organizationId, event: event(rejectedEventId, 'employee.terminated') });
  ids.push(rejected.event.id);
  claimed = await claimNextHrInboxEvent(pool, `test-${marker}`, { organizationId, providerId });
  assert.equal(claimed.id, rejected.event.id);
  assert.equal((await completeHrInboxEvent(pool, { id: claimed.id, workerId: `test-${marker}`, outcome: 'REJECTED', error: { code: 'HR_POLICY_REJECTED' } })).status, 'REJECTED');

  const statuses = await pool.query('SELECT status,attempt_count FROM hr_integration_inbox WHERE id=ANY($1::bigint[]) ORDER BY id', [ids]);
  assert.deepEqual(statuses.rows.map(row => row.status), ['APPLIED', 'REJECTED']);
  assert.deepEqual(statuses.rows.map(row => Number(row.attempt_count)), [2, 1]);
  const audits = await pool.query("SELECT action,count(*)::int count FROM audit_logs WHERE entity_type='HR_INTEGRATION_EVENT' AND entity_id=ANY($1::text[]) GROUP BY action", [ids.map(String)]);
  const actions = new Set(audits.rows.map(row => row.action));
  for (const action of ['HR_EVENT_RECEIVED', 'HR_EVENT_DUPLICATE', 'HR_EVENT_CONFLICT', 'HR_EVENT_RETRY_SCHEDULED', 'HR_EVENT_APPLIED', 'HR_EVENT_REJECTED']) assert.equal(actions.has(action), true);
  console.log(JSON.stringify({ status: 'PASS', syntheticEvents: 2, finalStates: ['APPLIED', 'REJECTED'], auditActions: actions.size, cleanup: true }));
} finally {
  if (ids.length) {
    await pool.query("DELETE FROM audit_logs WHERE entity_type='HR_INTEGRATION_EVENT' AND entity_id=ANY($1::text[])", [ids.map(String)]);
    await pool.query('DELETE FROM hr_integration_inbox WHERE id=ANY($1::bigint[])', [ids]);
  }
  await pool.end();
}
