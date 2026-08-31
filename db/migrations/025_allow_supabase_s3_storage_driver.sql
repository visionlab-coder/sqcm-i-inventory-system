ALTER TABLE file_records
  DROP CONSTRAINT IF EXISTS ck_file_records_storage_driver;

ALTER TABLE file_records
  ADD CONSTRAINT ck_file_records_storage_driver
  CHECK (storage_driver IN ('LOCAL', 'EXTERNAL', 'SUPABASE_S3'));
