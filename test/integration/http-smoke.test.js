const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { createPool } = require('../../src/db');
const { getConfig } = require('../../src/config');

const baseUrl = process.env.INTEGRATION_BASE_URL;
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const integrationConfig = getConfig();

const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];
const sessionIdFromCookie = cookie => {
  const encoded = String(cookie || '').split('=', 2)[1] || '';
  const value = decodeURIComponent(encoded).replace(/^s:/, '');
  return value.split('.')[0] || null;
};

async function login(email, password) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: 'manual' });
  assert.equal(csrfResponse.status, 200);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  const anonymousCookie = cookieFrom(csrfResponse);
  assert.ok(csrfToken && anonymousCookie);

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { cookie: anonymousCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ _csrf: csrfToken, email, password }),
    redirect: 'manual'
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const cookie = cookieFrom(response);
  return { cookie, sessionId: sessionIdFromCookie(cookie), csrfToken: data.csrfToken, user: data.user };
}

async function removeTestSessions(pool, sessions) {
  const ids = sessions.map(session => session?.sessionId).filter(Boolean);
  if (ids.length) await pool.query('DELETE FROM user_sessions WHERE sid = ANY($1::text[])', [ids]);
}

async function api(path, session, { method = 'GET', body, includeCsrf = true } = {}) {
  const headers = { cookie: session.cookie, accept: 'application/json' };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(includeCsrf ? { ...body, _csrf: session.csrfToken } : body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload, redirect: 'manual' });
}

test('3계층 Docker 앱 health와 API 로그인 세션 흐름이 동작한다', { skip: !baseUrl }, async () => {
  const pool = createPool(databaseUrl);
  let manager;
  try {
  const frontendHealth = await fetch(`${baseUrl}/health`);
  assert.equal(frontendHealth.status, 200);
  assert.deepEqual(await frontendHealth.json(), { status: 'ok', service: 'frontend' });

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.ok(health.headers.get('x-request-id'));
  assert.deepEqual(await health.json(), { status: 'ok', service: 'backend', database: 'up' });

  const anonymousItems = await fetch(`${baseUrl}/api/items`);
  assert.equal(anonymousItems.status, 401);
  const anonymousError = await anonymousItems.json();
  assert.equal(anonymousError.code, 'AUTH_REQUIRED');
  assert.ok(anonymousError.requestId);
  assert.deepEqual(anonymousError.fieldErrors, []);

  manager = await login('manager@seowon.local', integrationConfig.seedManagerPassword);
  assert.equal(manager.user.role, 'MANAGER');
  const dashboard = await api('/api/dashboard', manager);
  assert.equal(dashboard.status, 200);
  const dashboardData = await dashboard.json();
  assert.equal(typeof dashboardData.stats.total_items, 'number');
  assert.ok(Array.isArray(dashboardData.items));
  } finally {
    await removeTestSessions(pool, [manager]);
    await pool.end();
  }
});

