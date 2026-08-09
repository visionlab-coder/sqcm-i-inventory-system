ALTER TABLE file_records
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS storage_driver VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by BIGINT REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_records_size') THEN
    ALTER TABLE file_records ADD CONSTRAINT ck_file_records_size
      CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 5242880);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_records_status') THEN
    ALTER TABLE file_records ADD CONSTRAINT ck_file_records_status
      CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_file_records_storage_driver') THEN
    ALTER TABLE file_records ADD CONSTRAINT ck_file_records_storage_driver
      CHECK (storage_driver IN ('LOCAL', 'EXTERNAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_asset_files_file_type') THEN
    ALTER TABLE asset_files ADD CONSTRAINT ck_asset_files_file_type
      CHECK (file_type IN ('PHOTO', 'RECEIPT', 'INSPECTION', 'DISPOSAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_file_records_organization_active
  ON file_records(organization_id, created_at DESC) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_file_records_uploaded_by ON file_records(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_file_records_deactivated_by ON file_records(deactivated_by);
CREATE INDEX IF NOT EXISTS idx_asset_files_file_id ON asset_files(file_id);
