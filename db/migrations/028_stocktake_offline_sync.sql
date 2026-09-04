ALTER TABLE stocktake_items
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stocktake_items
  DROP CONSTRAINT IF EXISTS stocktake_items_version_nonnegative;

ALTER TABLE stocktake_items
  ADD CONSTRAINT stocktake_items_version_nonnegative CHECK (version >= 0);

CREATE TABLE IF NOT EXISTS stocktake_offline_operations (
  operation_id UUID PRIMARY KEY,
  stocktake_id BIGINT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES assets(id),
  actor_user_id BIGINT REFERENCES users(id),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stocktake_offline_operations_stocktake
  ON stocktake_offline_operations (stocktake_id, applied_at DESC);
