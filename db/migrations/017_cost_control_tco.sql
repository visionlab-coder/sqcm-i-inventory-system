-- Phase 53: auditable TCO facts. Recommendations may only use these recorded facts.
CREATE TABLE IF NOT EXISTS asset_financial_profiles (
  asset_id BIGINT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  useful_life_months INTEGER NOT NULL DEFAULT 60 CHECK (useful_life_months BETWEEN 1 AND 600),
  salvage_value NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE','NONE')),
  warranty_end DATE,
  lease_end DATE,
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_financial_org ON asset_financial_profiles(organization_id, warranty_end);

CREATE TABLE IF NOT EXISTS asset_cost_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  asset_id BIGINT REFERENCES assets(id),
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('ACQUISITION','REPAIR','TRANSFER','DISPOSAL','LEASE','OTHER')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type VARCHAR(40),
  source_id VARCHAR(100),
  note VARCHAR(500),
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_type, source_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_asset_cost_events_org_time ON asset_cost_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_cost_events_asset ON asset_cost_events(asset_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS cost_budgets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  cost_center VARCHAR(50) NOT NULL,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, cost_center, fiscal_year)
);

INSERT INTO asset_financial_profiles(asset_id,organization_id,useful_life_months,salvage_value,updated_by)
SELECT a.id,a.organization_id,60,0,a.created_by FROM assets a
ON CONFLICT(asset_id) DO NOTHING;
INSERT INTO asset_cost_events(organization_id,asset_id,event_type,amount,occurred_at,source_type,source_id,note,created_by)
SELECT a.organization_id,a.id,'ACQUISITION',a.acquisition_cost,COALESCE(a.acquired_at::timestamptz,a.created_at),'ASSET',a.id::text,'초기 자산 취득 원장',a.created_by
FROM assets a WHERE a.acquisition_cost IS NOT NULL AND a.acquisition_cost > 0
ON CONFLICT(organization_id,source_type,source_id,event_type) DO NOTHING;
