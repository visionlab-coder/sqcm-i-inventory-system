CREATE TABLE IF NOT EXISTS file_blobs (
  storage_key VARCHAR(500) PRIMARY KEY,
  content BYTEA NOT NULL,
  checksum CHAR(64) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_file_blobs_checksum CHECK (checksum ~ '^[a-f0-9]{64}$')
);

ALTER TABLE file_records
  DROP CONSTRAINT IF EXISTS ck_file_records_storage_driver;

ALTER TABLE file_records
  ADD CONSTRAINT ck_file_records_storage_driver
  CHECK (storage_driver IN ('LOCAL', 'EXTERNAL', 'SUPABASE_S3', 'POSTGRES'));
