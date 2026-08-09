CREATE TABLE IF NOT EXISTS approval_policies (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  name VARCHAR(120) NOT NULL,
  request_type VARCHAR(30) NOT NULL,
  amount_min NUMERIC(15,2) CHECK(amount_min IS NULL OR amount_min >= 0),
  amount_max NUMERIC(15,2) CHECK(amount_max IS NULL OR amount_max >= 0),
  priority INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(request_type IN ('ASSIGN','RETURN','TRANSFER','REPAIR','LOST','PURCHASE','DISPOSAL')),
  CHECK(amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_policy_default
  ON approval_policies(organization_id,request_type) WHERE is_default AND active;
CREATE INDEX IF NOT EXISTS idx_approval_policy_match
  ON approval_policies(organization_id,request_type,active,priority DESC);

CREATE TABLE IF NOT EXISTS approval_policy_steps (
  id BIGSERIAL PRIMARY KEY,
  policy_id BIGINT NOT NULL REFERENCES approval_policies(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK(step_order BETWEEN 1 AND 10),
  name VARCHAR(100) NOT NULL,
  approver_role VARCHAR(20) NOT NULL,
  department_scope VARCHAR(30) NOT NULL DEFAULT 'REQUEST_DEPARTMENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(policy_id,step_order),
  CHECK(approver_role IN ('MANAGER','ADMIN')),
  CHECK(department_scope IN ('REQUEST_DEPARTMENT','ORGANIZATION'))
);

ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS approval_policy_id BIGINT REFERENCES approval_policies(id);
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS current_approval_step INTEGER;
ALTER TABLE workflow_requests ADD COLUMN IF NOT EXISTS approval_step_count INTEGER NOT NULL DEFAULT 0 CHECK(approval_step_count BETWEEN 0 AND 10);

CREATE TABLE IF NOT EXISTS workflow_request_approvals (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES workflow_requests(id) ON DELETE CASCADE,
  policy_id BIGINT NOT NULL REFERENCES approval_policies(id),
  policy_step_id BIGINT NOT NULL REFERENCES approval_policy_steps(id),
  step_order INTEGER NOT NULL CHECK(step_order BETWEEN 1 AND 10),
  step_name VARCHAR(100) NOT NULL,
  approver_role VARCHAR(20) NOT NULL,
  department_scope VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  acted_by BIGINT REFERENCES users(id),
  reason VARCHAR(1000),
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id,step_order),
  CHECK(status IN ('PENDING','APPROVED','REJECTED','SKIPPED'))
);
CREATE INDEX IF NOT EXISTS idx_request_approvals_pending ON workflow_request_approvals(request_id,status,step_order);

INSERT INTO approval_policies(organization_id,name,request_type,is_default,active)
SELECT o.id,'기본 1단계 승인',t.request_type,true,true
FROM organizations o
CROSS JOIN (VALUES('ASSIGN'),('RETURN'),('TRANSFER'),('REPAIR'),('LOST'),('PURCHASE'),('DISPOSAL')) t(request_type)
ON CONFLICT (organization_id,request_type) WHERE is_default AND active DO NOTHING;

INSERT INTO approval_policy_steps(policy_id,step_order,name,approver_role,department_scope)
SELECT p.id,1,'관리자 승인','MANAGER','REQUEST_DEPARTMENT'
FROM approval_policies p WHERE p.is_default AND p.active
ON CONFLICT(policy_id,step_order) DO NOTHING;

INSERT INTO workflow_request_approvals(request_id,policy_id,policy_step_id,step_order,step_name,approver_role,department_scope)
SELECT r.id,p.id,s.id,1,s.name,s.approver_role,s.department_scope
FROM workflow_requests r
JOIN approval_policies p ON p.organization_id=r.organization_id AND p.request_type=r.request_type AND p.is_default AND p.active
JOIN approval_policy_steps s ON s.policy_id=p.id AND s.step_order=1
WHERE r.status='SUBMITTED'
ON CONFLICT(request_id,step_order) DO NOTHING;

UPDATE workflow_requests r SET approval_policy_id=a.policy_id,current_approval_step=1,approval_step_count=1
FROM workflow_request_approvals a WHERE a.request_id=r.id AND r.status='SUBMITTED' AND r.approval_step_count=0;
