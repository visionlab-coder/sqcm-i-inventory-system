const { DomainError, positiveInteger } = require('./inventory-service');

const ROLE_PERMISSIONS = {
  USER: new Set(['asset.read', 'request.create', 'request.read.self', 'repair.create']),
  MANAGER: new Set(['asset.read', 'asset.create', 'asset.update', 'asset.assign', 'request.create', 'request.review', 'request.read.all', 'repair.create', 'repair.manage', 'stocktake.manage', 'report.read']),
  ADMIN: new Set(['*'])
};

const STATUS_TRANSITIONS = {
  DRAFT: ['RECEIVED', 'AVAILABLE', 'CANCELLED'], RECEIVED: ['INSPECTION_PENDING'],
  INSPECTION_PENDING: ['AVAILABLE', 'REPAIR'], AVAILABLE: ['ASSIGNED', 'REPAIR', 'LOST', 'DISPOSE_PENDING'],
  ASSIGNED: ['IN_USE', 'RETURNED', 'REPAIR', 'LOST', 'TRANSFER_PENDING'], IN_USE: ['RETURNED', 'REPAIR', 'LOST', 'TRANSFER_PENDING'],
  TRANSFER_PENDING: ['IN_USE', 'AVAILABLE', 'CANCELLED'], RETURNED: ['AVAILABLE', 'REPAIR', 'DISPOSE_PENDING'],
  REPAIR: ['AVAILABLE', 'IN_USE', 'DISPOSE_PENDING'], LOST: ['FOUND', 'DISPOSE_PENDING'], FOUND: ['AVAILABLE'],
  DISPOSE_PENDING: ['DISPOSED', 'AVAILABLE'], DISPOSED: [], CANCELLED: []
};

function can(user, permission) {
  const permissions = ROLE_PERMISSIONS[user?.role] || new Set();
  return permissions.has('*') || permissions.has(permission);
}

function requirePermission(user, permission) {
  if (!user) throw new DomainError('로그인이 필요합니다.', 401);
  if (!can(user, permission)) throw new DomainError('이 작업을 수행할 권한이 없습니다.', 403);
}

function requireOrganization(user, organizationId) {
  const requested = Number(organizationId);
  if (!Number.isInteger(requested) || requested <= 0) throw new DomainError('올바른 조직이 필요합니다.');
  if (user.role !== 'ADMIN' && Number(user.organizationId) !== requested) throw new DomainError('다른 조직의 데이터에 접근할 수 없습니다.', 403);
  return requested;
}

function assertTransition(from, to) {
  if (!(STATUS_TRANSITIONS[from] || []).includes(to)) throw new DomainError(`${from}에서 ${to}(으)로 변경할 수 없습니다.`, 409);
}

async function enterpriseAudit(client, user, action, type, id, metadata, trace) {
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [user.id, action, type, String(id), JSON.stringify(metadata || {}), trace?.requestId || null, trace?.ip || null]);
}

async function outbox(client, type, id, eventType, payload, idempotencyKey) {
  await client.query(`INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
    VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(idempotency_key) DO NOTHING`,
  [type, String(id), eventType, JSON.stringify(payload || {}), idempotencyKey || null]);
}

async function createAsset(pool, user, input, trace = {}) {
  requirePermission(user, 'asset.create');
  const organizationId = requireOrganization(user, input.organizationId || user.organizationId);
  const tag = String(input.assetTag || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  if (!/^[A-Z0-9-]{3,50}$/.test(tag)) throw new DomainError('자산번호는 영문 대문자·숫자·하이픈 3~50자로 입력하세요.');
  if (name.length < 2 || name.length > 150) throw new DomainError('자산명은 2~150자로 입력하세요.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`INSERT INTO assets(organization_id,asset_tag,serial_no,name,category_id,model_id,status_code,location_id,department_id,acquired_at,acquisition_cost,attributes,created_by)
      VALUES($1,$2,NULLIF($3,''),$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) RETURNING *`,
    [organizationId, tag, String(input.serialNo || '').trim(), name, input.categoryId || null, input.modelId || null,
      input.statusCode || 'AVAILABLE', input.locationId || null, input.departmentId || null, input.acquiredAt || null,
      input.acquisitionCost === '' || input.acquisitionCost == null ? null : Number(input.acquisitionCost), JSON.stringify(input.attributes || {}), user.id]);
    const asset = result.rows[0];
    await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,changed_by,request_id)
      VALUES($1,NULL,$2,$3,$4,$5)`, [asset.id, asset.status_code, '자산 등록', user.id, trace.requestId || null]);
    await enterpriseAudit(client, user, 'ASSET_CREATED', 'ASSET', asset.id, { assetTag: tag, after: asset }, trace);
    await outbox(client, 'ASSET', asset.id, 'ASSET_CREATED', { assetTag: tag }, trace.idempotencyKey);
    await client.query('COMMIT');
    return asset;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('중복된 자산번호 또는 제조번호입니다.', 409);
    throw error;
  } finally { client.release(); }
}