test('Docker HTTP에서 CSRF·RBAC·비품 CRUD·대여·반납·감사 로그가 연결된다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  const marker = Date.now().toString().slice(-9);
  const code = `HT-${marker}`;
  let itemId;
  let loanId;
  let manager;
  let admin;

  try {
    manager = await login('manager@seowon.local', integrationConfig.seedManagerPassword);

    const noCsrf = await api('/api/items', manager, {
      method: 'POST', includeCsrf: false,
      body: { code, name: 'HTTP 통합 비품', category: '통합시험', totalQuantity: 5, minQuantity: 1 }
    });
    assert.equal(noCsrf.status, 403);

    const created = await api('/api/items', manager, {
      method: 'POST',
      body: { code, name: 'HTTP 통합 비품', category: '통합시험', location: '시험창고 A', totalQuantity: 5, minQuantity: 1 }
    });
    assert.equal(created.status, 201);
    const createdData = await created.json();
    itemId = createdData.item.id;
    assert.equal(createdData.item.location, '시험창고 A');

    const detail = await api(`/api/items/${itemId}`, manager);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).item.code, code);

    const loan = await api('/api/loans', manager, {
      method: 'POST',
      body: {
        itemId,
        borrowerEmail: 'manager@seowon.local',
        quantity: 2,
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      }
    });
    assert.equal(loan.status, 201);
    loanId = (await loan.json()).loan.id;

    const shrink = await api(`/api/items/${itemId}`, manager, {
      method: 'PATCH',
      body: { name: 'HTTP 통합 비품', category: '통합시험', location: '시험창고 A', totalQuantity: 1, minQuantity: 1 }
    });
    assert.equal(shrink.status, 409);

    const activeDelete = await api(`/api/items/${itemId}`, manager, { method: 'DELETE', body: {} });
    assert.equal(activeDelete.status, 409);

    const returned = await api(`/api/loans/${loanId}/return`, manager, { method: 'POST', body: { condition: 'GOOD', note: 'HTTP 통합 반납' } });
    assert.equal(returned.status, 204);

    const updated = await api(`/api/items/${itemId}`, manager, {
      method: 'PATCH',
      body: { name: 'HTTP 통합 수정 비품', category: '통합장비', location: '시험창고 B', totalQuantity: 8, minQuantity: 2 }
    });
    assert.equal(updated.status, 200);
    const updatedData = await updated.json();
    assert.equal(updatedData.item.available_quantity, 8);
    assert.equal(updatedData.item.location, '시험창고 B');

    const managerAudit = await api('/api/audit', manager);
    assert.equal(managerAudit.status, 403);

    const deactivated = await api(`/api/items/${itemId}`, manager, { method: 'DELETE', body: {} });
    assert.equal(deactivated.status, 204);

    const list = await api(`/api/items?q=${encodeURIComponent(code)}`, manager);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).items.length, 0);

    admin = await login('admin@seowon.local', integrationConfig.seedAdminPassword);
    const audit = await api('/api/audit', admin);
    assert.equal(audit.status, 200);
    const itemLogs = (await audit.json()).logs.filter(log => String(log.entity_id) === String(itemId));
    const actions = itemLogs.map(log => log.action);
    assert.ok(actions.includes('ITEM_CREATED'));
    assert.ok(actions.includes('ITEM_UPDATED'));
    assert.ok(actions.includes('ITEM_DEACTIVATED'));
    assert.ok(itemLogs.every(log => log.request_id && log.ip_address));
  } finally {
    if (loanId || itemId) {
      await pool.query('DELETE FROM audit_logs WHERE entity_id = ANY($1::text[])', [[String(itemId || ''), String(loanId || '')]]);
      if (loanId) await pool.query('DELETE FROM loans WHERE id=$1', [loanId]);
      if (itemId) await pool.query('DELETE FROM items WHERE id=$1', [itemId]);
    }
    await removeTestSessions(pool, [manager, admin]);
    await pool.end();
  }
});

test('기업 자산 요청은 직원 제출과 관리자 승인 후 배정·감사·outbox를 원자적으로 기록한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let assetId; let requestId; let employee; let admin;
  try {
    employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword);
    const refResponse=await api('/api/enterprise/reference',admin); assert.equal(refResponse.status,200); const ref=await refResponse.json();
    const created=await api('/api/enterprise/assets',admin,{method:'POST',body:{organizationId:admin.user.organizationId,assetTag:`EA-${marker}`,name:'기업 통합 테스트 자산',categoryId:ref.categories[0]?.id,locationId:ref.locations[0]?.id,departmentId:ref.departments[0]?.id,statusCode:'AVAILABLE'}});
    assert.equal(created.status,201); assetId=(await created.json()).asset.id;
    const forbidden=await api('/api/enterprise/assets',employee,{method:'POST',body:{organizationId:employee.user.organizationId,assetTag:`NO-${marker}`,name:'권한 거부'}}); assert.equal(forbidden.status,403);
    const drafted=await api('/api/enterprise/requests',employee,{method:'POST',body:{organizationId:employee.user.organizationId,requestType:'ASSIGN',assetId,title:'현장 장비 배정',reason:'현장 업무 사용',payload:{assigneeUserId:employee.user.id}}});
    assert.equal(drafted.status,201); requestId=(await drafted.json()).request.id;
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,employee,{method:'POST',body:{action:'SUBMIT'}})).status,200);
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,admin,{method:'POST',body:{action:'APPROVE',reviewReason:'업무 필요 확인'}})).status,200);
    const asset=await pool.query('SELECT status_code FROM assets WHERE id=$1',[assetId]); assert.equal(asset.rows[0].status_code,'ASSIGNED');
    const assignment=await pool.query('SELECT user_id,status FROM asset_assignments WHERE asset_id=$1',[assetId]); assert.deepEqual(assignment.rows[0],{user_id:employee.user.id,status:'ACTIVE'});
    const proof=await pool.query("SELECT (SELECT count(*) FROM audit_logs WHERE entity_type='REQUEST' AND entity_id=$1)::int audits,(SELECT count(*) FROM outbox_events WHERE aggregate_type='REQUEST' AND aggregate_id=$1)::int events",[String(requestId)]); assert.ok(proof.rows[0].audits>=2); assert.ok(proof.rows[0].events>=2);
  } finally {
    if(requestId) await pool.query("DELETE FROM outbox_events WHERE aggregate_id IN ($1,$2)",[String(requestId),String(assetId||'')]);
    if(requestId) await pool.query("DELETE FROM audit_logs WHERE entity_id IN ($1,$2)",[String(requestId),String(assetId||'')]);
    if(assetId) await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);
    if(assetId) await pool.query('DELETE FROM asset_assignments WHERE asset_id=$1',[assetId]);
    if(requestId) await pool.query('DELETE FROM workflow_requests WHERE id=$1',[requestId]);
    if(assetId) await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);
    await removeTestSessions(pool,[employee,admin]); await pool.end();
  }
});

