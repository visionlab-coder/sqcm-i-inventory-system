CREATE TABLE IF NOT EXISTS user_mfa_credentials (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  recovery_code_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_counter BIGINT,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(recovery_code_hashes) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_mfa_credentials_enabled
  ON user_mfa_credentials(enabled_at) WHERE enabled_at IS NOT NULL;