async function changeAssetStatus(pool, user, assetId, input, trace = {}) {
  requirePermission(user, 'asset.update');
  const id = positiveInteger(assetId, '자산번호');
  const toStatus = String(input.toStatus || '').toUpperCase();
  const reason = String(input.reason || '').trim();
  if (reason.length < 2) throw new DomainError('상태 변경 사유가 필요합니다.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [id]);
    if (!current.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    const asset = current.rows[0];
    requireOrganization(user, asset.organization_id);
    assertTransition(asset.status_code, toStatus);
    if (toStatus === 'DISPOSED' && (!input.approverId || !input.evidenceReference)) throw new DomainError('폐기 완료에는 승인자와 증빙이 필요합니다.', 409);
    const updated = await client.query('UPDATE assets SET status_code=$1,updated_at=now(),deactivated_at=CASE WHEN $1 IN (\'DISPOSED\',\'CANCELLED\') THEN now() ELSE deactivated_at END WHERE id=$2 RETURNING *', [toStatus, id]);
    await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,changed_by,request_id) VALUES($1,$2,$3,$4,$5,$6)`, [id, asset.status_code, toStatus, reason, user.id, trace.requestId || null]);
    await enterpriseAudit(client, user, 'ASSET_STATUS_CHANGED', 'ASSET', id, { before: asset.status_code, after: toStatus, reason }, trace);
    await outbox(client, 'ASSET', id, 'ASSET_STATUS_CHANGED', { from: asset.status_code, to: toStatus }, trace.idempotencyKey);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function createRequest(pool, user, input, trace = {}) {
  requirePermission(user, 'request.create');
  const organizationId = requireOrganization(user, input.organizationId || user.organizationId);
  const type = String(input.requestType || '').toUpperCase();
  if (!['ASSIGN','RETURN','TRANSFER','REPAIR','LOST','PURCHASE','DISPOSAL'].includes(type)) throw new DomainError('올바른 요청 유형이 아닙니다.');
  const title = String(input.title || '').trim(); const reason = String(input.reason || '').trim();
  if (title.length < 2 || reason.length < 2) throw new DomainError('제목과 사유가 필요합니다.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.assetId) {
      const asset = await client.query('SELECT organization_id FROM assets WHERE id=$1', [input.assetId]);
      if (!asset.rowCount) throw new DomainError('요청 자산을 찾을 수 없습니다.', 404);
      requireOrganization(user, asset.rows[0].organization_id);
    }
    const result = await client.query(`INSERT INTO workflow_requests(organization_id,request_type,requester_id,asset_id,status,title,reason,payload)
      VALUES($1,$2,$3,$4,'DRAFT',$5,$6,$7::jsonb) RETURNING *`, [organizationId, type, user.id, input.assetId || null, title, reason, JSON.stringify(input.payload || {})]);
    await enterpriseAudit(client, user, 'REQUEST_CREATED', 'REQUEST', result.rows[0].id, { type, title }, trace);
    await client.query('COMMIT'); return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function applyApprovedRequest(client, request, reviewer, trace) {
  const payload = request.payload || {};
  if (request.request_type === 'PURCHASE') return;
  if (!request.asset_id) throw new DomainError('이 요청을 승인하려면 대상 자산이 필요합니다.', 409);

  const found = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [request.asset_id]);
  if (!found.rowCount) throw new DomainError('요청 자산을 찾을 수 없습니다.', 404);
  const asset = found.rows[0];
  requireOrganization(reviewer, asset.organization_id);
  let toStatus = asset.status_code;

  if (request.request_type === 'ASSIGN') {
    assertTransition(asset.status_code, 'ASSIGNED');
    const assigneeId = Number(payload.assigneeUserId || request.requester_id);
    const assignee = await client.query("SELECT id,organization_id FROM users WHERE id=$1 AND status='ACTIVE'", [assigneeId]);
    if (!assignee.rowCount || Number(assignee.rows[0].organization_id) !== Number(request.organization_id)) {
      throw new DomainError('같은 조직의 활성 사용자에게만 배정할 수 있습니다.', 409);
    }
    await client.query(`INSERT INTO asset_assignments(asset_id,user_id,department_id,location_id,assigned_by,started_at,note)
      VALUES($1,$2,$3,$4,$5,now(),$6)`, [asset.id, assigneeId, payload.departmentId || asset.department_id, payload.locationId || asset.location_id, reviewer.id, request.reason]);
    toStatus = 'ASSIGNED';
  } else if (request.request_type === 'RETURN') {
    if (!['ASSIGNED', 'IN_USE'].includes(asset.status_code)) throw new DomainError('배정 중인 자산만 반납할 수 있습니다.', 409);
    const closed = await client.query(`UPDATE asset_assignments SET ended_at=now(),status='ENDED',return_condition=$1
      WHERE id=(SELECT id FROM asset_assignments WHERE asset_id=$2 AND ended_at IS NULL AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1) RETURNING id`,
    [String(payload.returnCondition || '반납 완료'), asset.id]);
    if (!closed.rowCount) throw new DomainError('활성 배정 이력이 없어 반납할 수 없습니다.', 409);
    toStatus = 'RETURNED';
  } else if (request.request_type === 'TRANSFER') {
    if (!['ASSIGNED', 'IN_USE'].includes(asset.status_code)) throw new DomainError('배정 중인 자산만 이동할 수 있습니다.', 409);
    if (!payload.departmentId && !payload.locationId) throw new DomainError('이동할 부서 또는 위치가 필요합니다.', 409);
    const active = await client.query("SELECT * FROM asset_assignments WHERE asset_id=$1 AND ended_at IS NULL AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1 FOR UPDATE", [asset.id]);
    if (!active.rowCount) throw new DomainError('활성 배정 이력이 없어 이동할 수 없습니다.', 409);
    await client.query("UPDATE asset_assignments SET ended_at=now(),status='ENDED',note=concat_ws(' / ',note,$1) WHERE id=$2", [`요청 #${request.id} 이동`, active.rows[0].id]);
    await client.query(`INSERT INTO asset_assignments(asset_id,user_id,department_id,location_id,started_at,status,assigned_by,accessories,note)
      VALUES($1,$2,COALESCE($3,$4),COALESCE($5,$6),now(),'ACTIVE',$7,$8,$9)`, [asset.id, active.rows[0].user_id, payload.departmentId || null, active.rows[0].department_id, payload.locationId || null, active.rows[0].location_id, reviewer.id, JSON.stringify(active.rows[0].accessories || []), request.reason]);
    toStatus = 'IN_USE';
  } else if (request.request_type === 'REPAIR') {
    if (!['AVAILABLE', 'ASSIGNED', 'IN_USE', 'RETURNED'].includes(asset.status_code)) throw new DomainError('현재 상태에서는 수리를 시작할 수 없습니다.', 409);
    await client.query(`INSERT INTO service_tickets(organization_id,asset_id,reporter_id,status,symptom,vendor_id,cost)
      VALUES($1,$2,$3,'OPEN',$4,$5,$6)`, [request.organization_id, asset.id, request.requester_id, request.reason, payload.vendorId || null, payload.estimatedCost || null]);
    toStatus = 'REPAIR';
  } else if (request.request_type === 'LOST') {
    if (!['AVAILABLE', 'ASSIGNED', 'IN_USE'].includes(asset.status_code)) throw new DomainError('현재 상태에서는 분실 처리할 수 없습니다.', 409);
    toStatus = 'LOST';
  } else if (request.request_type === 'DISPOSAL') {
    if (!['AVAILABLE', 'RETURNED', 'REPAIR', 'LOST'].includes(asset.status_code)) throw new DomainError('현재 상태에서는 폐기 승인할 수 없습니다.', 409);
    const evidence = String(payload.evidenceReference || '').trim();
    if (!evidence) throw new DomainError('폐기 승인에는 증빙 참조가 필요합니다.', 409);
    await client.query(`INSERT INTO disposal_requests(organization_id,asset_id,status,reason,evidence_reference,approver_id,decided_at,requester_id)
      VALUES($1,$2,'APPROVED',$3,$4,$5,now(),$6)`, [request.organization_id, asset.id, request.reason, evidence, reviewer.id, request.requester_id]);
    toStatus = 'DISPOSE_PENDING';
  }

  if (toStatus !== asset.status_code) {
    await client.query(`UPDATE assets SET status_code=$1,department_id=COALESCE($2,department_id),location_id=COALESCE($3,location_id),updated_at=now() WHERE id=$4`,
    [toStatus, payload.departmentId || null, payload.locationId || null, asset.id]);
    await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,changed_by,request_id)
      VALUES($1,$2,$3,$4,$5,$6)`, [asset.id, asset.status_code, toStatus, `요청 #${request.id} 승인`, reviewer.id, trace.requestId || null]);
    await outbox(client, 'ASSET', asset.id, 'ASSET_STATUS_CHANGED', { from: asset.status_code, to: toStatus, workflowRequestId: request.id }, `${trace.idempotencyKey || trace.requestId || request.id}:asset`);
  }
}