test('구매 요청은 필수정보를 검증하고 정규화된 payload와 감사를 저장한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl); let employee; let requestId;
  try {
    employee = await login('employee@seowon.local', integrationConfig.seedUserPassword);
    const missing = await api('/api/enterprise/requests', employee, { method: 'POST', body: {
      organizationId: employee.user.organizationId, requestType: 'PURCHASE', title: '현장 장비 구매', reason: '신규 현장 투입', payload: { itemName: '레이저 레벨기' }
    } });
    assert.equal(missing.status, 400); const missingError = await missing.json();
    assert.equal(missingError.code, 'VALIDATION_ERROR'); assert.equal(missingError.fieldErrors[0].field, 'quantity');

    const forbidden = await api('/api/enterprise/requests', employee, { method: 'POST', body: {
      organizationId: Number(employee.user.organizationId) + 999, requestType: 'PURCHASE', title: '타 조직 구매', reason: '권한 역조건',
      payload: { itemName: '레이저 레벨기', quantity: 2, estimatedAmount: '300000', costCenter: 'HQ-001', neededAt: '2026-09-30' }
    } });
    assert.equal(forbidden.status, 403);

    const created = await api('/api/enterprise/requests', employee, { method: 'POST', body: {
      organizationId: employee.user.organizationId, requestType: 'PURCHASE', title: '현장 장비 구매', reason: '신규 현장 투입',
      payload: { itemName: '  레이저 레벨기 ', quantity: '2', estimatedAmount: '300000', costCenter: 'hq-001', neededAt: '2026-09-30' }
    } });
    assert.equal(created.status, 201); const request = (await created.json()).request; requestId = request.id;
    assert.deepEqual(request.payload, { itemName: '레이저 레벨기', quantity: 2, estimatedAmount: '300000.00', costCenter: 'HQ-001', neededAt: '2026-09-30' });
    const audit = await pool.query("SELECT metadata FROM audit_logs WHERE entity_type='REQUEST' AND entity_id=$1 AND action='REQUEST_CREATED'", [String(requestId)]);
    assert.equal(audit.rowCount, 1); assert.equal(audit.rows[0].metadata.purchase.costCenter, 'HQ-001');
  } finally {
    if (requestId) { await pool.query("DELETE FROM audit_logs WHERE entity_type='REQUEST' AND entity_id=$1", [String(requestId)]); await pool.query('DELETE FROM workflow_requests WHERE id=$1', [requestId]); }
    await removeTestSessions(pool, [employee]); await pool.end();
  }
});

