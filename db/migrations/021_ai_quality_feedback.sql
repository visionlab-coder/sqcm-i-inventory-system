-- Phase 62: AI/OCR operations need an auditable feedback and evaluation ledger.
CREATE TABLE IF NOT EXISTS ai_recommendation_feedback (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  asset_id BIGINT REFERENCES assets(id),
  request_id BIGINT REFERENCES workflow_requests(id),
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('TRANSFER','REPAIR','REPLACE','HOLD')),
  decision VARCHAR(30) NOT NULL CHECK (decision IN ('ACCEPTED','REJECTED','EXECUTED','NOT_USEFUL')),
  reason VARCHAR(1000) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  estimated_cost NUMERIC(15,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  avoided_cost NUMERIC(15,2) CHECK (avoided_cost IS NULL OR avoided_cost >= 0),
  confidence NUMERIC(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_org_time ON ai_recommendation_feedback(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_asset ON ai_recommendation_feedback(asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_evaluation_runs (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  provider VARCHAR(80) NOT NULL,
  model_version VARCHAR(80) NOT NULL,
  dataset_version VARCHAR(80) NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
  precision_score NUMERIC(6,5) CHECK (precision_score IS NULL OR precision_score BETWEEN 0 AND 1),
  recall_score NUMERIC(6,5) CHECK (recall_score IS NULL OR recall_score BETWEEN 0 AND 1),
  cost_per_request NUMERIC(15,6) CHECK (cost_per_request IS NULL OR cost_per_request >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','PASSED','FAILED')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_evaluation_org_time ON ai_evaluation_runs(organization_id, created_at DESC);
