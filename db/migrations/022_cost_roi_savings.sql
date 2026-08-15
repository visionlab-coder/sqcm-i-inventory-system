-- Phase 63: realized cost avoidance and vendor performance facts.
CREATE TABLE IF NOT EXISTS cost_savings_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  asset_id BIGINT REFERENCES assets(id),
  request_id BIGINT REFERENCES workflow_requests(id),
  savings_type VARCHAR(40) NOT NULL CHECK (savings_type IN ('TRANSFER_AVOIDED_PURCHASE','REPAIR_AVOIDED_REPLACE','REUSE_AVOIDED_PURCHASE','DISPOSAL_RECOVERY')),
  baseline_cost NUMERIC(15,2) NOT NULL CHECK (baseline_cost >= 0),
  actual_cost NUMERIC(15,2) NOT NULL CHECK (actual_cost >= 0),
  avoided_amount NUMERIC(15,2) NOT NULL CHECK (avoided_amount >= 0),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  realized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_savings_org_time ON cost_savings_events(organization_id, realized_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_savings_asset ON cost_savings_events(asset_id, realized_at DESC);
