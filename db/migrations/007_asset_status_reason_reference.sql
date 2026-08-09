CREATE TABLE IF NOT EXISTS asset_status_definitions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(300),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 999),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  CHECK (code IN ('DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS asset_reason_definitions (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id),
  code VARCHAR(30) NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  name VARCHAR(100) NOT NULL,
  applies_to_status VARCHAR(30),
  requires_detail BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  CHECK (applies_to_status IS NULL OR applies_to_status IN ('DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_asset_status_definitions_org ON asset_status_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_status_definitions_active ON asset_status_definitions(organization_id, sort_order, code) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_asset_reason_definitions_org ON asset_reason_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_asset_reason_definitions_active ON asset_reason_definitions(organization_id, applies_to_status, name) WHERE is_active;

ALTER TABLE asset_status_histories ADD COLUMN IF NOT EXISTS reason_definition_id BIGINT REFERENCES asset_reason_definitions(id);
ALTER TABLE asset_status_histories ADD COLUMN IF NOT EXISTS reason_detail VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_asset_status_histories_reason ON asset_status_histories(reason_definition_id) WHERE reason_definition_id IS NOT NULL;

INSERT INTO asset_status_definitions(organization_id,code,name,sort_order)
SELECT o.id,v.code,v.name,v.sort_order FROM organizations o CROSS JOIN (VALUES
  ('DRAFT','초안',10),('RECEIVED','입고',20),('INSPECTION_PENDING','검수대기',30),('AVAILABLE','사용가능',40),('ASSIGNED','배정',50),('IN_USE','사용중',60),('TRANSFER_PENDING','이관대기',70),('RETURNED','반납',80),('REPAIR','수리',90),('LOST','분실',100),('FOUND','발견',110),('DISPOSE_PENDING','폐기대기',120),('DISPOSED','폐기',130),('CANCELLED','취소',140)
) AS v(code,name,sort_order) ON CONFLICT(organization_id,code) DO NOTHING;

INSERT INTO asset_reason_definitions(organization_id,code,name,applies_to_status,requires_detail)
SELECT o.id,v.code,v.name,v.applies_to_status,v.requires_detail FROM organizations o CROSS JOIN (VALUES
  ('GENERAL','일반 상태 변경',NULL::VARCHAR,FALSE),('DAMAGE','파손·고장','REPAIR',TRUE),('LOSS','분실 신고','LOST',TRUE),('RECOVERY','분실품 발견','FOUND',TRUE),('DISPOSAL','폐기 요청','DISPOSE_PENDING',TRUE)
) AS v(code,name,applies_to_status,requires_detail) ON CONFLICT(organization_id,code) DO NOTHING;
