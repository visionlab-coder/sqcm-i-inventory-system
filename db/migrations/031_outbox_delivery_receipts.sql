ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS delivery_provider VARCHAR(128),
  ADD COLUMN IF NOT EXISTS delivery_receipt_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS delivery_receipt_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(100);

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_delivery_receipt_sha256_format
  CHECK (delivery_receipt_sha256 IS NULL OR delivery_receipt_sha256 ~ '^[0-9a-f]{64}$');

CREATE INDEX IF NOT EXISTS idx_outbox_dead_letter_review
  ON outbox_events (dead_lettered_at, created_at, id)
  WHERE dead_lettered_at IS NOT NULL AND published_at IS NULL;
