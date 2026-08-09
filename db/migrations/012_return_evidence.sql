ALTER TABLE asset_files DROP CONSTRAINT IF EXISTS ck_asset_files_file_type;
ALTER TABLE asset_files ADD CONSTRAINT ck_asset_files_file_type
  CHECK (file_type IN ('PHOTO','RECEIPT','INSPECTION','DISPOSAL','RETURN'));

CREATE TABLE IF NOT EXISTS workflow_request_files (
  request_id BIGINT NOT NULL REFERENCES workflow_requests(id) ON DELETE CASCADE,
  file_id BIGINT NOT NULL REFERENCES file_records(id),
  purpose VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(request_id,file_id),
  CHECK(purpose IN ('RETURN_PHOTO'))
);

ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS returned_by BIGINT REFERENCES users(id);
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS return_checked_by BIGINT REFERENCES users(id);
ALTER TABLE asset_assignments ADD COLUMN IF NOT EXISTS return_note VARCHAR(500);

CREATE TABLE IF NOT EXISTS asset_return_records (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL UNIQUE REFERENCES workflow_requests(id),
  assignment_id BIGINT NOT NULL UNIQUE REFERENCES asset_assignments(id),
  asset_id BIGINT NOT NULL REFERENCES assets(id),
  returned_by BIGINT NOT NULL REFERENCES users(id),
  checked_by BIGINT NOT NULL REFERENCES users(id),
  condition_code VARCHAR(30) NOT NULL,
  note VARCHAR(500),
  accessories JSONB NOT NULL DEFAULT '[]'::jsonb,
  photo_file_id BIGINT NOT NULL REFERENCES file_records(id),
  returned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(condition_code IN ('GOOD','DAMAGED','MISSING_PARTS')),
  CHECK(jsonb_typeof(accessories)='array')
);
CREATE INDEX IF NOT EXISTS idx_return_records_asset ON asset_return_records(asset_id,returned_at DESC);
