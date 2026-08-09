-- Phase 54: durable rule execution is owned by a separate worker, not the web process.
CREATE TABLE IF NOT EXISTS automation_rules (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  code VARCHAR(60) NOT NULL,
  rule_type VARCHAR(40) NOT NULL CHECK (rule_type IN ('IDLE_ASSET','OVERDUE_ASSIGNMENT','WARRANTY_EXPIRY','APPROVAL_SLA')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES automation_rules(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED')),
  matched_count INTEGER NOT NULL DEFAULT 0 CHECK(matched_count >= 0),
  error_message VARCHAR(500)
);
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  recipient_user_id BIGINT REFERENCES users(id),
  rule_id BIGINT REFERENCES automation_rules(id),
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO','WARNING','CRITICAL')),
  title VARCHAR(200) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  entity_type VARCHAR(40),
  entity_id VARCHAR(100),
  dedupe_key VARCHAR(160) NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dedupe_key)
);
CREATE TABLE IF NOT EXISTS automation_leases (
  lease_name VARCHAR(80) PRIMARY KEY,
  owner_id VARCHAR(100) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(organization_id, recipient_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_rules_due ON automation_rules(organization_id, is_active, rule_type);

INSERT INTO automation_rules(organization_id,code,rule_type,config,created_by)
SELECT o.id,v.code,v.rule_type,v.config::jsonb,(SELECT id FROM users WHERE organization_id=o.id ORDER BY id LIMIT 1)
FROM organizations o CROSS JOIN (VALUES
  ('idle-assets','IDLE_ASSET','{"days":30}'),
  ('overdue-assignments','OVERDUE_ASSIGNMENT','{"days":1}'),
  ('warranty-expiry-90d','WARRANTY_EXPIRY','{"days":90}'),
  ('approval-sla-48h','APPROVAL_SLA','{"hours":48}')
) v(code,rule_type,config) ON CONFLICT(organization_id,code) DO NOTHING;
