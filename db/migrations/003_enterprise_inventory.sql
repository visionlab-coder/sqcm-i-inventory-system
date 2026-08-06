CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id), parent_id BIGINT REFERENCES departments(id),
  code VARCHAR(30) NOT NULL, name VARCHAR(100) NOT NULL, cost_center VARCHAR(50), status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code), CHECK (status IN ('ACTIVE','INACTIVE'))
);

CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id), parent_id BIGINT REFERENCES locations(id),
  code VARCHAR(30) NOT NULL, name VARCHAR(100) NOT NULL, location_type VARCHAR(30) NOT NULL DEFAULT 'SITE',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code), CHECK (status IN ('ACTIVE','INACTIVE'))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_no VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_role_scopes (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code VARCHAR(40) NOT NULL, organization_id BIGINT REFERENCES organizations(id), department_id BIGINT REFERENCES departments(id),
  scope_type VARCHAR(20) NOT NULL DEFAULT 'ORGANIZATION', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_code, organization_id, department_id), CHECK (scope_type IN ('ALL','ORGANIZATION','DEPARTMENT','SELF'))
);

CREATE TABLE IF NOT EXISTS item_categories (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), parent_id BIGINT REFERENCES item_categories(id),
  code VARCHAR(30) NOT NULL, name VARCHAR(100) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS item_models (
  id BIGSERIAL PRIMARY KEY, category_id BIGINT NOT NULL REFERENCES item_categories(id), brand VARCHAR(100), model_name VARCHAR(100) NOT NULL,
  specification JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE (category_id, brand, model_name)
);
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), code VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL, contact JSONB NOT NULL DEFAULT '{}'::jsonb, is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_tag VARCHAR(50) NOT NULL,
  serial_no VARCHAR(100), name VARCHAR(150) NOT NULL, category_id BIGINT REFERENCES item_categories(id), model_id BIGINT REFERENCES item_models(id),
  status_code VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE', location_id BIGINT REFERENCES locations(id), department_id BIGINT REFERENCES departments(id),
  acquired_at DATE, acquisition_cost NUMERIC(15,2) CHECK (acquisition_cost IS NULL OR acquisition_cost >= 0),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb, created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deactivated_at TIMESTAMPTZ,
  UNIQUE (organization_id, asset_tag),
  CHECK (status_code IN ('DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_serial ON assets (organization_id, serial_no) WHERE serial_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_org_status ON assets (organization_id, status_code);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets (location_id);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id BIGSERIAL PRIMARY KEY, asset_id BIGINT NOT NULL REFERENCES assets(id), user_id BIGINT REFERENCES users(id),
  department_id BIGINT REFERENCES departments(id), location_id BIGINT REFERENCES locations(id), started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', assigned_by BIGINT NOT NULL REFERENCES users(id),
  return_condition VARCHAR(30), accessories JSONB NOT NULL DEFAULT '[]'::jsonb, note VARCHAR(500),
  CHECK (ended_at IS NULL OR ended_at >= started_at), CHECK (status IN ('ACTIVE','ENDED','CANCELLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_active_assignment ON asset_assignments(asset_id) WHERE ended_at IS NULL AND status='ACTIVE';

CREATE TABLE IF NOT EXISTS asset_status_histories (
  id BIGSERIAL PRIMARY KEY, asset_id BIGINT NOT NULL REFERENCES assets(id), from_status VARCHAR(30), to_status VARCHAR(30) NOT NULL,
  reason VARCHAR(500) NOT NULL, changed_by BIGINT NOT NULL REFERENCES users(id), request_id VARCHAR(100), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_requests (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), request_type VARCHAR(30) NOT NULL,
  requester_id BIGINT NOT NULL REFERENCES users(id), asset_id BIGINT REFERENCES assets(id), status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  title VARCHAR(150) NOT NULL, reason VARCHAR(1000) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id BIGINT REFERENCES users(id), review_reason VARCHAR(1000), submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (request_type IN ('ASSIGN','RETURN','TRANSFER','REPAIR','LOST','PURCHASE','DISPOSAL')),
  CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','COMPLETED'))
);
CREATE INDEX IF NOT EXISTS idx_requests_org_status ON workflow_requests(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), request_id BIGINT NOT NULL REFERENCES workflow_requests(id),
  vendor_id BIGINT REFERENCES vendors(id), order_no VARCHAR(50) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'ORDERED',
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0), ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_no), CHECK (status IN ('ORDERED','PARTIAL_RECEIVED','RECEIVED','CANCELLED'))
);
CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY, purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED', received_by BIGINT NOT NULL REFERENCES users(id), received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('RECEIVED','INSPECTION_PENDING','ACCEPTED','REJECTED'))
);
CREATE TABLE IF NOT EXISTS inspections (
  id BIGSERIAL PRIMARY KEY, receipt_id BIGINT NOT NULL REFERENCES receipts(id), asset_id BIGINT REFERENCES assets(id),
  result VARCHAR(20) NOT NULL, note VARCHAR(500), inspected_by BIGINT NOT NULL REFERENCES users(id), inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (result IN ('PASS','FAIL','CONDITIONAL'))
);

