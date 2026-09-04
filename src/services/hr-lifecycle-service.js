const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

class HrLifecycleError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'HrLifecycleError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) { throw new HrLifecycleError(code, status); }

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

async function audit(client, organizationId, action, entityType, entityId, metadata = {}) {
  await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
    VALUES($1,NULL,$2,$3,$4,$5::jsonb)`,
  [organizationId, action, entityType, String(entityId), JSON.stringify(metadata)]);
}

async function rejectWithException(client, event, reasonCode, safeDetails = {}) {
  await client.query(`INSERT INTO hr_lifecycle_exceptions(organization_id,inbox_event_id,reason_code,safe_details)
    VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(inbox_event_id,reason_code) DO UPDATE SET safe_details=EXCLUDED.safe_details`,
  [event.organization_id, event.id, reasonCode, JSON.stringify(safeDetails)]);
  await client.query(`UPDATE hr_integration_inbox SET status='REJECTED',last_error_code=$1,processed_at=now(),
    locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$2`, [reasonCode, event.id]);
  await audit(client, event.organization_id, 'HR_LIFECYCLE_EXCEPTION_OPENED', 'HR_LIFECYCLE_EXCEPTION', event.id,
    { reasonCode, eventType: event.event_type });
  return { status: 'REJECTED', exception: reasonCode };
}

async function applyClaimedHrLifecycleEvent(pool, { id, workerId }) {
  const eventId = positiveInteger(id, 'HR_INBOX_ID_INVALID');
  const worker = safeIdentifier(workerId, 'HR_WORKER_ID_INVALID', 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,organization_id,provider_id,employee_external_id,event_type,
        normalized_payload,status,locked_by
      FROM hr_integration_inbox WHERE id=$1 AND status='PROCESSING' AND locked_by=$2 FOR UPDATE`, [eventId, worker]);
    if (!found.rowCount) fail('HR_EVENT_LOCK_NOT_OWNED', 409);
    const event = found.rows[0];
    const employee = event.normalized_payload?.employee || {};

    const organizationCode = String(employee.organizationCode || '').trim();
    if (!organizationCode) {
      const result = await rejectWithException(client, event, 'HR_ORGANIZATION_CODE_MISSING');
      await client.query('COMMIT');
      return result;
    }
    const organizationMapping = await client.query(`SELECT id FROM hr_organization_mappings
      WHERE organization_id=$1 AND provider_id=$2 AND external_organization_code=$3 AND is_active=true`,
    [event.organization_id, event.provider_id, organizationCode]);
    if (!organizationMapping.rowCount) {
      const result = await rejectWithException(client, event, 'HR_ORGANIZATION_MAPPING_MISSING', { organizationCode });
      await client.query('COMMIT');
      return result;
    }

    const link = await client.query(`SELECT user_id FROM hr_employee_links
      WHERE organization_id=$1 AND provider_id=$2 AND employee_external_id=$3`,
    [event.organization_id, event.provider_id, event.employee_external_id]);
    if (!link.rowCount) {
      const result = await rejectWithException(client, event, 'HR_EMPLOYEE_LINK_MISSING');
      await client.query('COMMIT');
      return result;
    }
    const user = await client.query(`SELECT id,organization_id,email,status,department_id FROM users
      WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [link.rows[0].user_id, event.organization_id]);
    if (!user.rowCount) {
      const result = await rejectWithException(client, event, 'HR_LINKED_USER_INVALID');
      await client.query('COMMIT');
      return result;
    }
    const currentUser = user.rows[0];
    if (employee.email && String(employee.email).toLowerCase() !== String(currentUser.email).toLowerCase()) {
      const result = await rejectWithException(client, event, 'HR_EMAIL_IDENTITY_CHANGE_REQUIRES_REVIEW');
      await client.query('COMMIT');
      return result;
    }

    if (event.event_type === 'employee.terminated') {
      const assigned = await client.query(`SELECT count(*)::int count FROM asset_assignments
        WHERE user_id=$1 AND status='ACTIVE' AND ended_at IS NULL`, [currentUser.id]);
      const assignedCount = Number(assigned.rows[0]?.count || 0);
      if (assignedCount > 0) {
        const result = await rejectWithException(client, event, 'HR_TERMINATION_ASSETS_ASSIGNED', { assignedAssetCount: assignedCount });
        await client.query('COMMIT');
        return result;
      }
      await client.query("UPDATE users SET status='INACTIVE',updated_at=now() WHERE id=$1", [currentUser.id]);
      await audit(client, event.organization_id, 'HR_EMPLOYEE_DEACTIVATED', 'USER', currentUser.id, { inboxEventId: event.id });
      await client.query(`UPDATE hr_integration_inbox SET status='APPLIED',last_error_code=NULL,processed_at=now(),
        locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1`, [event.id]);
      await audit(client, event.organization_id, 'HR_EVENT_APPLIED', 'HR_INTEGRATION_EVENT', event.id, { action: 'TERMINATED' });
      await client.query('COMMIT');
      return { status: 'APPLIED', action: 'TERMINATED', userId: Number(currentUser.id) };
    }

    const departmentCode = String(employee.departmentCode || '').trim();
    if (!departmentCode) {
      const result = await rejectWithException(client, event, 'HR_DEPARTMENT_CODE_MISSING');
      await client.query('COMMIT');
      return result;
    }
    const departmentMapping = await client.query(`SELECT department_id FROM hr_department_mappings
      WHERE organization_id=$1 AND provider_id=$2 AND external_department_code=$3 AND is_active=true`,
    [event.organization_id, event.provider_id, departmentCode]);
    if (!departmentMapping.rowCount) {
      const result = await rejectWithException(client, event, 'HR_DEPARTMENT_MAPPING_MISSING', { departmentCode });
      await client.query('COMMIT');
      return result;
    }
    const department = await client.query(`SELECT id,organization_id,status FROM departments
      WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'`, [departmentMapping.rows[0].department_id, event.organization_id]);
    if (!department.rowCount) {
      const result = await rejectWithException(client, event, 'HR_MAPPED_DEPARTMENT_INVALID', { departmentCode });
      await client.query('COMMIT');
      return result;
    }

    const displayName = event.event_type === 'employee.upserted' ? String(employee.displayName || '').trim() : null;
    await client.query(`UPDATE users SET department_id=$1,
      display_name=CASE WHEN $2::text IS NULL OR $2::text='' THEN display_name ELSE $2::text END,
      updated_at=now() WHERE id=$3`, [department.rows[0].id, displayName, currentUser.id]);
    const action = event.event_type === 'employee.transferred' ? 'TRANSFERRED' : 'UPSERTED';
    await audit(client, event.organization_id, `HR_EMPLOYEE_${action}`, 'USER', currentUser.id,
      { inboxEventId: event.id, departmentId: Number(department.rows[0].id) });
    await client.query(`UPDATE hr_integration_inbox SET status='APPLIED',last_error_code=NULL,processed_at=now(),
      locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1`, [event.id]);
    await audit(client, event.organization_id, 'HR_EVENT_APPLIED', 'HR_INTEGRATION_EVENT', event.id, { action });
    await client.query('COMMIT');
    return { status: 'APPLIED', action, userId: Number(currentUser.id), departmentId: Number(department.rows[0].id) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { HrLifecycleError, applyClaimedHrLifecycleEvent };