test('부분 입고는 검수 전 배정을 차단하고 PASS 검수에서만 개별 자산을 생성한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool = createPool(databaseUrl); const marker = Date.now().toString().slice(-9);
  let employee; let admin; let requestId; let orderId; const receiptIds = []; const inspectionIds = []; const assetIds = [];
  try {
    employee = await login('employee@seowon.local', integrationConfig.seedUserPassword);
    admin = await login('admin@seowon.local', integrationConfig.seedAdminPassword);
    const drafted = await api('/api/enterprise/requests', employee, { method: 'POST', body: {
      organizationId: employee.user.organizationId, requestType: 'PURCHASE', title: `부분입고 검수 ${marker}`, reason: '검수 자동 자산화 검증',
      payload: { itemName: '검수용 레이저 레벨기', quantity: 3, estimatedAmount: '300000', costCenter: 'HQ-001', neededAt: '2026-09-30' }
    } });
    assert.equal(drafted.status, 201); requestId = (await drafted.json()).request.id;
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`, employee, { method: 'POST', body: { action: 'SUBMIT' } })).status, 200);
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`, admin, { method: 'POST', body: { action: 'APPROVE', reviewReason: '구매 필요 확인' } })).status, 200);

    const ordered = await api('/api/enterprise/procurement/orders', admin, { method: 'POST', body: {
      organizationId: admin.user.organizationId, requestId, orderNo: `PO-${marker}`, totalAmount: '300000'
    } });
    assert.equal(ordered.status, 201); orderId = (await ordered.json()).order.id;

    const firstReceiptResponse = await api('/api/enterprise/procurement/receipts', admin, { method: 'POST', body: { purchaseOrderId: orderId, quantity: 2 } });
    assert.equal(firstReceiptResponse.status, 201); const firstReceipt = (await firstReceiptResponse.json()).receipt; receiptIds.push(firstReceipt.id);
    assert.equal(firstReceipt.orderStatus, 'PARTIAL_RECEIVED');
    const beforeInspection = await pool.query("SELECT id FROM assets WHERE attributes->>'receiptId'=$1", [String(firstReceipt.id)]);
    assert.equal(beforeInspection.rowCount, 0, '검수 전에는 배정 가능한 자산 행이 없어야 한다');
    const overReceipt = await api('/api/enterprise/procurement/receipts', admin, { method: 'POST', body: { purchaseOrderId: orderId, quantity: 2 } });
    assert.equal(overReceipt.status, 409);

    const passed = await api('/api/enterprise/procurement/inspections', admin, { method: 'POST', body: { receiptId: firstReceipt.id, result: 'PASS', note: '외관·작동 정상' } });
    assert.equal(passed.status, 201); const passData = await passed.json(); inspectionIds.push(passData.inspection.id);
    assert.equal(passData.assets.length, 2); assetIds.push(...passData.assets.map(asset => asset.id));
    assert.ok(passData.assets.every(asset => asset.status_code === 'AVAILABLE'));
    const links = await pool.query('SELECT unit_no FROM inspection_assets WHERE inspection_id=$1 ORDER BY unit_no', [passData.inspection.id]);
    assert.deepEqual(links.rows.map(row => row.unit_no), [1, 2]);
    const repeated = await api('/api/enterprise/procurement/inspections', admin, { method: 'POST', body: { receiptId: firstReceipt.id, result: 'PASS' } });
    assert.equal(repeated.status, 409);

    const finalReceiptResponse = await api('/api/enterprise/procurement/receipts', admin, { method: 'POST', body: { purchaseOrderId: orderId, quantity: 1 } });
    assert.equal(finalReceiptResponse.status, 201); const finalReceipt = (await finalReceiptResponse.json()).receipt; receiptIds.push(finalReceipt.id);
    assert.equal(finalReceipt.orderStatus, 'RECEIVED');
    const failed = await api('/api/enterprise/procurement/inspections', admin, { method: 'POST', body: { receiptId: finalReceipt.id, result: 'FAIL', note: '작동 불량' } });
    assert.equal(failed.status, 201); const failData = await failed.json(); inspectionIds.push(failData.inspection.id);
    assert.equal(failData.assets.length, 0);
    const finalAssetCount = await pool.query("SELECT count(*)::int count FROM assets WHERE attributes->>'purchaseRequestId'=$1", [String(requestId)]);
    assert.equal(finalAssetCount.rows[0].count, 2);
  } finally {
    if (inspectionIds.length) await pool.query('DELETE FROM inspection_assets WHERE inspection_id=ANY($1::bigint[])', [inspectionIds]);
    if (assetIds.length) await pool.query('DELETE FROM asset_status_histories WHERE asset_id=ANY($1::bigint[])', [assetIds]);
    if (inspectionIds.length) await pool.query('DELETE FROM inspections WHERE id=ANY($1::bigint[])', [inspectionIds]);
    if (assetIds.length) await pool.query('DELETE FROM assets WHERE id=ANY($1::bigint[])', [assetIds]);
    if (receiptIds.length) await pool.query('DELETE FROM receipts WHERE id=ANY($1::bigint[])', [receiptIds]);
    const entityIds = [requestId, orderId, ...receiptIds, ...inspectionIds, ...assetIds].filter(Boolean).map(String);
    if (entityIds.length) { await pool.query('DELETE FROM audit_logs WHERE entity_id=ANY($1::text[])', [entityIds]); await pool.query('DELETE FROM outbox_events WHERE aggregate_id=ANY($1::text[])', [entityIds]); }
    if (orderId) await pool.query('DELETE FROM purchase_orders WHERE id=$1', [orderId]);
    if (requestId) await pool.query('DELETE FROM workflow_requests WHERE id=$1', [requestId]);
    await removeTestSessions(pool, [employee, admin]); await pool.end();
  }
});

