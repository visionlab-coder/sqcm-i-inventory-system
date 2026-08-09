CREATE TABLE IF NOT EXISTS user_oidc_identities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  issuer VARCHAR(500) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_user_oidc_identities_subject
  ON user_oidc_identities(issuer, subject);