CREATE TABLE IF NOT EXISTS service_tickets (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_id BIGINT NOT NULL REFERENCES assets(id),
  reporter_id BIGINT NOT NULL REFERENCES users(id), assignee_id BIGINT REFERENCES users(id), priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN', symptom VARCHAR(1000) NOT NULL, vendor_id BIGINT REFERENCES vendors(id),
  cost NUMERIC(15,2) CHECK(cost IS NULL OR cost >= 0), resolution VARCHAR(1000), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')), CHECK(status IN ('OPEN','IN_PROGRESS','WAITING','RESOLVED','CLOSED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_service_org_status ON service_tickets(organization_id,status,priority);

CREATE TABLE IF NOT EXISTS disposal_requests (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), asset_id BIGINT NOT NULL REFERENCES assets(id),
  requester_id BIGINT NOT NULL REFERENCES users(id), approver_id BIGINT REFERENCES users(id), reason VARCHAR(1000) NOT NULL,
  evidence_reference VARCHAR(500), status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ,
  CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','COMPLETED'))
);

CREATE TABLE IF NOT EXISTS stocktakes (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), location_id BIGINT REFERENCES locations(id),
  name VARCHAR(150) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PLANNED', planned_at TIMESTAMPTZ NOT NULL,
  confirmed_by BIGINT REFERENCES users(id), confirmed_at TIMESTAMPTZ, created_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status IN ('PLANNED','IN_PROGRESS','REVIEW','CONFIRMED','CANCELLED'))
);
CREATE TABLE IF NOT EXISTS stocktake_items (
  stocktake_id BIGINT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE, asset_id BIGINT NOT NULL REFERENCES assets(id),
  result VARCHAR(20) NOT NULL DEFAULT 'PENDING', found_location_id BIGINT REFERENCES locations(id), reason VARCHAR(500), checked_by BIGINT REFERENCES users(id), checked_at TIMESTAMPTZ,
  PRIMARY KEY(stocktake_id,asset_id), CHECK(result IN ('PENDING','MATCH','MISSING','LOCATION_MISMATCH','DAMAGED'))
);

CREATE TABLE IF NOT EXISTS file_records (
  id BIGSERIAL PRIMARY KEY, organization_id BIGINT NOT NULL REFERENCES organizations(id), storage_key VARCHAR(500) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL, content_type VARCHAR(100) NOT NULL, checksum VARCHAR(64) NOT NULL, uploaded_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS asset_files (
  asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, file_id BIGINT NOT NULL REFERENCES file_records(id) ON DELETE CASCADE,
  file_type VARCHAR(30) NOT NULL, PRIMARY KEY(asset_id,file_id)
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY, aggregate_type VARCHAR(40) NOT NULL, aggregate_id VARCHAR(100) NOT NULL, event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ,
  idempotency_key VARCHAR(100) UNIQUE
);

INSERT INTO organizations(code,name) VALUES ('SEOWON','서원토건') ON CONFLICT(code) DO NOTHING;
INSERT INTO departments(organization_id,code,name,cost_center)
SELECT id,'HQ','본사','HQ-001' FROM organizations WHERE code='SEOWON' ON CONFLICT(organization_id,code) DO NOTHING;
INSERT INTO locations(organization_id,code,name,location_type)
SELECT id,'SEOUL-HQ','서울 본사','OFFICE' FROM organizations WHERE code='SEOWON' ON CONFLICT(organization_id,code) DO NOTHING;
UPDATE users SET organization_id=(SELECT id FROM organizations WHERE code='SEOWON'), department_id=(SELECT id FROM departments WHERE code='HQ' LIMIT 1)
WHERE organization_id IS NULL;