test('다차원 보고서와 CSV·감사 검색은 같은 필터와 권한을 적용한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let admin; let employee; let assetId; let departmentId;
  try {
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword);
    employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    assert.equal((await api('/api/enterprise/reports/assets',employee)).status,403);
    const refResponse=await api('/api/enterprise/reference',admin); assert.equal(refResponse.status,200); const ref=await refResponse.json();
    departmentId=ref.departments[0].id; const categoryId=ref.categories[0].id; const locationId=ref.locations[0].id;
    const created=await api('/api/enterprise/assets',admin,{method:'POST',body:{organizationId:admin.user.organizationId,assetTag:`RP-${marker}`,name:'보고서 필터 검증 자산',departmentId,categoryId,locationId,statusCode:'AVAILABLE',acquiredAt:'2026-08-07',acquisitionCost:'123456'}});
    assert.equal(created.status,201); assetId=(await created.json()).asset.id;
    const params=new URLSearchParams({departmentId:String(departmentId),locationId:String(locationId),categoryId:String(categoryId),status:'AVAILABLE',from:'2026-08-01',to:'2026-08-31'}).toString();
    const reportResponse=await api(`/api/enterprise/reports/assets?${params}`,admin); assert.equal(reportResponse.status,200); const report=await reportResponse.json();
    assert.ok(report.summary.assets>=1); assert.ok(report.breakdowns.departments.some(row=>row.count>=1)); assert.ok(report.breakdowns.locations.some(row=>row.count>=1)); assert.ok(report.breakdowns.categories.some(row=>row.count>=1)); assert.deepEqual(report.breakdowns.statuses.map(row=>row.label),['AVAILABLE']);
    const csvResponse=await api(`/api/enterprise/reports/assets.csv?${params}`,admin); assert.equal(csvResponse.status,200); assert.match(csvResponse.headers.get('content-type'),/text\/csv/); assert.match(await csvResponse.text(),new RegExp(`RP-${marker}`));
    const auditResponse=await api(`/api/audit?action=REPORT_EXPORTED&q=${encodeURIComponent(String(departmentId))}`,admin); assert.equal(auditResponse.status,200); const logs=(await auditResponse.json()).logs;
    assert.ok(logs.some(log=>Number(log.metadata?.filters?.departmentId)===Number(departmentId)));
  } finally {
    if(departmentId&&admin) await pool.query("DELETE FROM audit_logs WHERE actor_user_id=$1 AND action='REPORT_EXPORTED' AND metadata->'filters'->>'departmentId'=$2",[admin.user.id,String(departmentId)]);
    if(assetId){await pool.query('DELETE FROM outbox_events WHERE aggregate_type=$1 AND aggregate_id=$2',['ASSET',String(assetId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(assetId)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);}
    await removeTestSessions(pool,[admin,employee]); await pool.end();
  }
});

