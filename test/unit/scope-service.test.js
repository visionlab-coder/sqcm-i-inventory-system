const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveScope, canAccessDepartment, requireDepartmentAccess } = require('../../src/services/scope-service');

function poolWith(scopeRows, departmentRows = []) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async query(sql) {
      calls += 1;
      if (sql.includes('user_role_scopes')) return { rows: scopeRows, rowCount: scopeRows.length };
      return { rows: departmentRows, rowCount: departmentRows.length };
    }
  };
}

test('DEPARTMENT 범위는 기준 부서와 활성 하위 부서를 포함한다', async () => {
  const pool = poolWith([{ scope_type:'DEPARTMENT', organization_id:1, department_id:10 }], [{ id:10 }, { id:11 }, { id:12 }]);
  const scope = await resolveScope(pool, { id:7, role:'MANAGER', organizationId:1, departmentId:10 });
  assert.deepEqual(scope, { scopeType:'DEPARTMENT', organizationId:1, departmentIds:[10,11,12], selfUserId:null });
  assert.equal(canAccessDepartment(scope, 11), true);
  assert.equal(canAccessDepartment(scope, 99), false);
});

test('복수 범위가 있으면 가장 넓은 범위를 선택하고 하위 부서 조회를 생략한다', async () => {
  const pool = poolWith([
    { scope_type:'SELF', organization_id:1, department_id:10 },
    { scope_type:'ORGANIZATION', organization_id:1, department_id:null }
  ]);
  const scope = await resolveScope(pool, { id:7, role:'MANAGER', organizationId:1, departmentId:10 });
  assert.equal(scope.scopeType, 'ORGANIZATION');
  assert.equal(scope.departmentIds, null);
  assert.equal(pool.calls, 1);
});

test('허용되지 않은 부서 접근은 403으로 거부한다', async () => {
  const pool = poolWith([{ scope_type:'DEPARTMENT', organization_id:1, department_id:10 }], [{ id:10 }]);
  await assert.rejects(() => requireDepartmentAccess(pool, { id:7, role:'USER', organizationId:1, departmentId:10 }, 20), error => error.status === 403);
});
