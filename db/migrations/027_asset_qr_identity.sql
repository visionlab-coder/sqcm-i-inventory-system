ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS qr_public_id UUID;

UPDATE assets
SET qr_public_id = gen_random_uuid()
WHERE qr_public_id IS NULL;

ALTER TABLE assets
  ALTER COLUMN qr_public_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN qr_public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_qr_public_id
  ON assets (qr_public_id);
