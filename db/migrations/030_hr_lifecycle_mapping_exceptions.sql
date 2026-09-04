CREATE TABLE IF NOT EXISTS hr_organization_mappings (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id VARCHAR(128) NOT NULL,
  external_organization_code VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_id, external_organization_code)
);

CREATE TABLE IF NOT EXISTS hr_department_mappings (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id VARCHAR(128) NOT NULL,
  external_department_code VARCHAR(80) NOT NULL,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_id, external_department_code)
);

CREATE TABLE IF NOT EXISTS hr_employee_links (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id VARCHAR(128) NOT NULL,
  employee_external_id VARCHAR(128) NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_id, employee_external_id),
  UNIQUE (organization_id, provider_id, user_id)
);

CREATE TABLE IF NOT EXISTS hr_lifecycle_exceptions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inbox_event_id BIGINT NOT NULL REFERENCES hr_integration_inbox(id) ON DELETE CASCADE,
  reason_code VARCHAR(100) NOT NULL,
  safe_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
  assigned_to BIGINT REFERENCES users(id),
  resolved_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (inbox_event_id, reason_code),
  CHECK ((status='OPEN' AND resolved_at IS NULL) OR (status<>'OPEN' AND resolved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_hr_lifecycle_exceptions_open
  ON hr_lifecycle_exceptions (organization_id, created_at, id) WHERE status='OPEN';
