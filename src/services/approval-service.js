const { DomainError, positiveInteger } = require('./inventory-service');

const REQUEST_TYPES = new Set(['ASSIGN','RETURN','TRANSFER','REPAIR','LOST','PURCHASE','DISPOSAL']);
const APPROVER_ROLES = new Set(['MANAGER','ADMIN']);
const DEPARTMENT_SCOPES = new Set(['REQUEST_DEPARTMENT','ORGANIZATION']);

function requireAdmin(user) {
  if (!user || user.role !== 'ADMIN') throw new DomainError('승인 정책을 관리할 권한이 없습니다.', 403);
}

function adminOrganization(user, value) {
  requireAdmin(user);
  const organizationId = positiveInteger(value || user.organizationId, '조직');
  if (!user.isSystemAdmin && Number(user.organizationId) !== organizationId) throw new DomainError('다른 조직에 접근할 수 없습니다.', 403);
  return organizationId;
}

function normalizeApprovalPolicy(input = {}) {
  const name = String(input.name || '').trim();
  const requestType = String(input.requestType || '').trim().toUpperCase();
  const amountMin = input.amountMin === '' || input.amountMin == null ? null : Number(input.amountMin);
  const amountMax = input.amountMax === '' || input.amountMax == null ? null : Number(input.amountMax);
  const priority = Number(input.priority || 0);
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  if (name.length < 2 || name.length > 120) throw new DomainError('승인 정책명은 2~120자여야 합니다.');
  if (!REQUEST_TYPES.has(requestType)) throw new DomainError('올바른 요청 유형이 필요합니다.');
  if ((amountMin != null && (!Number.isFinite(amountMin) || amountMin < 0)) || (amountMax != null && (!Number.isFinite(amountMax) || amountMax < 0))) throw new DomainError('금액 구간은 0 이상의 숫자여야 합니다.');
  if (amountMin != null && amountMax != null && amountMin > amountMax) throw new DomainError('최소 금액은 최대 금액보다 클 수 없습니다.');
  if (!Number.isInteger(priority) || priority < 0 || priority > 999) throw new DomainError('정책 우선순위는 0~999 정수여야 합니다.');
  if (rawSteps.length < 1 || rawSteps.length > 10) throw new DomainError('승인 단계는 1~10개여야 합니다.');
  const steps = rawSteps.map((step,index) => {
    const stepName = String(step.name || `${index + 1}단계 승인`).trim();
    const approverRole = String(step.approverRole || '').toUpperCase();
    const departmentScope = String(step.departmentScope || 'REQUEST_DEPARTMENT').toUpperCase();
    if (stepName.length < 2 || stepName.length > 100) throw new DomainError(`${index + 1}단계 이름은 2~100자여야 합니다.`);
    if (!APPROVER_ROLES.has(approverRole)) throw new DomainError(`${index + 1}단계 승인 역할이 올바르지 않습니다.`);
    if (!DEPARTMENT_SCOPES.has(departmentScope)) throw new DomainError(`${index + 1}단계 부서 범위가 올바르지 않습니다.`);
    return { stepOrder:index + 1, name:stepName, approverRole, departmentScope };
  });
  return { name, requestType, amountMin, amountMax, priority, steps };
}

async function ensureDefaultPolicy(client, request, userId) {
  const policy = await client.query(`INSERT INTO approval_policies(organization_id,name,request_type,is_default,active,created_by)
    VALUES($1,'기본 1단계 승인',$2,true,true,$3)
    ON CONFLICT(organization_id,request_type) WHERE is_default AND active DO UPDATE SET updated_at=now()
    RETURNING *`, [request.organization_id,request.request_type,userId]);
  await client.query(`INSERT INTO approval_policy_steps(policy_id,step_order,name,approver_role,department_scope)
    VALUES($1,1,'관리자 승인','MANAGER','REQUEST_DEPARTMENT') ON CONFLICT(policy_id,step_order) DO NOTHING`, [policy.rows[0].id]);
  return policy.rows[0];
}

