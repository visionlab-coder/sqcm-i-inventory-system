CREATE TABLE IF NOT EXISTS hr_integration_inbox (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  provider_id VARCHAR(128) NOT NULL,
  external_event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  employee_external_id VARCHAR(128) NOT NULL,
  normalized_payload JSONB NOT NULL,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  last_error_code VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (organization_id, provider_id, external_event_id),
  CHECK (event_type IN ('employee.upserted','employee.transferred','employee.terminated')),
  CHECK (status IN ('RECEIVED','PROCESSING','RETRY_PENDING','APPLIED','REJECTED','DEAD_LETTER')),
  CHECK ((locked_at IS NULL) = (locked_by IS NULL)),
  CHECK (processed_at IS NULL OR status IN ('APPLIED','REJECTED','DEAD_LETTER'))
);

CREATE INDEX IF NOT EXISTS idx_hr_integration_inbox_claim
  ON hr_integration_inbox (next_attempt_at, received_at, id)
  WHERE status IN ('RECEIVED','RETRY_PENDING');

CREATE INDEX IF NOT EXISTS idx_hr_integration_inbox_employee
  ON hr_integration_inbox (organization_id, employee_external_id, occurred_at DESC);
