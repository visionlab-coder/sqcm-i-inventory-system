ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS unit_type VARCHAR(20) NOT NULL DEFAULT 'DEPARTMENT';

UPDATE departments SET unit_type='HEADQUARTERS' WHERE code='HQ' AND unit_type='DEPARTMENT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='departments_unit_type_check'
      AND conrelid='departments'::regclass
  ) THEN
    ALTER TABLE departments ADD CONSTRAINT departments_unit_type_check
      CHECK (unit_type IN ('CORPORATE','HEADQUARTERS','DEPARTMENT','TEAM'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_departments_organization ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_invitations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  department_id BIGINT REFERENCES departments(id),
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  scope_type VARCHAR(20) NOT NULL DEFAULT 'DEPARTMENT',
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role IN ('USER','MANAGER')),
  CHECK (scope_type IN ('ORGANIZATION','DEPARTMENT')),
  CHECK (expires_at > created_at),
  CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK (scope_type <> 'DEPARTMENT' OR department_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_organization ON user_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_department ON user_invitations(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_invitations_invited_by ON user_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires ON user_invitations(expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invitations_pending_email
  ON user_invitations(organization_id,lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_role_scopes_user ON user_role_scopes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_scopes_organization ON user_role_scopes(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_role_scopes_department ON user_role_scopes(department_id) WHERE department_id IS NOT NULL;
