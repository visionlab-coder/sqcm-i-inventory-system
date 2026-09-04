import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPool, initializeDatabase } = require('../src/db');
const { claimNextHrInboxEvent, recordHrInboxEvent } = require('../src/services/hr-integration-inbox-service');
const { applyClaimedHrLifecycleEvent } = require('../src/services/hr-lifecycle-service');

if (!process.env.DATABASE_URL) throw new Error('Local integration DATABASE_URL is required.');
process.env.DB_AUTO_MIGRATE = 'false';
process.env.DB_RUN_SEEDS = 'false';
process.env.DB_MIGRATION_HISTORY_MODE = 'application';

const pool = createPool(process.env.DATABASE_URL);
const marker = crypto.randomUUID();
const short = marker.replaceAll('-', '').slice(0, 12);
const providerId = `lifecycle-${short}`;
const workerId = `worker-${short}`;
const created = { eventIds: [], userIds: [], departmentIds: [], assetIds: [] };
let passed = false;

function event(eventId, type, employeeId, email, departmentCode) {
  const employee = { employeeId, email, displayName: '합성 생애주기 시험', organizationCode: `EXT-ORG-${short}` };
  if (departmentCode) employee.departmentCode = departmentCode;
  return { providerId, eventId, schemaVersion: 1, type, occurredAt: new Date().toISOString(), employee };
}