async function transitionRequest(pool, user, requestId, input, trace = {}) {
  const id = positiveInteger(requestId, '요청번호');
  const action = String(input.action || '').toUpperCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM workflow_requests WHERE id=$1 FOR UPDATE', [id]);
    if (!found.rowCount) throw new DomainError('요청을 찾을 수 없습니다.', 404);
    const request = found.rows[0]; requireOrganization(user, request.organization_id);
    let status;
    if (action === 'SUBMIT') {
      if (request.requester_id !== user.id || request.status !== 'DRAFT') throw new DomainError('제출할 수 없는 요청입니다.', 409);
      status = 'SUBMITTED';
    } else if (action === 'CANCEL') {
      if (request.requester_id !== user.id || !['DRAFT','SUBMITTED'].includes(request.status)) throw new DomainError('취소할 수 없는 요청입니다.', 409);
      status = 'CANCELLED';
    } else {
      requirePermission(user, 'request.review');
      if (request.requester_id === user.id) throw new DomainError('자신이 만든 요청을 승인할 수 없습니다.', 409);
      if (request.status !== 'SUBMITTED') throw new DomainError('검토 대기 요청만 처리할 수 있습니다.', 409);
      if (!['APPROVE','REJECT'].includes(action)) throw new DomainError('올바른 검토 작업이 아닙니다.');
      status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      if (status === 'REJECTED' && String(input.reviewReason || '').trim().length < 2) throw new DomainError('반려 사유가 필요합니다.');
      if (status === 'APPROVED') await applyApprovedRequest(client, request, user, trace);
    }
    const updated = await client.query(`UPDATE workflow_requests SET status=$1::varchar,submitted_at=CASE WHEN $1::varchar='SUBMITTED' THEN now() ELSE submitted_at END,
      reviewer_id=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN $2::bigint ELSE reviewer_id END,review_reason=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN $3::varchar ELSE review_reason END,
      reviewed_at=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN now() ELSE reviewed_at END,updated_at=now() WHERE id=$4 RETURNING *`,
    [status, user.id, String(input.reviewReason || '').trim() || null, id]);
    await enterpriseAudit(client, user, `REQUEST_${status}`, 'REQUEST', id, { before: request.status, after: status }, trace);
    await outbox(client, 'REQUEST', id, `REQUEST_${status}`, { requestType: request.request_type }, trace.idempotencyKey);
    await client.query('COMMIT'); return updated.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { ROLE_PERMISSIONS, STATUS_TRANSITIONS, can, requirePermission, requireOrganization, assertTransition, createAsset, changeAssetStatus, createRequest, transitionRequest };
