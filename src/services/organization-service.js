const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');

const UNIT_TYPES = new Set(['CORPORATE', 'HEADQUARTERS', 'DEPARTMENT', 'TEAM']);
const INVITABLE_ROLES = new Set(['USER', 'MANAGER']);
const SCOPE_TYPES = new Set(['ORGANIZATION', 'DEPARTMENT']);

function validation(field, message) {
  const error = new DomainError(message);
  error.code = 'VALIDATION_ERROR';
  error.fieldErrors = [{ field, message }];
  throw error;
}

function normalizeOrganizationUnit(input = {}) {
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const unitType = String(input.unitType || 'DEPARTMENT').trim().toUpperCase();
  const costCenter = String(input.costCenter || '').trim().toUpperCase() || null;
  const parentId = input.parentId ? positiveInteger(input.parentId, '상위 조직') : null;
  if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code)) validation('code', '조직 코드는 영문·숫자·하이픈·밑줄 2~30자로 입력하세요.');
  if (name.length < 2 || name.length > 100) validation('name', '조직명은 2~100자로 입력하세요.');
  if (!UNIT_TYPES.has(unitType)) validation('unitType', '올바른 조직 단위 유형이 아닙니다.');
  if (costCenter && !/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(costCenter)) validation('costCenter', '비용센터는 영문·숫자·하이픈·밑줄 2~50자로 입력하세요.');
  if (unitType !== 'CORPORATE' && !parentId) validation('parentId', '법인을 제외한 조직 단위에는 상위 조직이 필요합니다.');
  if (unitType === 'CORPORATE' && parentId) validation('parentId', '법인은 상위 조직을 지정할 수 없습니다.');
  return { code, name, unitType, costCenter, parentId };
}

function normalizeInvitation(input = {}) {
  const email = String(input.email || '').trim().toLowerCase();
  const displayName = String(input.displayName || '').trim();
  const role = String(input.role || 'USER').trim().toUpperCase();
  const scopeType = String(input.scopeType || 'DEPARTMENT').trim().toUpperCase();
  const departmentId = input.departmentId ? positiveInteger(input.departmentId, '소속 조직') : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) validation('email', '올바른 이메일을 입력하세요.');
  if (displayName.length < 2 || displayName.length > 100) validation('displayName', '이름은 2~100자로 입력하세요.');
  if (!INVITABLE_ROLES.has(role)) validation('role', '초대 역할은 USER 또는 MANAGER여야 합니다.');
  if (!SCOPE_TYPES.has(scopeType)) validation('scopeType', '올바른 데이터 범위를 선택하세요.');
  if (scopeType === 'DEPARTMENT' && !departmentId) validation('departmentId', '부서 범위에는 소속 조직이 필요합니다.');
  return { email, displayName, role, scopeType, departmentId };
}

function validatePassword(password) {
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    validation('newPassword', '비밀번호는 12자 이상이며 대문자·소문자·숫자·특수문자를 포함해야 합니다.');
  }
}