try {
  await initializeDatabase(pool, { dbAutoMigrate: false, dbRunSeeds: false, dbMigrationHistoryMode: 'application' });
  const organization = await pool.query("SELECT id FROM organizations WHERE code='SEOWON'");
  assert.equal(organization.rowCount, 1);
  const organizationId = organization.rows[0].id;
  const passwordHash = '$2b$12$synthetic.lifecycle.integration.only';

  const admin = await pool.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id)
    VALUES($1,'합성 연동 관리자',$2,'ADMIN','ACTIVE',$3) RETURNING id`, [`lifecycle-admin-${marker}@example.invalid`, passwordHash, organizationId]);
  const employee = await pool.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id)
    VALUES($1,'합성 연동 직원',$2,'USER','ACTIVE',$3) RETURNING id`, [`lifecycle-user-${marker}@example.invalid`, passwordHash, organizationId]);
  created.userIds.push(admin.rows[0].id, employee.rows[0].id);

  for (const suffix of ['A', 'B']) {
    const department = await pool.query(`INSERT INTO departments(organization_id,code,name)
      VALUES($1,$2,$3) RETURNING id`, [organizationId, `LC-${short}-${suffix}`, `합성 생애주기 부서 ${suffix}`]);
    created.departmentIds.push(department.rows[0].id);
  }
  await pool.query(`INSERT INTO hr_organization_mappings(organization_id,provider_id,external_organization_code)
    VALUES($1,$2,$3)`, [organizationId, providerId, `EXT-ORG-${short}`]);
  await pool.query(`INSERT INTO hr_department_mappings(organization_id,provider_id,external_department_code,department_id)
    VALUES($1,$2,$3,$4)`, [organizationId, providerId, `EXT-DEPT-${short}`, created.departmentIds[1]]);
  const externalEmployeeId = `EMP-${short}`;
  await pool.query(`INSERT INTO hr_employee_links(organization_id,provider_id,employee_external_id,user_id)
    VALUES($1,$2,$3,$4)`, [organizationId, providerId, externalEmployeeId, employee.rows[0].id]);

  const transferEventId = `transfer-${marker}`;
  const transfer = await recordHrInboxEvent(pool, { organizationId, event: event(transferEventId, 'employee.transferred', externalEmployeeId, `lifecycle-user-${marker}@example.invalid`, `EXT-DEPT-${short}`) });
  created.eventIds.push(transfer.event.id);
  const transferClaim = await claimNextHrInboxEvent(pool, workerId, { organizationId, providerId });
  const applied = await applyClaimedHrLifecycleEvent(pool, { id: transferClaim.id, workerId });
  assert.deepEqual(applied, { status: 'APPLIED', action: 'TRANSFERRED', userId: Number(employee.rows[0].id), departmentId: Number(created.departmentIds[1]) });
  const moved = await pool.query('SELECT department_id FROM users WHERE id=$1', [employee.rows[0].id]);
  assert.equal(Number(moved.rows[0].department_id), Number(created.departmentIds[1]));

  const asset = await pool.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,created_by)
    VALUES($1,$2,'합성 생애주기 자산','IN_USE',$3,$4) RETURNING id`, [organizationId, `LC-${short}`, created.departmentIds[1], admin.rows[0].id]);
  created.assetIds.push(asset.rows[0].id);
  await pool.query(`INSERT INTO asset_assignments(asset_id,user_id,department_id,status,assigned_by)
    VALUES($1,$2,$3,'ACTIVE',$4)`, [asset.rows[0].id, employee.rows[0].id, created.departmentIds[1], admin.rows[0].id]);

  const terminateEventId = `terminate-${marker}`;
  const termination = await recordHrInboxEvent(pool, { organizationId, event: event(terminateEventId, 'employee.terminated', externalEmployeeId, `lifecycle-user-${marker}@example.invalid`) });
  created.eventIds.push(termination.event.id);
  const terminationClaim = await claimNextHrInboxEvent(pool, workerId, { organizationId, providerId });
  const rejected = await applyClaimedHrLifecycleEvent(pool, { id: terminationClaim.id, workerId });
  assert.deepEqual(rejected, { status: 'REJECTED', exception: 'HR_TERMINATION_ASSETS_ASSIGNED' });
  const preserved = await pool.query(`SELECT u.status,count(aa.id)::int assignment_count
    FROM users u LEFT JOIN asset_assignments aa ON aa.user_id=u.id AND aa.status='ACTIVE' AND aa.ended_at IS NULL
    WHERE u.id=$1 GROUP BY u.status`, [employee.rows[0].id]);
  assert.deepEqual(preserved.rows[0], { status: 'ACTIVE', assignment_count: 1 });
  const exception = await pool.query(`SELECT reason_code,status,safe_details FROM hr_lifecycle_exceptions WHERE inbox_event_id=$1`, [termination.event.id]);
  assert.equal(exception.rowCount, 1);
  assert.equal(exception.rows[0].reason_code, 'HR_TERMINATION_ASSETS_ASSIGNED');
  assert.equal(exception.rows[0].status, 'OPEN');
  assert.equal(Number(exception.rows[0].safe_details.assignedAssetCount), 1);

  passed = true;
} finally {
  if (created.eventIds.length || created.userIds.length) {
    await pool.query(`DELETE FROM audit_logs WHERE
      (entity_type='HR_INTEGRATION_EVENT' AND entity_id=ANY($1::text[])) OR
      (entity_type='HR_LIFECYCLE_EXCEPTION' AND entity_id=ANY($1::text[])) OR
      (entity_type='USER' AND entity_id=ANY($2::text[]) AND action LIKE 'HR_%')`,
    [created.eventIds.map(String), created.userIds.map(String)]);
  }
  if (created.assetIds.length) await pool.query('DELETE FROM asset_assignments WHERE asset_id=ANY($1::bigint[])', [created.assetIds]);
  if (created.assetIds.length) await pool.query('DELETE FROM assets WHERE id=ANY($1::bigint[])', [created.assetIds]);
  if (created.eventIds.length) await pool.query('DELETE FROM hr_integration_inbox WHERE id=ANY($1::bigint[])', [created.eventIds]);
  await pool.query('DELETE FROM hr_employee_links WHERE provider_id=$1', [providerId]);
  await pool.query('DELETE FROM hr_department_mappings WHERE provider_id=$1', [providerId]);
  await pool.query('DELETE FROM hr_organization_mappings WHERE provider_id=$1', [providerId]);
  if (created.userIds.length) await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])', [created.userIds]);
  if (created.departmentIds.length) await pool.query('DELETE FROM departments WHERE id=ANY($1::bigint[])', [created.departmentIds]);
  const remaining = await pool.query(`SELECT
    (SELECT count(*)::int FROM hr_integration_inbox WHERE provider_id=$1) inbox,
    (SELECT count(*)::int FROM hr_employee_links WHERE provider_id=$1) employee_links,
    (SELECT count(*)::int FROM hr_department_mappings WHERE provider_id=$1) department_mappings,
    (SELECT count(*)::int FROM hr_organization_mappings WHERE provider_id=$1) organization_mappings`, [providerId]);
  if (passed) {
    assert.deepEqual(remaining.rows[0], { inbox: 0, employee_links: 0, department_mappings: 0, organization_mappings: 0 });
    console.log(JSON.stringify({ status: 'PASS', syntheticEvents: 2, transferred: true,
      terminationFailClosed: true, openExceptions: 1, cleanupRows: remaining.rows[0] }));
  }
  await pool.end();
}
