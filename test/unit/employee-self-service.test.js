const test = require('node:test');
const assert = require('node:assert/strict');
const { getEmployeeSelfService, createEmployeeAssetRequest } = require('../../src/services/employee-self-service');

const user = { id: 7, role: 'USER', organizationId: 3, departmentId: 2, isSystemAdmin: false };

test('직원 셀프서비스 요약은 사용자 ID로 자산·요청·수리·알림을 모두 제한한다', async () => {
  const calls = [];
  const responses = [
    { rows:[{ id:11, asset_tag:'IT-011', status_code:'IN_USE' }], rowCount:1 },
    { rows:[{ id:21, status:'SUBMITTED' },{ id:22, status:'COMPLETED' }], rowCount:2 },
    { rows:[{ id:31, status:'OPEN' }], rowCount:1 },
    { rows:[{ id:41, read_at:null },{ id:42, read_at:new Date() }], rowCount:2 },
    { rows:[{ active_requests:1, open_repairs:1, unread_notifications:1 }], rowCount:1 }
  ];
  const pool = { query: async (sql, values) => { calls.push({ sql, values }); return responses[calls.length - 1]; } };
  const result = await getEmployeeSelfService(pool, user);
  assert.deepEqual(result.summary, { assignedAssets:1, activeRequests:1, openRepairs:1, unreadNotifications:1 });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.values[0] === 3 && call.values[1] === 7));
  assert.match(calls[0].sql, /aa\.user_id=\$2/);
  assert.match(calls[1].sql, /r\.requester_id=\$2/);
  assert.match(calls[2].sql, /s\.reporter_id=\$2/);
  assert.match(calls[3].sql, /recipient_user_id=\$2/);
});

test('요약 건수는 최근 목록 50/20건 제한과 무관하게 전체 사용자 범위를 집계한다', async () => {
  const calls=[];
  const responses=[
    {rows:[],rowCount:0}, {rows:[],rowCount:0}, {rows:[],rowCount:0}, {rows:[],rowCount:0},
    {rows:[{active_requests:61,open_repairs:52,unread_notifications:25}],rowCount:1}
  ];
  const result=await getEmployeeSelfService({query:async(sql,values)=>{calls.push({sql,values});return responses[calls.length-1];}},user);
  assert.deepEqual(result.summary,{assignedAssets:0,activeRequests:61,openRepairs:52,unreadNotifications:25});
  assert.doesNotMatch(calls[4].sql,/LIMIT/i);
  assert.match(calls[4].sql,/requester_id=\$2/);
  assert.match(calls[4].sql,/reporter_id=\$2/);
  assert.match(calls[4].sql,/recipient_user_id=\$2/);
  assert.deepEqual(calls[4].values,[3,7]);
});

test('직원 요청은 현재 자신에게 배정된 자산만 허용한다', async () => {
  const pool = { query: async () => ({ rows:[], rowCount:0 }) };
  await assert.rejects(() => createEmployeeAssetRequest(pool, user, { assetId:99, requestType:'LOST', reason:'분실 확인 필요' }), error => error.status === 403);
});

test('직원 셀프서비스는 허용되지 않은 업무 유형을 거부한다', async () => {
  const pool = { query: async () => { throw new Error('query must not run'); } };
  await assert.rejects(() => createEmployeeAssetRequest(pool, user, { assetId:11, requestType:'DISPOSAL', reason:'폐기' }), error => error.status === 400);
});
