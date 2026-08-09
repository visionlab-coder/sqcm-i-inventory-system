const { DomainError } = require('./inventory-service');

const PRIORITY = { ALL: 4, ORGANIZATION: 3, DEPARTMENT: 2, SELF: 1 };

async function resolveScope(pool, user) {
  if (!user) throw new DomainError('로그인이 필요합니다.', 401);
  const result = await pool.query(`SELECT scope_type,organization_id,department_id FROM user_role_scopes
    WHERE user_id=$1 AND role_code=$2 ORDER BY created_at`, [user.id, user.role]);
  const selected = result.rows.sort((a,b)=>(PRIORITY[b.scope_type]||0)-(PRIORITY[a.scope_type]||0))[0];
  const scopeType = selected?.scope_type || (user.isSystemAdmin ? 'ALL' : user.role === 'ADMIN' ? 'ORGANIZATION' : user.role === 'MANAGER' ? 'ORGANIZATION' : 'DEPARTMENT');
  const departmentId = selected?.department_id || user.departmentId || null;
  if (scopeType === 'DEPARTMENT' && !departmentId) throw new DomainError('부서 범위 사용자에게 기준 부서가 없습니다.', 403);
  if (scopeType === 'ALL' || scopeType === 'ORGANIZATION') return { scopeType, organizationId: Number(selected?.organization_id || user.organizationId), departmentIds: null, selfUserId: null };
  if (scopeType === 'SELF') return { scopeType, organizationId: Number(user.organizationId), departmentIds: departmentId ? [Number(departmentId)] : [], selfUserId: Number(user.id) };
  const departments = await pool.query(`WITH RECURSIVE tree AS (
      SELECT id FROM departments WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'
      UNION ALL SELECT d.id FROM departments d JOIN tree t ON d.parent_id=t.id WHERE d.organization_id=$2 AND d.status='ACTIVE'
    ) SELECT id FROM tree ORDER BY id`, [departmentId, user.organizationId]);
  if (!departments.rowCount) throw new DomainError('허용된 활성 부서 범위를 찾을 수 없습니다.', 403);
  return { scopeType, organizationId: Number(user.organizationId), departmentIds: departments.rows.map(row=>Number(row.id)), selfUserId: null };
}

function canAccessDepartment(scope, departmentId) {
  if (scope.scopeType === 'ALL' || scope.scopeType === 'ORGANIZATION') return true;
  return departmentId != null && scope.departmentIds.includes(Number(departmentId));
}

async function requireDepartmentAccess(pool, user, departmentId) {
  const scope = await resolveScope(pool, user);
  if (!canAccessDepartment(scope, departmentId)) throw new DomainError('허용된 부서 범위를 벗어났습니다.', 403);
  return scope;
}

module.exports = { resolveScope, canAccessDepartment, requireDepartmentAccess };
