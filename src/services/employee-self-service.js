const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization, createRequest } = require('./enterprise-service');

const EMPLOYEE_REQUEST_TYPES = new Set(['RETURN', 'REPAIR', 'LOST']);

async function getEmployeeSelfService(pool, user) {
  requirePermission(user, 'asset.read');
  const organizationId = requireOrganization(user, user.organizationId);
  const values = [organizationId, user.id];
  const [assets, requests, repairs, notifications] = await Promise.all([
    pool.query(`SELECT a.id,a.asset_tag,a.name,a.serial_no,a.status_code,a.updated_at,
        aa.started_at,d.name department_name,l.name location_name
      FROM asset_assignments aa
      JOIN assets a ON a.id=aa.asset_id
      LEFT JOIN departments d ON d.id=a.department_id
      LEFT JOIN locations l ON l.id=a.location_id
      WHERE a.organization_id=$1 AND aa.user_id=$2
        AND aa.status='ACTIVE' AND aa.ended_at IS NULL
      ORDER BY aa.started_at DESC,a.asset_tag`, values),
    pool.query(`SELECT r.id,r.request_type,r.asset_id,r.status,r.title,r.reason,r.created_at,r.updated_at,
        a.asset_tag,a.name asset_name
      FROM workflow_requests r
      LEFT JOIN assets a ON a.id=r.asset_id
      WHERE r.organization_id=$1 AND r.requester_id=$2
      ORDER BY r.created_at DESC LIMIT 50`, values),
    pool.query(`SELECT s.id,s.asset_id,s.priority,s.status,s.symptom,s.resolution,s.created_at,s.updated_at,
        a.asset_tag,a.name asset_name
      FROM service_tickets s JOIN assets a ON a.id=s.asset_id
      WHERE s.organization_id=$1 AND s.reporter_id=$2
      ORDER BY s.created_at DESC LIMIT 50`, values),
    pool.query(`SELECT id,severity,title,body,entity_type,entity_id,read_at,created_at
      FROM notifications
      WHERE organization_id=$1 AND recipient_user_id=$2
      ORDER BY created_at DESC LIMIT 20`, values)
  ]);
  return {
    assets: assets.rows,
    requests: requests.rows,
    repairs: repairs.rows,
    notifications: notifications.rows,
    summary: {
      assignedAssets: assets.rowCount,
      activeRequests: requests.rows.filter(row => !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.status)).length,
      openRepairs: repairs.rows.filter(row => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(row.status)).length,
      unreadNotifications: notifications.rows.filter(row => !row.read_at).length
    }
  };
}

async function createEmployeeAssetRequest(pool, user, input, trace = {}) {
  requirePermission(user, 'request.create');
  const organizationId = requireOrganization(user, user.organizationId);
  const assetId = positiveInteger(input.assetId, '자산번호');
  const requestType = String(input.requestType || '').trim().toUpperCase();
  if (!EMPLOYEE_REQUEST_TYPES.has(requestType)) throw new DomainError('직원 셀프서비스에서 지원하지 않는 요청 유형입니다.', 400);
  const assigned = await pool.query(`SELECT a.id,a.asset_tag,a.name
    FROM asset_assignments aa JOIN assets a ON a.id=aa.asset_id
    WHERE a.id=$1 AND a.organization_id=$2 AND aa.user_id=$3
      AND aa.status='ACTIVE' AND aa.ended_at IS NULL`, [assetId, organizationId, user.id]);
  if (!assigned.rowCount) throw new DomainError('현재 내게 배정된 자산만 요청할 수 있습니다.', 403);
  const asset = assigned.rows[0];
  const reason = String(input.reason || '').trim();
  const titles = { RETURN: '내 자산 반납 요청', REPAIR: '내 자산 수리 요청', LOST: '내 자산 분실 신고' };
  return createRequest(pool, user, {
    organizationId,
    requestType,
    assetId,
    title: `${titles[requestType]}: ${asset.asset_tag}`,
    reason,
    payload: requestType === 'RETURN' ? input.payload : {}
  }, trace);
}

module.exports = { EMPLOYEE_REQUEST_TYPES, getEmployeeSelfService, createEmployeeAssetRequest };
