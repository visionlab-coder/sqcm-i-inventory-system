const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const { requireDepartmentAccess } = require('./scope-service');

function repairCost(input) {
  if (input === undefined) return undefined;
  if (input === null || typeof input === 'boolean' || !/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(String(input).trim())) {
    throw new DomainError('수리 비용은 0 이상, 소수 둘째 자리까지 입력하세요.');
  }
  return Number(input);
}

async function updateRepairStatus(pool, user, repairId, input, trace = {}) {
  requirePermission(user, 'repair.manage');
  const id = positiveInteger(repairId, '수리번호');
  const organizationId = requireOrganization(user, input.organizationId || user.organizationId);
  const status = String(input.status || '').toUpperCase();
  if (!['OPEN','IN_PROGRESS','WAITING','RESOLVED','CLOSED','CANCELLED'].includes(status)) throw new DomainError('올바른 수리 상태가 아닙니다.');
  const cost = repairCost(input.cost);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT s.*,a.department_id FROM service_tickets s JOIN assets a ON a.id=s.asset_id AND a.organization_id=s.organization_id WHERE s.id=$1 AND s.organization_id=$2 FOR UPDATE OF s,a`,[id,organizationId]);
    if (!found.rowCount) throw new DomainError('수리 건을 찾을 수 없습니다.',404);
    const before = found.rows[0];
    await requireDepartmentAccess(client,user,before.department_id);
    const effectiveCost = cost === undefined ? before.cost : cost;
    const resolution = input.resolution === undefined ? before.resolution : String(input.resolution || '').slice(0,1000) || null;
    const result = await client.query('UPDATE service_tickets SET status=$1,resolution=$2,cost=$3,updated_at=now() WHERE id=$4 RETURNING *',[status,resolution,effectiveCost,id]);
    // Historical ticket costs may be estimates; status-only edits must not promote them.
    if (cost !== undefined) {
      await client.query(`INSERT INTO asset_cost_events(organization_id,asset_id,event_type,amount,source_type,source_id,note,created_by)
        VALUES($1,$2,'REPAIR',$3,'SERVICE_TICKET',$4,'수리 건 기록 비용',$5)
        ON CONFLICT(organization_id,source_type,source_id,event_type) DO UPDATE SET amount=EXCLUDED.amount`,[organizationId,before.asset_id,effectiveCost,String(id),user.id]);
    }
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'REPAIR_STATUS_CHANGED','REPAIR',$2,$3::jsonb,$4,$5)`,[user.id,String(id),JSON.stringify({before:{status:before.status,cost:before.cost},after:{status,cost:effectiveCost},costSource:'SERVICE_TICKET'}),trace.requestId || null,trace.ip || null]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { repairCost, updateRepairStatus };