function requestAmount(request) {
  if (request.request_type !== 'PURCHASE') return 0;
  const amount = Number(request.payload?.estimatedAmount || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

async function initializeApprovalPlan(client, request, userId) {
  const existing = await client.query('SELECT count(*)::int count FROM workflow_request_approvals WHERE request_id=$1', [request.id]);
  if (existing.rows[0].count) throw new DomainError('이미 승인 단계가 생성된 요청입니다.', 409);
  const amount = requestAmount(request);
  let selected = await client.query(`SELECT * FROM approval_policies WHERE organization_id=$1 AND request_type=$2 AND active
    AND (amount_min IS NULL OR amount_min <= $3) AND (amount_max IS NULL OR amount_max >= $3)
    ORDER BY is_default ASC,priority DESC,created_at DESC LIMIT 1 FOR SHARE`, [request.organization_id,request.request_type,amount]);
  if (!selected.rowCount) selected = { rows:[await ensureDefaultPolicy(client,request,userId)] };
  const policy = selected.rows[0];
  const steps = await client.query('SELECT * FROM approval_policy_steps WHERE policy_id=$1 ORDER BY step_order', [policy.id]);
  if (!steps.rowCount) throw new DomainError('승인 정책에 단계가 없습니다.', 409);
  for (const step of steps.rows) {
    await client.query(`INSERT INTO workflow_request_approvals(request_id,policy_id,policy_step_id,step_order,step_name,approver_role,department_scope)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [request.id,policy.id,step.id,step.step_order,step.name,step.approver_role,step.department_scope]);
  }
  await client.query('UPDATE workflow_requests SET approval_policy_id=$1,current_approval_step=1,approval_step_count=$2 WHERE id=$3', [policy.id,steps.rowCount,request.id]);
  return { policy, steps:steps.rows };
}

async function getCurrentApproval(client, requestId) {
  const result = await client.query(`SELECT a.*,p.organization_id,p.request_type FROM workflow_request_approvals a
    JOIN approval_policies p ON p.id=a.policy_id WHERE a.request_id=$1 AND a.status='PENDING' ORDER BY a.step_order LIMIT 1 FOR UPDATE OF a`, [requestId]);
  return result.rows[0] || null;
}

function requireStepRole(user, approval) {
  if (user.isSystemAdmin || user.role === 'ADMIN') return;
  if (user.role !== approval.approver_role) throw new DomainError(`${approval.step_name}은 ${approval.approver_role} 역할만 처리할 수 있습니다.`, 403);
}

async function createApprovalPolicy(pool, user, organizationIdValue, input, trace = {}) {
  const organizationId = adminOrganization(user,organizationIdValue);
  const normalized = normalizeApprovalPolicy(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const policy = await client.query(`INSERT INTO approval_policies(organization_id,name,request_type,amount_min,amount_max,priority,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [organizationId,normalized.name,normalized.requestType,normalized.amountMin,normalized.amountMax,normalized.priority,user.id]);
    for (const step of normalized.steps) await client.query(`INSERT INTO approval_policy_steps(policy_id,step_order,name,approver_role,department_scope) VALUES($1,$2,$3,$4,$5)`, [policy.rows[0].id,step.stepOrder,step.name,step.approverRole,step.departmentScope]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'APPROVAL_POLICY_CREATED','APPROVAL_POLICY',$2,$3::jsonb,$4,$5)`, [user.id,String(policy.rows[0].id),JSON.stringify({requestType:normalized.requestType,stepCount:normalized.steps.length,amountMin:normalized.amountMin,amountMax:normalized.amountMax}),trace.requestId||null,trace.ip||null]);
    await client.query('COMMIT');
    return { ...policy.rows[0], steps:normalized.steps };
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function listApprovalPolicies(pool, user, organizationIdValue) {
  const organizationId = adminOrganization(user,organizationIdValue);
  const result = await pool.query(`SELECT p.*,coalesce(json_agg(json_build_object('id',s.id,'stepOrder',s.step_order,'name',s.name,'approverRole',s.approver_role,'departmentScope',s.department_scope) ORDER BY s.step_order) FILTER(WHERE s.id IS NOT NULL),'[]') steps
    FROM approval_policies p LEFT JOIN approval_policy_steps s ON s.policy_id=p.id WHERE p.organization_id=$1 GROUP BY p.id ORDER BY p.request_type,p.is_default,p.priority DESC,p.created_at DESC`, [organizationId]);
  return result.rows;
}

module.exports = { normalizeApprovalPolicy, requestAmount, initializeApprovalPlan, getCurrentApproval, requireStepRole, createApprovalPolicy, listApprovalPolicies };
