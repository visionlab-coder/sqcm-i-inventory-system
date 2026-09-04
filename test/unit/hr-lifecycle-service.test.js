const test = require('node:test');
const assert = require('node:assert/strict');

const { applyClaimedHrLifecycleEvent, HrLifecycleError } = require('../../src/services/hr-lifecycle-service');

function recordingPool(handler) {
  const calls = [];
  const client = {
    async query(sql, params = []) { calls.push({ sql, params }); return handler(sql, params, calls); },
    release() { calls.push({ sql: 'RELEASE', params: [] }); }
  };
  return { calls, async connect() { return client; } };
}

function claimed(type = 'employee.transferred') {
  return {
    id: 51, organization_id: 7, provider_id: 'approved-hr', employee_external_id: 'EMP-100',
    event_type: type, status: 'PROCESSING', locked_by: 'worker-1',
    normalized_payload: { schemaVersion: 1, type, occurredAt: '2026-09-04T00:00:00.000Z', employee: {
      employeeId: 'EMP-100', displayName: '홍길동', email: 'worker@example.com', organizationCode: 'SEOWON', departmentCode: 'SITE-01'
    } }
  };
}

test('명시 직원 링크가 없으면 사용자를 만들지 않고 예외 큐와 REJECTED 상태로 격리한다', async () => {
  const pool = recordingPool(async sql => {
    if (sql.includes('FROM hr_integration_inbox') && sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [claimed()] };
    if (sql.includes('FROM hr_organization_mappings')) return { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('FROM hr_employee_links')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [] };
  });
  const result = await applyClaimedHrLifecycleEvent(pool, { id: 51, workerId: 'worker-1' });
  assert.deepEqual(result, { status: 'REJECTED', exception: 'HR_EMPLOYEE_LINK_MISSING' });
  assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO users')), false);
  assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO hr_lifecycle_exceptions')), true);
  assert.equal(pool.calls.some(call => call.sql.includes("status='REJECTED'")), true);
});

test('퇴사자에게 활성 자산이 있으면 계정과 배정을 변경하지 않고 예외 처리한다', async () => {
  const row = claimed('employee.terminated');
  delete row.normalized_payload.employee.departmentCode;
  const pool = recordingPool(async sql => {
    if (sql.includes('FROM hr_integration_inbox') && sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [row] };
    if (sql.includes('FROM hr_organization_mappings')) return { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('FROM hr_employee_links')) return { rowCount: 1, rows: [{ user_id: 11 }] };
    if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [{ id: 11, organization_id: 7, email: 'worker@example.com', status: 'ACTIVE' }] };
    if (sql.includes('count(*)') && sql.includes('asset_assignments')) return { rowCount: 1, rows: [{ count: 2 }] };
    return { rowCount: 1, rows: [] };
  });
  const result = await applyClaimedHrLifecycleEvent(pool, { id: 51, workerId: 'worker-1' });
  assert.deepEqual(result, { status: 'REJECTED', exception: 'HR_TERMINATION_ASSETS_ASSIGNED' });
  assert.equal(pool.calls.some(call => call.sql.includes('UPDATE users SET status')), false);
  assert.equal(pool.calls.some(call => call.sql.includes('UPDATE asset_assignments')), false);
});

test('조직·부서·직원 링크가 모두 일치할 때만 부서 이동을 원자적으로 반영한다', async () => {
  const pool = recordingPool(async sql => {
    if (sql.includes('FROM hr_integration_inbox') && sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [claimed()] };
    if (sql.includes('FROM hr_organization_mappings')) return { rowCount: 1, rows: [{ id: 1 }] };
    if (sql.includes('FROM hr_employee_links')) return { rowCount: 1, rows: [{ user_id: 11 }] };
    if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [{ id: 11, organization_id: 7, email: 'worker@example.com', status: 'ACTIVE' }] };
    if (sql.includes('FROM hr_department_mappings')) return { rowCount: 1, rows: [{ department_id: 21 }] };
    if (sql.includes('FROM departments')) return { rowCount: 1, rows: [{ id: 21, organization_id: 7, status: 'ACTIVE' }] };
    return { rowCount: 1, rows: [] };
  });
  const result = await applyClaimedHrLifecycleEvent(pool, { id: 51, workerId: 'worker-1' });
  assert.deepEqual(result, { status: 'APPLIED', action: 'TRANSFERRED', userId: 11, departmentId: 21 });
  assert.equal(pool.calls.some(call => call.sql.includes('UPDATE users SET department_id')), true);
  assert.equal(pool.calls.some(call => call.sql.includes("status='APPLIED'")), true);
  assert.equal(pool.calls.some(call => call.sql === 'COMMIT'), true);
});

test('lock 소유권이 없으면 아무 변경도 하지 않는다', async () => {
  const pool = recordingPool(async sql => sql.includes('FROM hr_integration_inbox') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [] });
  await assert.rejects(applyClaimedHrLifecycleEvent(pool, { id: 51, workerId: 'worker-1' }), error => error instanceof HrLifecycleError && error.code === 'HR_EVENT_LOCK_NOT_OWNED');
  assert.equal(pool.calls.some(call => call.sql === 'ROLLBACK'), true);
});
