const { DomainError, positiveInteger } = require('./inventory-service');
const referenceRepository = require('../repositories/reference-repository');
const { requireDepartmentAccess } = require('./scope-service');
const { initializeApprovalPlan, getCurrentApproval, requireStepRole } = require('./approval-service');

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
  const legacyAdminContext = user.role === 'ADMIN' && typeof user.isSystemAdmin === 'undefined';
  if (!user.isSystemAdmin && !legacyAdminContext && Number(user.organizationId) !== requested) throw new DomainError('다른 조직의 데이터에 접근할 수 없습니다.', 403);
  return requested;
}

function assertTransition(from, to) {
  if (!(STATUS_TRANSITIONS[from] || []).includes(to)) throw new DomainError(`${from}에서 ${to}(으)로 변경할 수 없습니다.`, 409);
}

function purchaseFieldError(field, message) {
  const error = new DomainError(message);
  error.code = 'VALIDATION_ERROR';
  error.fieldErrors = [{ field, message }];
  throw error;
}

function normalizePurchasePayload(input = {}) {
  const itemName = String(input.itemName || '').trim();
  if (itemName.length < 2 || itemName.length > 150) purchaseFieldError('itemName', '품목은 2~150자로 입력하세요.');

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) purchaseFieldError('quantity', '수량은 1~100,000의 정수로 입력하세요.');

  const amountText = String(input.estimatedAmount ?? '').trim().replaceAll(',', '');
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) {
    purchaseFieldError('estimatedAmount', '예상금액은 0보다 크고 소수 둘째 자리까지 입력하세요.');
  }
  const [whole, fraction = ''] = amountText.split('.');
  const estimatedAmount = `${whole}.${fraction.padEnd(2, '0')}`;

  const costCenter = String(input.costCenter || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(costCenter)) purchaseFieldError('costCenter', '비용센터는 영문·숫자·하이픈·밑줄 2~50자로 입력하세요.');

  const neededAt = String(input.neededAt || '').trim();
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(neededAt) ? new Date(`${neededAt}T00:00:00.000Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== neededAt) {
    purchaseFieldError('neededAt', '필요일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  }

  return { itemName, quantity, estimatedAmount, costCenter, neededAt };
}

function normalizePurchaseOrderInput(input = {}) {
  const requestId = positiveInteger(input.requestId, '구매요청');
  const orderNo = String(input.orderNo || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,49}$/.test(orderNo)) throw new DomainError('발주번호는 영문·숫자·하이픈·밑줄 3~50자로 입력하세요.');
  const amountText = String(input.totalAmount ?? '').trim().replaceAll(',', '');
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) throw new DomainError('발주금액은 0보다 크고 소수 둘째 자리까지 입력하세요.');
  return { requestId, orderNo, totalAmount: Number(amountText).toFixed(2) };
}

function normalizeInspectionResult(value) {
  const result = String(value || '').trim().toUpperCase();
  if (!['PASS', 'FAIL', 'CONDITIONAL'].includes(result)) throw new DomainError('올바른 검수 결과가 아닙니다.');
  return result;
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
  if (input.departmentId) await requireDepartmentAccess(pool, user, input.departmentId);
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
  const reasonCode = String(input.reasonCode || '').trim().toUpperCase();
  const reasonDetail = String(input.reasonDetail || '').trim();
  if (!reasonCode) throw new DomainError('상태 변경 사유 코드를 선택하세요.');
  if (reasonDetail.length > 500) throw new DomainError('상태 변경 추가 설명은 500자 이하여야 합니다.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [id]);
    if (!current.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
    const asset = current.rows[0];
    requireOrganization(user, asset.organization_id);
    await requireDepartmentAccess(client, user, asset.department_id);
    assertTransition(asset.status_code, toStatus);
    const statusPolicy = await referenceRepository.findActiveStatusPolicy(client,asset.organization_id,toStatus);
    if(!statusPolicy) throw new DomainError('비활성 또는 등록되지 않은 자산 상태입니다.',409);
    const reasonPolicy = await referenceRepository.findActiveReasonPolicy(client,asset.organization_id,reasonCode);
    if(!reasonPolicy) throw new DomainError('비활성 또는 등록되지 않은 상태 변경 사유입니다.',409);
    if(reasonPolicy.applies_to_status&&reasonPolicy.applies_to_status!==toStatus) throw new DomainError('선택한 상태에 적용할 수 없는 변경 사유입니다.',409);
    if(reasonPolicy.requires_detail&&reasonDetail.length<2) throw new DomainError('이 변경 사유에는 2자 이상의 추가 설명이 필요합니다.');
    const reason = reasonDetail ? `${reasonPolicy.name}: ${reasonDetail}` : reasonPolicy.name;
    if (toStatus === 'DISPOSED' && (!input.approverId || !input.evidenceReference)) throw new DomainError('폐기 완료에는 승인자와 증빙이 필요합니다.', 409);
    const updated = await client.query('UPDATE assets SET status_code=$1::varchar,updated_at=now(),deactivated_at=CASE WHEN $1::varchar IN (\'DISPOSED\',\'CANCELLED\') THEN now() ELSE deactivated_at END WHERE id=$2 RETURNING *', [toStatus, id]);
    await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,reason_definition_id,reason_detail,changed_by,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, asset.status_code, toStatus, reason, reasonPolicy.id,reasonDetail||null,user.id, trace.requestId || null]);
    await enterpriseAudit(client, user, 'ASSET_STATUS_CHANGED', 'ASSET', id, { before: asset.status_code, after: toStatus, reasonCode,reasonDetail:reasonDetail||null }, trace);
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
      const asset = await client.query('SELECT organization_id,department_id FROM assets WHERE id=$1', [input.assetId]);
      if (!asset.rowCount) throw new DomainError('요청 자산을 찾을 수 없습니다.', 404);
      requireOrganization(user, asset.rows[0].organization_id);
      await requireDepartmentAccess(client, user, asset.rows[0].department_id);
    }
    let payload;
    if (type === 'PURCHASE') payload = normalizePurchasePayload(input.payload);
    else if (type === 'RETURN') {
      payload = require('./return-service').normalizeReturnPayload(input.payload);
      const active = await client.query("SELECT user_id FROM asset_assignments WHERE asset_id=$1 AND ended_at IS NULL AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1", [input.assetId]);
      if (!active.rowCount || Number(active.rows[0].user_id) !== Number(user.id)) throw new DomainError('현재 자산을 배정받은 사용자만 반납 요청을 만들 수 있습니다.',409);
    } else payload = input.payload || {};
    const result = await client.query(`INSERT INTO workflow_requests(organization_id,request_type,requester_id,asset_id,status,title,reason,payload)
      VALUES($1,$2,$3,$4,'DRAFT',$5,$6,$7::jsonb) RETURNING *`, [organizationId, type, user.id, input.assetId || null, title, reason, JSON.stringify(payload)]);
    await enterpriseAudit(client, user, 'REQUEST_CREATED', 'REQUEST', result.rows[0].id, { type, title, ...(type === 'PURCHASE' ? { purchase: payload } : {}) }, trace);
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
  await requireDepartmentAccess(client, reviewer, asset.department_id);
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
    const evidence = await client.query(`SELECT f.id FROM workflow_request_files rf JOIN file_records f ON f.id=rf.file_id
      WHERE rf.request_id=$1 AND rf.purpose='RETURN_PHOTO' AND f.status='ACTIVE' AND f.organization_id=$2 ORDER BY rf.created_at DESC LIMIT 1 FOR SHARE OF f`, [request.id,request.organization_id]);
    if (!evidence.rowCount) throw new DomainError('활성 반납 사진이 필요합니다.',409);
    const details = require('./return-service').normalizeReturnPayload(payload);
    const closed = await client.query(`UPDATE asset_assignments SET ended_at=now(),status='ENDED',return_condition=$1,returned_by=$2,return_checked_by=$3,return_note=$4,accessories=$5::jsonb
      WHERE id=(SELECT id FROM asset_assignments WHERE asset_id=$6 AND ended_at IS NULL AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1) RETURNING id`,
    [details.conditionCode,request.requester_id,reviewer.id,details.note,JSON.stringify(details.accessories),asset.id]);
    if (!closed.rowCount) throw new DomainError('활성 배정 이력이 없어 반납할 수 없습니다.', 409);
    await client.query(`INSERT INTO asset_return_records(request_id,assignment_id,asset_id,returned_by,checked_by,condition_code,note,accessories,photo_file_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [request.id,closed.rows[0].id,asset.id,request.requester_id,reviewer.id,details.conditionCode,details.note,JSON.stringify(details.accessories),evidence.rows[0].id]);
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
    let status; let auditAction; let auditMetadata = { before: request.status };
    if (action === 'SUBMIT') {
      if (request.requester_id !== user.id || request.status !== 'DRAFT') throw new DomainError('제출할 수 없는 요청입니다.', 409);
      if (request.request_type === 'RETURN') {
        require('./return-service').normalizeReturnPayload(request.payload);
        const evidence = await client.query(`SELECT 1 FROM workflow_request_files rf JOIN file_records f ON f.id=rf.file_id WHERE rf.request_id=$1 AND rf.purpose='RETURN_PHOTO' AND f.status='ACTIVE' LIMIT 1`, [id]);
        if (!evidence.rowCount) throw new DomainError('반납 요청을 제출하려면 JPEG 또는 PNG 사진이 필요합니다.',409);
      }
      const plan = await initializeApprovalPlan(client,request,user.id);
      status = 'SUBMITTED';
      auditAction = 'REQUEST_SUBMITTED';
      auditMetadata = { ...auditMetadata, after:status, policyId:plan.policy.id, stepCount:plan.steps.length };
    } else if (action === 'CANCEL') {
      if (request.requester_id !== user.id || !['DRAFT','SUBMITTED'].includes(request.status)) throw new DomainError('취소할 수 없는 요청입니다.', 409);
      status = 'CANCELLED';
      await client.query("UPDATE workflow_request_approvals SET status='SKIPPED' WHERE request_id=$1 AND status='PENDING'", [id]);
      auditAction = 'REQUEST_CANCELLED'; auditMetadata = { ...auditMetadata, after:status };
    } else {
      requirePermission(user, 'request.review');
      const targetDepartment = request.asset_id
        ? (await client.query('SELECT department_id FROM assets WHERE id=$1', [request.asset_id])).rows[0]?.department_id
        : (await client.query('SELECT department_id FROM users WHERE id=$1', [request.requester_id])).rows[0]?.department_id;
      await requireDepartmentAccess(client, user, targetDepartment);
      if (request.requester_id === user.id) throw new DomainError('자신이 만든 요청을 승인할 수 없습니다.', 409);
      if (request.status !== 'SUBMITTED') throw new DomainError('검토 대기 요청만 처리할 수 있습니다.', 409);
      if (!['APPROVE','REJECT'].includes(action)) throw new DomainError('올바른 검토 작업이 아닙니다.');
      const approval = await getCurrentApproval(client,id);
      if (!approval || Number(approval.step_order) !== Number(request.current_approval_step)) throw new DomainError('현재 처리할 승인 단계가 없습니다.', 409);
      requireStepRole(user,approval);
      const reviewReason = String(input.reviewReason || '').trim();
      if (action === 'REJECT' && reviewReason.length < 2) throw new DomainError('반려 사유가 필요합니다.');
      if (action === 'REJECT') {
        await client.query("UPDATE workflow_request_approvals SET status='REJECTED',acted_by=$1,reason=$2,acted_at=now() WHERE id=$3 AND status='PENDING'", [user.id,reviewReason,approval.id]);
        await client.query("UPDATE workflow_request_approvals SET status='SKIPPED' WHERE request_id=$1 AND step_order>$2 AND status='PENDING'", [id,approval.step_order]);
        status = 'REJECTED'; auditAction = 'REQUEST_REJECTED';
      } else {
        const acted = await client.query("UPDATE workflow_request_approvals SET status='APPROVED',acted_by=$1,reason=$2,acted_at=now() WHERE id=$3 AND status='PENDING' RETURNING id", [user.id,reviewReason||null,approval.id]);
        if (!acted.rowCount) throw new DomainError('이미 처리된 승인 단계입니다.',409);
        const next = await client.query("SELECT step_order FROM workflow_request_approvals WHERE request_id=$1 AND status='PENDING' ORDER BY step_order LIMIT 1", [id]);
        if (next.rowCount) {
          status = 'SUBMITTED'; auditAction = 'REQUEST_STEP_APPROVED';
          await client.query('UPDATE workflow_requests SET current_approval_step=$1,updated_at=now() WHERE id=$2', [next.rows[0].step_order,id]);
        } else {
          status = 'APPROVED'; auditAction = 'REQUEST_APPROVED';
          await applyApprovedRequest(client, request, user, trace);
        }
      }
      auditMetadata = { ...auditMetadata, after:status, stepOrder:Number(approval.step_order), stepCount:Number(request.approval_step_count), stepName:approval.step_name };
    }
    const updated = await client.query(`UPDATE workflow_requests SET status=$1::varchar,submitted_at=CASE WHEN $1::varchar='SUBMITTED' AND submitted_at IS NULL THEN now() ELSE submitted_at END,
      reviewer_id=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN $2::bigint ELSE reviewer_id END,review_reason=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN $3::varchar ELSE review_reason END,
      reviewed_at=CASE WHEN $1::varchar IN ('APPROVED','REJECTED') THEN now() ELSE reviewed_at END,current_approval_step=CASE WHEN $1::varchar IN ('APPROVED','REJECTED','CANCELLED') THEN NULL ELSE current_approval_step END,updated_at=now() WHERE id=$4 RETURNING *`,
    [status, user.id, String(input.reviewReason || '').trim() || null, id]);
    await enterpriseAudit(client, user, auditAction || `REQUEST_${status}`, 'REQUEST', id, auditMetadata, trace);
    const workflowEvent = auditAction || `REQUEST_${status}`;
    await outbox(client, 'REQUEST', id, workflowEvent, { requestType: request.request_type,stepOrder:auditMetadata.stepOrder||null }, `${trace.idempotencyKey || trace.requestId || id}:${workflowEvent}:${auditMetadata.stepOrder || 0}`);
    await client.query('COMMIT'); return updated.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function createPurchaseOrder(pool, user, input, trace = {}) {
  requirePermission(user, 'request.review');
  const organizationId = requireOrganization(user, input.organizationId || user.organizationId);
  const normalized = normalizePurchaseOrderInput(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query("SELECT * FROM workflow_requests WHERE id=$1 FOR UPDATE", [normalized.requestId]);
    if (!requestResult.rowCount) throw new DomainError('구매요청을 찾을 수 없습니다.', 404);
    const request = requestResult.rows[0];
    requireOrganization(user, request.organization_id);
    if (Number(request.organization_id) !== organizationId || request.request_type !== 'PURCHASE' || request.status !== 'APPROVED') {
      throw new DomainError('같은 조직의 승인된 구매요청이 필요합니다.', 409);
    }
    if (input.vendorId) {
      const vendor = await client.query('SELECT id FROM vendors WHERE id=$1 AND organization_id=$2 AND is_active', [positiveInteger(input.vendorId, '공급사'), organizationId]);
      if (!vendor.rowCount) throw new DomainError('같은 조직의 활성 공급사가 필요합니다.', 409);
    }
    const created = await client.query(`INSERT INTO purchase_orders(organization_id,request_id,vendor_id,order_no,total_amount)
      VALUES($1,$2,$3,$4,$5) RETURNING *`, [organizationId, normalized.requestId, input.vendorId || null, normalized.orderNo, normalized.totalAmount]);
    const order = created.rows[0];
    await enterpriseAudit(client, user, 'PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER', order.id, { requestId: request.id, orderNo: order.order_no }, trace);
    await outbox(client, 'PURCHASE_ORDER', order.id, 'PURCHASE_ORDER_CREATED', { requestId: request.id }, trace.idempotencyKey);
    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('이미 발주된 구매요청이거나 중복 발주번호입니다.', 409);
    throw error;
  } finally { client.release(); }
}

async function createReceipt(pool, user, input, trace = {}) {
  requirePermission(user, 'request.review');
  const orderId = positiveInteger(input.purchaseOrderId, '발주번호');
  const quantity = positiveInteger(input.quantity, '입고수량');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT po.*,wr.payload,wr.status request_status
      FROM purchase_orders po JOIN workflow_requests wr ON wr.id=po.request_id WHERE po.id=$1 FOR UPDATE OF po,wr`, [orderId]);
    if (!orderResult.rowCount) throw new DomainError('발주를 찾을 수 없습니다.', 404);
    const order = orderResult.rows[0];
    requireOrganization(user, order.organization_id);
    if (order.status === 'CANCELLED') throw new DomainError('취소된 발주에는 입고할 수 없습니다.', 409);
    const requestedQuantity = Number(order.payload?.quantity);
    const receivedResult = await client.query('SELECT COALESCE(sum(quantity),0)::int received FROM receipts WHERE purchase_order_id=$1', [orderId]);
    const cumulativeQuantity = receivedResult.rows[0].received + quantity;
    if (!Number.isInteger(requestedQuantity) || cumulativeQuantity > requestedQuantity) {
      throw new DomainError(`누적 입고수량은 요청수량 ${requestedQuantity}개를 초과할 수 없습니다.`, 409);
    }
    const created = await client.query(`INSERT INTO receipts(purchase_order_id,quantity,status,received_by)
      VALUES($1,$2,'INSPECTION_PENDING',$3) RETURNING *`, [orderId, quantity, user.id]);
    const orderStatus = cumulativeQuantity === requestedQuantity ? 'RECEIVED' : 'PARTIAL_RECEIVED';
    await client.query('UPDATE purchase_orders SET status=$1 WHERE id=$2', [orderStatus, orderId]);
    const receipt = created.rows[0];
    await enterpriseAudit(client, user, 'RECEIPT_CREATED', 'RECEIPT', receipt.id, { orderId, quantity, cumulativeQuantity, requestedQuantity, orderStatus }, trace);
    await outbox(client, 'RECEIPT', receipt.id, 'RECEIPT_CREATED', { orderId, quantity, orderStatus }, trace.idempotencyKey);
    await client.query('COMMIT');
    return { ...receipt, orderStatus, cumulativeQuantity, requestedQuantity };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function inspectReceipt(pool, user, input, trace = {}) {
  requirePermission(user, 'request.review');
  const receiptId = positiveInteger(input.receiptId, '입고번호');
  const result = normalizeInspectionResult(input.result);
  const note = String(input.note || '').trim().slice(0, 500) || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receiptResult = await client.query(`SELECT r.*,po.organization_id,po.request_id,po.order_no,po.total_amount,
      wr.payload,wr.requester_id,u.department_id requester_department_id
      FROM receipts r JOIN purchase_orders po ON po.id=r.purchase_order_id
      JOIN workflow_requests wr ON wr.id=po.request_id JOIN users u ON u.id=wr.requester_id
      WHERE r.id=$1 FOR UPDATE OF r,po,wr`, [receiptId]);
    if (!receiptResult.rowCount) throw new DomainError('입고를 찾을 수 없습니다.', 404);
    const receipt = receiptResult.rows[0];
    requireOrganization(user, receipt.organization_id);
    if (receipt.status !== 'INSPECTION_PENDING') throw new DomainError('검수 대기 중인 입고만 검수할 수 있습니다.', 409);
    const inspectionResult = await client.query(`INSERT INTO inspections(receipt_id,result,note,inspected_by)
      VALUES($1,$2,$3,$4) RETURNING *`, [receiptId, result, note, user.id]);
    const inspection = inspectionResult.rows[0];
    let assets = [];
    if (result === 'PASS') {
      const requestedQuantity = Number(receipt.payload?.quantity);
      const itemName = String(receipt.payload?.itemName || '').trim();
      if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0 || itemName.length < 2) throw new DomainError('구매요청 자산 정보가 올바르지 않습니다.', 409);
      await client.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,acquired_at,acquisition_cost,attributes,created_by)
        SELECT $1,upper(format('PO-%s-R%s-%s',$2::bigint,$3::bigint,unit_no)),$4,'AVAILABLE',$5,current_date,
          round($6::numeric / $7::numeric,2),jsonb_build_object('purchaseRequestId',$8::bigint,'purchaseOrderId',$2::bigint,'receiptId',$3::bigint,'costCenter',$9::text),$10
        FROM generate_series(1,$11::int) unit_no`, [receipt.organization_id, receipt.purchase_order_id, receipt.id, itemName,
        receipt.requester_department_id, receipt.total_amount, requestedQuantity, receipt.request_id, receipt.payload?.costCenter || null, user.id, receipt.quantity]);
      await client.query(`INSERT INTO inspection_assets(inspection_id,asset_id,unit_no)
        SELECT $1,a.id,gs.unit_no FROM generate_series(1,$2::int) gs(unit_no)
        JOIN assets a ON a.organization_id=$3 AND a.asset_tag=upper(format('PO-%s-R%s-%s',$4::bigint,$5::bigint,gs.unit_no))`,
      [inspection.id, receipt.quantity, receipt.organization_id, receipt.purchase_order_id, receipt.id]);
      await client.query(`INSERT INTO asset_status_histories(asset_id,from_status,to_status,reason,changed_by,request_id)
        SELECT ia.asset_id,NULL,'AVAILABLE',$1,$2,$3 FROM inspection_assets ia WHERE ia.inspection_id=$4`,
      [`검수 #${inspection.id} 합격으로 자동 생성`, user.id, trace.requestId || null, inspection.id]);
      const assetsResult = await client.query(`SELECT a.* FROM inspection_assets ia JOIN assets a ON a.id=ia.asset_id
        WHERE ia.inspection_id=$1 ORDER BY ia.unit_no`, [inspection.id]);
      assets = assetsResult.rows;
      await client.query('UPDATE inspections SET asset_id=$1 WHERE id=$2', [assets[0].id, inspection.id]);
      const eventKeyBase = String(trace.idempotencyKey || trace.requestId || inspection.id).slice(0, 70);
      await client.query(`INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
        SELECT 'ASSET',a.id::text,'ASSET_CREATED_FROM_INSPECTION',jsonb_build_object('inspectionId',$1::bigint,'receiptId',$2::bigint),
          concat($3::text,':asset:',a.id) FROM inspection_assets ia JOIN assets a ON a.id=ia.asset_id
        WHERE ia.inspection_id=$1 ON CONFLICT(idempotency_key) DO NOTHING`, [inspection.id, receiptId, eventKeyBase]);
    }
    const receiptStatus = result === 'PASS' ? 'ACCEPTED' : 'REJECTED';
    await client.query('UPDATE receipts SET status=$1 WHERE id=$2', [receiptStatus, receiptId]);
    await enterpriseAudit(client, user, 'INSPECTION_COMPLETED', 'INSPECTION', inspection.id, { receiptId, result, receiptStatus, createdAssetIds: assets.map(asset => asset.id) }, trace);
    const inspectionEventKey = `${String(trace.idempotencyKey || trace.requestId || inspection.id).slice(0, 70)}:inspection`;
    await outbox(client, 'INSPECTION', inspection.id, 'INSPECTION_COMPLETED', { receiptId, result, createdAssetCount: assets.length }, inspectionEventKey);
    await client.query('COMMIT');
    return { inspection: { ...inspection, asset_id: assets[0]?.id || null }, assets };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('이미 검수되었거나 자산이 생성된 입고입니다.', 409);
    throw error;
  } finally { client.release(); }
}

module.exports = { ROLE_PERMISSIONS, STATUS_TRANSITIONS, can, requirePermission, requireOrganization, assertTransition, normalizePurchasePayload, normalizePurchaseOrderInput, normalizeInspectionResult, createAsset, changeAssetStatus, createRequest, transitionRequest, createPurchaseOrder, createReceipt, inspectReceipt };
