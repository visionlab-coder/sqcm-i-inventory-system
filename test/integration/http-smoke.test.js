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

async function api(path, session, { method = 'GET', body, includeCsrf = true, headers: extraHeaders = {} } = {}) {
  const headers = { cookie: session.cookie, accept: 'application/json', ...extraHeaders };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(includeCsrf ? { ...body, _csrf: session.csrfToken } : body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload, redirect: 'manual' });
}

test('동일 Idempotency-Key 재전송은 자산을 한 번만 생성하고 다른 payload는 거부한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl);const marker=Date.now().toString().slice(-9);const tag=`IDEM-${marker}`;const key=`idem-${crypto.randomUUID()}`;let admin;let assetId;
  try{
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword);
    const reference=await (await api('/api/enterprise/reference',admin,{})).json();
    const body={organizationId:admin.user.organizationId,assetTag:tag,name:`중복방지 자산 ${marker}`,departmentId:reference.departments[0]?.id||null,locationId:reference.locations[0]?.id||null,categoryId:reference.categories[0]?.id||null,statusCode:'AVAILABLE'};
    const first=await api('/api/enterprise/assets',admin,{method:'POST',body,headers:{'idempotency-key':key}});assert.equal(first.status,201);const firstBody=await first.json();assetId=firstBody.asset.id;
    const replay=await api('/api/enterprise/assets',admin,{method:'POST',body,headers:{'idempotency-key':key}});assert.equal(replay.status,201);assert.equal(replay.headers.get('idempotent-replay'),'true');assert.equal((await replay.json()).asset.id,assetId);
    const conflict=await api('/api/enterprise/assets',admin,{method:'POST',body:{...body,name:'다른 payload'},headers:{'idempotency-key':key}});assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'IDEMPOTENCY_CONFLICT');
    assert.equal((await pool.query('SELECT count(*)::int count FROM assets WHERE asset_tag=$1',[tag])).rows[0].count,1);
  }finally{
    await removeTestSessions(pool,[admin]);
    await pool.query('DELETE FROM api_idempotency_keys WHERE idempotency_key=$1',[key]);
    if(assetId){await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query("DELETE FROM outbox_events WHERE aggregate_type='ASSET' AND aggregate_id=$1",[String(assetId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(assetId)]);await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);}
    await pool.end();
  }
});