async function createOrganizationUnit(pool, user, organizationIdInput, input, trace = {}) {
  requirePermission(user, 'admin.manage');
  const organizationId = requireOrganization(user, organizationIdInput || user.organizationId);
  const unit = normalizeOrganizationUnit(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (unit.parentId) {
      const parent = await client.query('SELECT id,organization_id,unit_type FROM departments WHERE id=$1 AND status=\'ACTIVE\'', [unit.parentId]);
      if (!parent.rowCount || Number(parent.rows[0].organization_id) !== organizationId) throw new DomainError('같은 조직의 활성 상위 조직이 필요합니다.', 409);
      if (parent.rows[0].unit_type === 'TEAM') throw new DomainError('팀 아래에 하위 조직을 만들 수 없습니다.', 409);
    }
    const result = await client.query(`INSERT INTO departments(organization_id,parent_id,code,name,cost_center,unit_type)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [organizationId, unit.parentId, unit.code, unit.name, unit.costCenter, unit.unitType]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'ORGANIZATION_UNIT_CREATED','DEPARTMENT',$2,$3::jsonb,$4,$5)`, [user.id, String(result.rows[0].id), JSON.stringify({ unitType: unit.unitType, parentId: unit.parentId }), trace.requestId || null, trace.ip || null]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('이미 사용 중인 조직 코드입니다.', 409);
    throw error;
  } finally { client.release(); }
}

async function createInvitation(pool, user, organizationIdInput, input, trace = {}) {
  requirePermission(user, 'admin.manage');
  const organizationId = requireOrganization(user, organizationIdInput || user.organizationId);
  const invitation = normalizeInvitation(input);
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE lower(email)=$1', [invitation.email]);
    if (existing.rowCount) throw new DomainError('이미 등록된 이메일입니다.', 409);
    if (invitation.departmentId) {
      const department = await client.query("SELECT id FROM departments WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'", [invitation.departmentId, organizationId]);
      if (!department.rowCount) throw new DomainError('같은 조직의 활성 소속 조직이 필요합니다.', 409);
    }
    const result = await client.query(`INSERT INTO user_invitations(organization_id,department_id,email,display_name,role,scope_type,token_hash,expires_at,invited_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '48 hours',$8)
      RETURNING id,organization_id,department_id,email,display_name,role,scope_type,expires_at,created_at`,
    [organizationId, invitation.departmentId, invitation.email, invitation.displayName, invitation.role, invitation.scopeType, tokenHash, user.id]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'USER_INVITED','USER_INVITATION',$2,$3::jsonb,$4,$5)`, [user.id, String(result.rows[0].id), JSON.stringify({ email: invitation.email, role: invitation.role, scopeType: invitation.scopeType }), trace.requestId || null, trace.ip || null]);
    await client.query('COMMIT');
    return { invitation: result.rows[0], rawToken };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('해당 이메일의 유효한 초대가 이미 있습니다.', 409);
    throw error;
  } finally { client.release(); }
}

async function revokeInvitation(pool, user, invitationId, trace = {}) {
  requirePermission(user, 'admin.manage');
  const id = positiveInteger(invitationId, '초대번호');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM user_invitations WHERE id=$1 FOR UPDATE`, [id]);
    if (!found.rowCount) throw new DomainError('초대를 찾을 수 없습니다.', 404);
    requireOrganization(user, found.rows[0].organization_id);
    if (found.rows[0].accepted_at || found.rows[0].revoked_at) throw new DomainError('처리 완료된 초대는 취소할 수 없습니다.', 409);
    const result = await client.query('UPDATE user_invitations SET revoked_at=now() WHERE id=$1 RETURNING id,revoked_at', [id]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'USER_INVITATION_REVOKED','USER_INVITATION',$2,'{}'::jsonb,$3,$4)`, [user.id, String(id), trace.requestId || null, trace.ip || null]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function acceptInvitation(pool, token, password, trace = {}) {
  const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  validatePassword(String(password || ''));
  const passwordHash = await bcrypt.hash(String(password), 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT * FROM user_invitations
      WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE`, [tokenHash]);
    if (!found.rowCount) throw new DomainError('유효하지 않거나 만료된 초대 토큰입니다.', 400);
    const invite = found.rows[0];
    const created = await client.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id,department_id)
      VALUES($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING id,email,display_name,role,status,organization_id,department_id`,
    [invite.email, invite.display_name, passwordHash, invite.role, invite.organization_id, invite.department_id]);
    const user = created.rows[0];
    await client.query(`INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type)
      VALUES($1,$2,$3,$4,$5)`, [user.id, invite.role, invite.organization_id, invite.scope_type === 'DEPARTMENT' ? invite.department_id : null, invite.scope_type]);
    await client.query('UPDATE user_invitations SET accepted_at=now() WHERE id=$1', [invite.id]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,'USER_INVITATION_ACCEPTED','USER',$2,$3::jsonb,$4,$5)`, [user.id, String(user.id), JSON.stringify({ invitationId: invite.id, scopeType: invite.scope_type }), trace.requestId || null, trace.ip || null]);
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw new DomainError('이미 등록되었거나 처리된 초대입니다.', 409);
    throw error;
  } finally { client.release(); }
}

module.exports = { UNIT_TYPES, normalizeOrganizationUnit, normalizeInvitation, validatePassword, createOrganizationUnit, createInvitation, revokeInvitation, acceptInvitation };
