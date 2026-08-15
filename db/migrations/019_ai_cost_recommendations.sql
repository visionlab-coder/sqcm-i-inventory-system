-- Phase 55: AI-facing records are explainable, versioned, organization-scoped, and approval-gated.
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_id BIGINT REFERENCES assets(id), request_id BIGINT REFERENCES workflow_requests(id),
  action_type VARCHAR(30) NOT NULL CHECK(action_type IN ('TRANSFER','REPAIR','REPLACE','HOLD')), estimated_cost NUMERIC(15,2) CHECK(estimated_cost IS NULL OR estimated_cost >= 0), avoided_cost NUMERIC(15,2) CHECK(avoided_cost IS NULL OR avoided_cost >= 0), confidence NUMERIC(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1), provider VARCHAR(80) NOT NULL, model_version VARCHAR(80) NOT NULL, evidence JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','APPROVED','REJECTED','EXPIRED')), created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_org ON ai_recommendations(organization_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS document_extractions (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_id BIGINT REFERENCES assets(id), source_file_id BIGINT REFERENCES file_records(id), provider VARCHAR(80) NOT NULL, model_version VARCHAR(80) NOT NULL, status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','COMPLETED','FAILED','NOT_CONFIGURED')), fields JSONB NOT NULL DEFAULT '{}'::jsonb, confidence JSONB NOT NULL DEFAULT '{}'::jsonb, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_extractions_org ON document_extractions(organization_id, created_at DESC);
CREATE TABLE IF NOT EXISTS asset_anomalies (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_id BIGINT REFERENCES assets(id), anomaly_type VARCHAR(40) NOT NULL, severity VARCHAR(20) NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')), score NUMERIC(8,4) NOT NULL CHECK(score >= 0), evidence JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')), detected_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (organization_id, asset_id, anomaly_type, detected_at)
);
CREATE INDEX IF NOT EXISTS idx_asset_anomalies_open ON asset_anomalies(organization_id, status, detected_at DESC);