test('관리자는 조직 팀을 만들고 해시 저장된 초대로 사용자를 단회 활성화한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); const email=`invite-${marker}@seowon.local`;
  let admin; let employee; let invited; let unitId; let invitationId; let userId;
  try {
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword);
    employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    const forbidden=await api('/api/enterprise/admin/invitations',employee,{method:'POST',body:{email,displayName:'초대 사용자',role:'USER',scopeType:'ORGANIZATION'}});
    assert.equal(forbidden.status,403);
    const reauth=await api('/api/auth/reauth',admin,{method:'POST',body:{password:integrationConfig.seedAdminPassword}});
    assert.equal(reauth.status,204);
    const hq=await pool.query("SELECT id FROM departments WHERE organization_id=$1 AND code='HQ'",[admin.user.organizationId]);
    const unitResponse=await api('/api/enterprise/admin/departments',admin,{method:'POST',body:{organizationId:admin.user.organizationId,parentId:hq.rows[0].id,code:`TEAM-${marker}`,name:'통합 테스트 팀',unitType:'TEAM',costCenter:`TC-${marker}`}});
    assert.equal(unitResponse.status,201); const unit=(await unitResponse.json()).department; unitId=unit.id; assert.equal(unit.unit_type,'TEAM');
    const invitationResponse=await api('/api/enterprise/admin/invitations',admin,{method:'POST',body:{organizationId:admin.user.organizationId,departmentId:unitId,email,displayName:'초대 사용자',role:'USER',scopeType:'DEPARTMENT'}});
    assert.equal(invitationResponse.status,201); const invitationData=await invitationResponse.json(); invitationId=invitationData.invitation.id; const token=invitationData.developmentToken; assert.ok(token);
    const stored=await pool.query('SELECT token_hash FROM user_invitations WHERE id=$1',[invitationId]);
    assert.notEqual(stored.rows[0].token_hash,token); assert.equal(stored.rows[0].token_hash,crypto.createHash('sha256').update(token).digest('hex'));
    const csrfResponse=await fetch(`${baseUrl}/api/auth/csrf`); const cookie=cookieFrom(csrfResponse); const csrfToken=(await csrfResponse.json()).csrfToken;
    const accepted=await fetch(`${baseUrl}/api/auth/invitations/accept`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({_csrf:csrfToken,token,newPassword:'InvitedUser123!@'})});
    assert.equal(accepted.status,201); userId=(await accepted.json()).user.id;
    const reused=await fetch(`${baseUrl}/api/auth/invitations/accept`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({_csrf:csrfToken,token,newPassword:'InvitedUser123!@'})}); assert.equal(reused.status,400);
    const scope=await pool.query('SELECT role_code,scope_type,department_id FROM user_role_scopes WHERE user_id=$1',[userId]); assert.deepEqual(scope.rows[0],{role_code:'USER',scope_type:'DEPARTMENT',department_id:String(unitId)});
    invited=await login(email,'InvitedUser123!@'); assert.equal(invited.user.departmentId,unitId);
  } finally {
    await removeTestSessions(pool,[admin,employee,invited]);
    if(userId) await pool.query('DELETE FROM audit_logs WHERE actor_user_id=$1 OR (entity_type=\'USER\' AND entity_id=$2)',[userId,String(userId)]);
    if(invitationId) {await pool.query("DELETE FROM audit_logs WHERE entity_type='USER_INVITATION' AND entity_id=$1",[String(invitationId)]);await pool.query('DELETE FROM user_invitations WHERE id=$1',[invitationId]);}
    if(userId) await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    if(unitId) {await pool.query("DELETE FROM audit_logs WHERE entity_type='DEPARTMENT' AND entity_id=$1",[String(unitId)]);await pool.query('DELETE FROM departments WHERE id=$1',[unitId]);}
    await pool.end();
  }
});

test('비밀번호 재설정 토큰은 단회 사용되고 기존 세션을 폐기한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); const email=`reset-${marker}@seowon.local`; let userId; let loggedIn;
  try {
    const organization=await pool.query("SELECT id FROM organizations WHERE code='SEOWON'"); const hash=await bcrypt.hash('BeforeReset123!',12);
    const inserted=await pool.query("INSERT INTO users(email,display_name,password_hash,role,status,organization_id) VALUES($1,'재설정 테스트',$2,'USER','ACTIVE',$3) RETURNING id",[email,hash,organization.rows[0].id]); userId=inserted.rows[0].id;
    const csrfResponse=await fetch(`${baseUrl}/api/auth/csrf`); const cookie=cookieFrom(csrfResponse); const csrfToken=(await csrfResponse.json()).csrfToken;
    const requested=await fetch(`${baseUrl}/api/auth/password-reset/request`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({_csrf:csrfToken,email})}); assert.equal(requested.status,200); const token=(await requested.json()).developmentToken; assert.ok(token);
    const confirmed=await fetch(`${baseUrl}/api/auth/password-reset/confirm`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({_csrf:csrfToken,token,newPassword:'AfterReset123!@'})}); assert.equal(confirmed.status,204);
    const reused=await fetch(`${baseUrl}/api/auth/password-reset/confirm`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({_csrf:csrfToken,token,newPassword:'AfterReset123!@'})}); assert.equal(reused.status,400);
    loggedIn=await login(email,'AfterReset123!@'); assert.equal(loggedIn.user.id,userId);
  } finally {
    await removeTestSessions(pool,[loggedIn]); if(userId){await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1',[userId]);await pool.query("DELETE FROM audit_logs WHERE actor_user_id=$1",[userId]);await pool.query('DELETE FROM users WHERE id=$1',[userId]);} await pool.end();
  }
});
