ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_error VARCHAR(500),
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_outbox_delivery_ready
  ON outbox_events(next_attempt_at, created_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