test('3계층 Docker 앱 health와 API 로그인 세션 흐름이 동작한다', { skip: !baseUrl }, async () => {
  const pool = createPool(databaseUrl);
  let manager;
  try {
  const sessionsBefore = await pool.query('SELECT count(*)::int count FROM user_sessions');
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
  const sessionsAfterAnonymousHealth = await pool.query('SELECT count(*)::int count FROM user_sessions');
  assert.equal(sessionsAfterAnonymousHealth.rows[0].count, sessionsBefore.rows[0].count, 'health와 익명 보호 API는 세션을 만들지 않아야 한다');

  manager = await login('manager@seowon.local', integrationConfig.seedManagerPassword);
  assert.equal(manager.user.role, 'MANAGER');
  const dashboard = await api('/api/dashboard', manager);
  assert.equal(dashboard.status, 200);
  const dashboardData = await dashboard.json();
  assert.equal(typeof dashboardData.stats.total_items, 'number');
  assert.ok(Array.isArray(dashboardData.items));

  const staleCsrf = await api('/api/items', manager, {
    method: 'POST',
    includeCsrf: false,
    headers: { 'x-csrf-token': 'stale-browser-token' },
    body: { code: 'CSRF-NOT-CREATED', name: '차단 대상', category: '보안 테스트', totalQuantity: 1, minQuantity: 0 }
  });
  assert.equal(staleCsrf.status, 403);
  const staleCsrfError = await staleCsrf.json();
  assert.equal(staleCsrfError.code, 'CSRF_INVALID');
  assert.equal(staleCsrfError.csrfRefreshRequired, true);

  const refreshedSession = await api('/api/auth/me', manager);
  assert.equal(refreshedSession.status, 200);
  assert.ok((await refreshedSession.json()).csrfToken);
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

test('기준정보 4종은 관리자 생명주기를 따르고 비활성 후 기존 자산 참조를 보존한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let admin; let employee; let categoryId; let modelId; let vendorId; let locationId; let assetId;
  try {
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword); employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    const forbidden=await api('/api/enterprise/admin/references',employee); assert.equal(forbidden.status,403);
    const reauth=await api('/api/auth/reauth',admin,{method:'POST',body:{password:integrationConfig.seedAdminPassword}}); assert.equal(reauth.status,204);
    const create=async(kind,body)=>{const response=await api(`/api/enterprise/admin/references/${kind}`,admin,{method:'POST',body:{organizationId:admin.user.organizationId,...body}});assert.equal(response.status,201);return (await response.json()).reference;};
    const category=await create('categories',{code:`RC-${marker}`,name:'통합 기준 유형'}); categoryId=category.id;
    const duplicate=await api('/api/enterprise/admin/references/categories',admin,{method:'POST',body:{organizationId:admin.user.organizationId,code:`RC-${marker}`,name:'중복 유형'}}); assert.equal(duplicate.status,409);
    const invalidModel=await api('/api/enterprise/admin/references/models',admin,{method:'POST',body:{organizationId:admin.user.organizationId,categoryId:999999999,brand:'TEST',name:'잘못된 모델',specification:{}}}); assert.equal(invalidModel.status,409);
    const model=await create('models',{categoryId,brand:'TEST',name:'통합 기준 모델',specification:{standard:'T1'}}); modelId=model.id;
    const vendor=await create('vendors',{code:`RV-${marker}`,name:'통합 공급업체',contactEmail:'reference@example.invalid'}); vendorId=vendor.id;
    const location=await create('locations',{code:`RL-${marker}`,name:'통합 시험 위치',locationType:'WAREHOUSE'}); locationId=location.id;
    const assetResponse=await api('/api/enterprise/assets',admin,{method:'POST',body:{organizationId:admin.user.organizationId,assetTag:`RA-${marker}`,name:'기준정보 보존 자산',categoryId,modelId,locationId,statusCode:'AVAILABLE'}}); assert.equal(assetResponse.status,201); assetId=(await assetResponse.json()).asset.id;
    for(const [kind,id,name] of [['categories',categoryId,'통합 기준 유형 수정'],['models',modelId,'통합 기준 모델 수정'],['vendors',vendorId,'통합 공급업체 수정'],['locations',locationId,'통합 시험 위치 수정']]){
      const updated=await api(`/api/enterprise/admin/references/${kind}/${id}`,admin,{method:'PATCH',body:{organizationId:admin.user.organizationId,name,isActive:false}}); assert.equal(updated.status,200); assert.equal((await updated.json()).reference.is_active,false);
    }
    const operational=await api('/api/enterprise/reference',admin); assert.equal(operational.status,200); const operationalData=await operational.json(); assert.equal(operationalData.categories.some(row=>row.id===categoryId),false); assert.equal(operationalData.models.some(row=>row.id===modelId),false); assert.equal(operationalData.vendors.some(row=>row.id===vendorId),false); assert.equal(operationalData.locations.some(row=>row.id===locationId),false);
    const managed=await api('/api/enterprise/admin/references',admin); const managedData=(await managed.json()).references; assert.equal(managedData.categories.find(row=>row.id===categoryId).name,'통합 기준 유형 수정'); assert.equal(managedData.categories.find(row=>row.id===categoryId).is_active,false);
    const retained=await pool.query('SELECT category_id,model_id,location_id FROM assets WHERE id=$1',[assetId]); assert.deepEqual(retained.rows[0],{category_id:String(categoryId),model_id:String(modelId),location_id:String(locationId)});
  } finally {
    await removeTestSessions(pool,[admin,employee]);
    if(assetId){await pool.query('DELETE FROM outbox_events WHERE aggregate_type=$1 AND aggregate_id=$2',['ASSET',String(assetId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(assetId)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);}
    for(const [type,id] of [['MODELS',modelId],['CATEGORIES',categoryId],['VENDORS',vendorId],['LOCATIONS',locationId]]) if(id) await pool.query('DELETE FROM audit_logs WHERE entity_type=$1 AND entity_id=$2',[type,String(id)]);
    if(modelId)await pool.query('DELETE FROM item_models WHERE id=$1',[modelId]); if(categoryId)await pool.query('DELETE FROM item_categories WHERE id=$1',[categoryId]); if(vendorId)await pool.query('DELETE FROM vendors WHERE id=$1',[vendorId]); if(locationId)await pool.query('DELETE FROM locations WHERE id=$1',[locationId]); await pool.end();
  }
});

test('상태·사유 정책은 수동 상태 변경과 이력에 강제된다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let admin; let employee; let assetId; let secondAssetId; let reasonId; let statusOriginal;
  try {
    admin=await login('admin@seowon.local',integrationConfig.seedAdminPassword); employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    assert.equal((await api('/api/enterprise/admin/references',employee)).status,403);
    assert.equal((await api('/api/auth/reauth',admin,{method:'POST',body:{password:integrationConfig.seedAdminPassword}})).status,204);
    const managed=await api('/api/enterprise/admin/references',admin); const refs=(await managed.json()).references; const repair=refs.statuses.find(row=>row.code==='REPAIR'); statusOriginal={name:repair.name,description:repair.description,sortOrder:repair.sort_order,isActive:repair.is_active};
    const invalidStatus=await api('/api/enterprise/admin/references/statuses',admin,{method:'POST',body:{organizationId:admin.user.organizationId,code:'CUSTOM',name:'임의 상태',sortOrder:1}}); assert.equal(invalidStatus.status,400);
    const reasonResponse=await api('/api/enterprise/admin/references/reasons',admin,{method:'POST',body:{organizationId:admin.user.organizationId,code:`RR-${marker}`,name:'통합 파손 사유',appliesToStatus:'REPAIR',requiresDetail:true}}); assert.equal(reasonResponse.status,201); reasonId=(await reasonResponse.json()).reference.id;
    const duplicate=await api('/api/enterprise/admin/references/reasons',admin,{method:'POST',body:{organizationId:admin.user.organizationId,code:`RR-${marker}`,name:'중복 사유',appliesToStatus:'REPAIR',requiresDetail:false}}); assert.equal(duplicate.status,409);
    const createAssetForTest=async(prefix)=>{const response=await api('/api/enterprise/assets',admin,{method:'POST',body:{organizationId:admin.user.organizationId,assetTag:`${prefix}-${marker}`,name:'상태 정책 검증 자산',statusCode:'AVAILABLE'}});assert.equal(response.status,201);return (await response.json()).asset.id;};
    assetId=await createAssetForTest('SP');
    const missingDetail=await api(`/api/enterprise/assets/${assetId}/status`,admin,{method:'POST',body:{toStatus:'REPAIR',reasonCode:`RR-${marker}`,reasonDetail:''}}); assert.equal(missingDetail.status,400);
    const wrongReason=await api(`/api/enterprise/assets/${assetId}/status`,admin,{method:'POST',body:{toStatus:'REPAIR',reasonCode:'LOSS',reasonDetail:'적용 상태 불일치'}}); assert.equal(wrongReason.status,409);
    const changed=await api(`/api/enterprise/assets/${assetId}/status`,admin,{method:'POST',body:{toStatus:'REPAIR',reasonCode:`RR-${marker}`,reasonDetail:'모터 손상 확인'}}); assert.equal(changed.status,200); assert.equal((await changed.json()).asset.status_code,'REPAIR');
    const history=await pool.query('SELECT reason_definition_id,reason_detail,reason FROM asset_status_histories WHERE asset_id=$1 AND to_status=$2 ORDER BY id DESC LIMIT 1',[assetId,'REPAIR']); assert.equal(history.rows[0].reason_definition_id,String(reasonId)); assert.equal(history.rows[0].reason_detail,'모터 손상 확인'); assert.match(history.rows[0].reason,/통합 파손 사유/);
    assert.equal((await api(`/api/enterprise/admin/references/reasons/${reasonId}`,admin,{method:'PATCH',body:{organizationId:admin.user.organizationId,name:'통합 파손 사유',isActive:false,appliesToStatus:'REPAIR',requiresDetail:true}})).status,200);
    assert.equal((await api(`/api/enterprise/admin/references/statuses/${repair.id}`,admin,{method:'PATCH',body:{organizationId:admin.user.organizationId,name:repair.name,isActive:false,description:repair.description||'',sortOrder:repair.sort_order}})).status,200);
    const operational=await api('/api/enterprise/reference',admin); const active=await operational.json(); assert.equal(active.reasons.some(row=>row.id===reasonId),false); assert.equal(active.statuses.some(row=>row.code==='REPAIR'),false);
    secondAssetId=await createAssetForTest('SQ'); const inactiveStatus=await api(`/api/enterprise/assets/${secondAssetId}/status`,admin,{method:'POST',body:{toStatus:'REPAIR',reasonCode:'GENERAL'}}); assert.equal(inactiveStatus.status,409);
    const retained=await pool.query('SELECT status_code FROM assets WHERE id=$1',[assetId]); assert.equal(retained.rows[0].status_code,'REPAIR');
  } finally {
    await removeTestSessions(pool,[admin,employee]);
    for(const id of [assetId,secondAssetId].filter(Boolean)){await pool.query('DELETE FROM outbox_events WHERE aggregate_type=$1 AND aggregate_id=$2',['ASSET',String(id)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(id)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[id]);await pool.query('DELETE FROM assets WHERE id=$1',[id]);}
    if(reasonId){await pool.query("DELETE FROM audit_logs WHERE entity_type='REASONS' AND entity_id=$1",[String(reasonId)]);await pool.query('DELETE FROM asset_reason_definitions WHERE id=$1',[reasonId]);}
    if(statusOriginal&&admin){await pool.query('UPDATE asset_status_definitions SET name=$1,description=$2,sort_order=$3,is_active=$4,updated_at=now() WHERE organization_id=$5 AND code=$6',[statusOriginal.name,statusOriginal.description,statusOriginal.sortOrder,statusOriginal.isActive,admin.user.organizationId,'REPAIR']);await pool.query("DELETE FROM audit_logs WHERE entity_type='STATUSES' AND entity_id=(SELECT id::text FROM asset_status_definitions WHERE organization_id=$1 AND code='REPAIR')",[admin.user.organizationId]);}
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

test('자산 증빙파일은 검증·권한·감사·보존 수명주기를 지킨다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let manager; let employee; let assetId; let fileId;
  const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
  const upload=(session,content,type='image/png',name='site.png',fileType='PHOTO')=>fetch(`${baseUrl}/api/enterprise/assets/${assetId}/files`,{method:'POST',headers:{cookie:session.cookie,'content-type':type,'x-file-name':encodeURIComponent(name),'x-file-type':fileType,'x-csrf-token':session.csrfToken},body:content});
  try {
    manager=await login('manager@seowon.local',integrationConfig.seedManagerPassword);
    employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    const created=await api('/api/enterprise/assets',manager,{method:'POST',body:{organizationId:manager.user.organizationId,assetTag:`EV-${marker}`,name:'증빙 수명주기 자산',departmentId:employee.user.departmentId,statusCode:'AVAILABLE'}});
    assert.equal(created.status,201); assetId=(await created.json()).asset.id;
    assert.equal((await upload(employee,png)).status,403);
    assert.equal((await upload(manager,Buffer.from('not-png'))).status,400);
    assert.equal((await upload(manager,png,'application/octet-stream')).status,415);
    assert.equal((await upload(manager,Buffer.alloc(5*1024*1024+1))).status,413);
    const uploaded=await upload(manager,png); assert.equal(uploaded.status,201); const file=(await uploaded.json()).file; fileId=file.id;
    assert.equal(file.sizeBytes,png.length); assert.match(file.checksum,/^[a-f0-9]{64}$/);
    const detail=await api(`/api/enterprise/assets/${assetId}`,employee); assert.equal(detail.status,200); assert.equal((await detail.json()).files[0].id,fileId);
    const downloaded=await api(`/api/enterprise/assets/${assetId}/files/${fileId}/download`,employee); assert.equal(downloaded.status,200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png); assert.match(downloaded.headers.get('content-disposition'),/site\.png/);
    assert.equal((await api(`/api/enterprise/assets/${assetId}/files/${fileId}/deactivate`,employee,{method:'POST',body:{}})).status,403);
    assert.equal((await api(`/api/enterprise/assets/${assetId}/files/${fileId}/deactivate`,manager,{method:'POST',body:{}})).status,204);
    assert.equal((await api(`/api/enterprise/assets/${assetId}/files/${fileId}/download`,employee)).status,404);
    const retained=await pool.query('SELECT status,storage_key FROM file_records WHERE id=$1',[fileId]); assert.equal(retained.rows[0].status,'INACTIVE'); assert.ok(retained.rows[0].storage_key);
    const actions=await pool.query("SELECT action FROM audit_logs WHERE entity_type='FILE' AND entity_id=$1 ORDER BY id",[String(fileId)]);
    assert.deepEqual(actions.rows.map(row=>row.action),['FILE_UPLOADED','FILE_DOWNLOADED','FILE_DEACTIVATED']);
  } finally {
    await removeTestSessions(pool,[manager,employee]);
    if(fileId){await pool.query("DELETE FROM audit_logs WHERE entity_type='FILE' AND entity_id=$1",[String(fileId)]);await pool.query('DELETE FROM asset_files WHERE file_id=$1',[fileId]);await pool.query('DELETE FROM file_records WHERE id=$1',[fileId]);}
    if(assetId){await pool.query('DELETE FROM outbox_events WHERE aggregate_type=$1 AND aggregate_id=$2',['ASSET',String(assetId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='ASSET' AND entity_id=$1",[String(assetId)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);}
    await pool.end();
  }
});

test('부서 범위 관리자는 기준 부서와 하위 부서 자산만 조회·변경한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let session; let userId; const departmentIds=[]; const assetIds=[];
  try {
    const organization=await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 1'); const organizationId=organization.rows[0].id;
    const parent=await pool.query(`INSERT INTO departments(organization_id,code,name,unit_type) VALUES($1,$2,$3,'DEPARTMENT') RETURNING id`,[organizationId,`SP-${marker}`,`범위본부-${marker}`]); departmentIds.push(parent.rows[0].id);
    const child=await pool.query(`INSERT INTO departments(organization_id,parent_id,code,name,unit_type) VALUES($1,$2,$3,$4,'TEAM') RETURNING id`,[organizationId,parent.rows[0].id,`SC-${marker}`,`하위팀-${marker}`]); departmentIds.push(child.rows[0].id);
    const outside=await pool.query(`INSERT INTO departments(organization_id,code,name,unit_type) VALUES($1,$2,$3,'DEPARTMENT') RETURNING id`,[organizationId,`SX-${marker}`,`외부본부-${marker}`]); departmentIds.push(outside.rows[0].id);
    const email=`scope-${marker}@seowon.local`; const password='ScopeManager123!';
    const user=await pool.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id,department_id) VALUES($1,$2,$3,'MANAGER','ACTIVE',$4,$5) RETURNING id`,[email,`범위 관리자 ${marker}`,await bcrypt.hash(password,12),organizationId,parent.rows[0].id]); userId=user.rows[0].id;
    await pool.query(`INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type) VALUES($1,'MANAGER',$2,$3,'DEPARTMENT')`,[userId,organizationId,parent.rows[0].id]);
    for(const [tag,departmentId] of [[`SC-P-${marker}`,parent.rows[0].id],[`SC-C-${marker}`,child.rows[0].id],[`SC-X-${marker}`,outside.rows[0].id]]){const asset=await pool.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,created_by) VALUES($1,$2,$3,'AVAILABLE',$4,$5) RETURNING id`,[organizationId,tag,tag,departmentId,userId]);assetIds.push(asset.rows[0].id);}
    session=await login(email,password);
    assert.equal(session.user.scopeType,'DEPARTMENT');
    const list=await api('/api/enterprise/assets?size=100',session); assert.equal(list.status,200); const listed=(await list.json()).assets.map(row=>Number(row.id)); assert.ok(listed.includes(Number(assetIds[0]))&&listed.includes(Number(assetIds[1])),`expected ${assetIds.slice(0,2)} in ${listed}`); assert.ok(!listed.includes(Number(assetIds[2])));
    assert.equal((await api(`/api/enterprise/assets/${assetIds[2]}`,session)).status,403);
    const report=await api('/api/enterprise/reports/assets',session); assert.equal(report.status,200); assert.equal((await report.json()).summary.assets,2);
    const denied=await api('/api/enterprise/assets',session,{method:'POST',body:{organizationId,assetTag:`SC-D-${marker}`,name:'범위 외 생성',departmentId:outside.rows[0].id,statusCode:'AVAILABLE'}}); assert.equal(denied.status,403);
    const reference=await api('/api/enterprise/reference',session); assert.equal(reference.status,200); const visible=(await reference.json()).departments.map(row=>Number(row.id)); assert.ok(visible.includes(Number(parent.rows[0].id))&&visible.includes(Number(child.rows[0].id))); assert.ok(!visible.includes(Number(outside.rows[0].id)));
  } finally {
    await removeTestSessions(pool,[session]);
    if(userId) await pool.query('DELETE FROM audit_logs WHERE actor_user_id=$1',[userId]);
    if(assetIds.length) await pool.query('DELETE FROM assets WHERE id=ANY($1::bigint[])',[assetIds]);
    if(userId){await pool.query('DELETE FROM user_role_scopes WHERE user_id=$1',[userId]);await pool.query('DELETE FROM users WHERE id=$1',[userId]);}
    for(const id of departmentIds.slice().reverse()) await pool.query('DELETE FROM departments WHERE id=$1',[id]);
    await pool.end();
  }
});

test('2단계 승인 정책은 중간 승인에서 업무를 보류하고 최종 단계에서만 자산을 배정한다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let admin; let manager; let employee; let policyId; let requestId; let rejectedRequestId; let assetId;
  try {
    [admin,manager,employee]=await Promise.all([login('admin@seowon.local',integrationConfig.seedAdminPassword),login('manager@seowon.local',integrationConfig.seedManagerPassword),login('employee@seowon.local',integrationConfig.seedUserPassword)]);
    assert.equal((await api('/api/auth/reauth',admin,{method:'POST',body:{password:integrationConfig.seedAdminPassword}})).status,204);
    const policyResponse=await api('/api/enterprise/admin/approval-policies',admin,{method:'POST',body:{organizationId:admin.user.organizationId,name:`2단계 배정 ${marker}`,requestType:'ASSIGN',priority:100,steps:[{name:'부서 관리자 승인',approverRole:'MANAGER',departmentScope:'REQUEST_DEPARTMENT'},{name:'최종 관리자 승인',approverRole:'ADMIN',departmentScope:'ORGANIZATION'}]}}); assert.equal(policyResponse.status,201); policyId=(await policyResponse.json()).policy.id;
    const asset=await pool.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,created_by) VALUES($1,$2,$3,'AVAILABLE',$4,$5) RETURNING id`,[employee.user.organizationId,`AP-${marker}`,`다단계 승인 자산 ${marker}`,employee.user.departmentId,admin.user.id]); assetId=asset.rows[0].id;
    const created=await api('/api/enterprise/requests',employee,{method:'POST',body:{organizationId:employee.user.organizationId,requestType:'ASSIGN',assetId,title:'자산 배정 요청',reason:'다단계 승인 검증',payload:{assigneeUserId:employee.user.id}}}); assert.equal(created.status,201); requestId=(await created.json()).request.id;
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,employee,{method:'POST',body:{action:'SUBMIT'}})).status,200);
    let stored=await pool.query('SELECT status,current_approval_step,approval_step_count FROM workflow_requests WHERE id=$1',[requestId]); assert.deepEqual(stored.rows[0],{status:'SUBMITTED',current_approval_step:1,approval_step_count:2});
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,manager,{method:'POST',body:{action:'APPROVE',reviewReason:'1단계 승인'}})).status,200);
    stored=await pool.query('SELECT status,current_approval_step FROM workflow_requests WHERE id=$1',[requestId]); assert.deepEqual(stored.rows[0],{status:'SUBMITTED',current_approval_step:2});
    assert.equal((await pool.query('SELECT status_code FROM assets WHERE id=$1',[assetId])).rows[0].status_code,'AVAILABLE');
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,manager,{method:'POST',body:{action:'APPROVE',reviewReason:'단계 건너뛰기 시도'}})).status,403);
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,admin,{method:'POST',body:{action:'APPROVE',reviewReason:'최종 승인'}})).status,200);
    stored=await pool.query('SELECT status,current_approval_step FROM workflow_requests WHERE id=$1',[requestId]); assert.deepEqual(stored.rows[0],{status:'APPROVED',current_approval_step:null});
    assert.equal((await pool.query('SELECT status_code FROM assets WHERE id=$1',[assetId])).rows[0].status_code,'ASSIGNED');
    const approvals=await api(`/api/enterprise/requests/${requestId}/approvals`,employee); assert.equal(approvals.status,200); assert.deepEqual((await approvals.json()).approvals.map(row=>row.status),['APPROVED','APPROVED']);
    const rejected=await api('/api/enterprise/requests',employee,{method:'POST',body:{organizationId:employee.user.organizationId,requestType:'ASSIGN',assetId,title:'반려 경로 요청',reason:'후속 단계 종료 검증',payload:{assigneeUserId:employee.user.id}}}); rejectedRequestId=(await rejected.json()).request.id;
    await api(`/api/enterprise/requests/${rejectedRequestId}/action`,employee,{method:'POST',body:{action:'SUBMIT'}});
    assert.equal((await api(`/api/enterprise/requests/${rejectedRequestId}/action`,manager,{method:'POST',body:{action:'REJECT',reviewReason:'요건 미충족'}})).status,200);
    const rejectedApprovals=await pool.query('SELECT status FROM workflow_request_approvals WHERE request_id=$1 ORDER BY step_order',[rejectedRequestId]); assert.deepEqual(rejectedApprovals.rows.map(row=>row.status),['REJECTED','SKIPPED']);
  } finally {
    await removeTestSessions(pool,[admin,manager,employee]);
    for(const id of [requestId,rejectedRequestId].filter(Boolean)){await pool.query("DELETE FROM outbox_events WHERE aggregate_type='REQUEST' AND aggregate_id=$1",[String(id)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='REQUEST' AND entity_id=$1",[String(id)]);}
    if(assetId){await pool.query('DELETE FROM asset_assignments WHERE asset_id=$1',[assetId]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);await pool.query("DELETE FROM outbox_events WHERE aggregate_type='ASSET' AND aggregate_id=$1",[String(assetId)]);}
    if(requestId||rejectedRequestId) await pool.query('DELETE FROM workflow_requests WHERE id=ANY($1::bigint[])',[[requestId,rejectedRequestId].filter(Boolean)]);
    if(assetId) await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);
    if(policyId){await pool.query("DELETE FROM audit_logs WHERE entity_type='APPROVAL_POLICY' AND entity_id=$1",[String(policyId)]);await pool.query('DELETE FROM approval_policies WHERE id=$1',[policyId]);}
    await pool.end();
  }
});

test('반납 사진은 제출 전에 검증되고 최종 승인과 반납 원장이 원자적으로 기록된다', { skip: !baseUrl || !databaseUrl }, async () => {
  const pool=createPool(databaseUrl); const marker=Date.now().toString().slice(-9); let manager; let employee; let assetId; let assignmentId; let requestId; let fileId;
  const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
  const upload=(session,content,type,name)=>fetch(`${baseUrl}/api/enterprise/requests/${requestId}/return-photo`,{method:'POST',headers:{cookie:session.cookie,'content-type':type,'x-file-name':encodeURIComponent(name),'x-csrf-token':session.csrfToken},body:content});
  try {
    manager=await login('manager@seowon.local',integrationConfig.seedManagerPassword); employee=await login('employee@seowon.local',integrationConfig.seedUserPassword);
    const asset=await pool.query(`INSERT INTO assets(organization_id,asset_tag,name,status_code,department_id,created_by) VALUES($1,$2,$3,'ASSIGNED',$4,$5) RETURNING id`,[employee.user.organizationId,`RT-${marker}`,`반납 증빙 자산 ${marker}`,employee.user.departmentId,manager.user.id]); assetId=asset.rows[0].id;
    const assignment=await pool.query(`INSERT INTO asset_assignments(asset_id,user_id,department_id,assigned_by,started_at,status,accessories) VALUES($1,$2,$3,$4,now(),'ACTIVE',$5::jsonb) RETURNING id`,[assetId,employee.user.id,employee.user.departmentId,manager.user.id,JSON.stringify(['충전기','케이스'])]); assignmentId=assignment.rows[0].id;
    const created=await api('/api/enterprise/requests',employee,{method:'POST',body:{organizationId:employee.user.organizationId,requestType:'RETURN',assetId,title:'현장 반납',reason:'사용 완료',payload:{conditionCode:'DAMAGED',note:'외관 긁힘 확인',accessories:['충전기','케이스']}}}); assert.equal(created.status,201); requestId=(await created.json()).request.id;
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,employee,{method:'POST',body:{action:'SUBMIT'}})).status,409);
    assert.equal((await upload(employee,Buffer.from('%PDF-x'),'application/pdf','return.pdf')).status,415);
    assert.equal((await upload(employee,Buffer.from('fake'),'image/png','fake.png')).status,400);
    assert.equal((await upload(manager,png,'image/png','other.png')).status,403);
    const uploaded=await upload(employee,png,'image/png','return.png'); assert.equal(uploaded.status,201); fileId=(await uploaded.json()).file.id;
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,employee,{method:'POST',body:{action:'SUBMIT'}})).status,200);
    assert.equal((await api(`/api/enterprise/requests/${requestId}/action`,manager,{method:'POST',body:{action:'APPROVE',reviewReason:'사진과 상태 확인'}})).status,200);
    const returned=await pool.query('SELECT returned_by,checked_by,condition_code,note,accessories,photo_file_id FROM asset_return_records WHERE request_id=$1',[requestId]); assert.equal(returned.rowCount,1); assert.deepEqual({...returned.rows[0],returned_by:Number(returned.rows[0].returned_by),checked_by:Number(returned.rows[0].checked_by),photo_file_id:Number(returned.rows[0].photo_file_id)},{returned_by:Number(employee.user.id),checked_by:Number(manager.user.id),condition_code:'DAMAGED',note:'외관 긁힘 확인',accessories:['충전기','케이스'],photo_file_id:Number(fileId)});
    const ended=await pool.query('SELECT status,return_condition,returned_by,return_checked_by,return_note,accessories FROM asset_assignments WHERE id=$1',[assignmentId]); assert.equal(ended.rows[0].status,'ENDED'); assert.equal(ended.rows[0].return_condition,'DAMAGED'); assert.equal((await pool.query('SELECT status_code FROM assets WHERE id=$1',[assetId])).rows[0].status_code,'RETURNED');
  } finally {
    await removeTestSessions(pool,[manager,employee]);
    if(requestId){await pool.query("DELETE FROM outbox_events WHERE aggregate_type='REQUEST' AND aggregate_id=$1",[String(requestId)]);await pool.query("DELETE FROM audit_logs WHERE entity_type='REQUEST' AND entity_id=$1",[String(requestId)]);}
    if(assetId){await pool.query("DELETE FROM outbox_events WHERE aggregate_type='ASSET' AND aggregate_id=$1",[String(assetId)]);await pool.query('DELETE FROM asset_status_histories WHERE asset_id=$1',[assetId]);}
    if(requestId) await pool.query('DELETE FROM asset_return_records WHERE request_id=$1',[requestId]);
    if(requestId) await pool.query('DELETE FROM workflow_requests WHERE id=$1',[requestId]);
    if(assignmentId) await pool.query('DELETE FROM asset_assignments WHERE id=$1',[assignmentId]);
    if(fileId){await pool.query('DELETE FROM asset_files WHERE file_id=$1',[fileId]);await pool.query('DELETE FROM file_records WHERE id=$1',[fileId]);}
    if(assetId) await pool.query('DELETE FROM assets WHERE id=$1',[assetId]);
    await pool.end();
  }
});
