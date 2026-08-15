-- Phase 51: enterprise assets are canonical; legacy stock/loan rows are tenant-scoped compatibility data.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_system_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE items ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
UPDATE items
SET organization_id = COALESCE(organization_id,
  (SELECT id FROM organizations WHERE code = 'SEOWON' LIMIT 1),
  (SELECT id FROM organizations ORDER BY id LIMIT 1))
WHERE organization_id IS NULL;
ALTER TABLE items ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_org_status ON items (organization_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_org_code ON items (organization_id, code);
CREATE OR REPLACE FUNCTION default_organization_id()
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT id FROM organizations WHERE code='SEOWON' LIMIT 1), (SELECT id FROM organizations ORDER BY id LIMIT 1))
$$;
ALTER TABLE items ALTER COLUMN organization_id SET DEFAULT default_organization_id();

ALTER TABLE loans ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
UPDATE loans l SET organization_id = i.organization_id FROM items i
WHERE l.item_id = i.id AND l.organization_id IS NULL;
UPDATE loans
SET organization_id = COALESCE(organization_id,
  (SELECT organization_id FROM users WHERE users.id = loans.user_id),
  (SELECT id FROM organizations WHERE code = 'SEOWON' LIMIT 1),
  (SELECT id FROM organizations ORDER BY id LIMIT 1))
WHERE organization_id IS NULL;
ALTER TABLE loans ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loans_org_active_due ON loans (organization_id, due_at) WHERE returned_at IS NULL;
ALTER TABLE loans ALTER COLUMN organization_id SET DEFAULT default_organization_id();

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id);
UPDATE audit_logs a SET organization_id = u.organization_id FROM users u
WHERE a.actor_user_id = u.id AND a.organization_id IS NULL;

CREATE OR REPLACE FUNCTION set_audit_organization()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.actor_user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM users WHERE id = NEW.actor_user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_organization_before_insert ON audit_logs;
CREATE TRIGGER audit_organization_before_insert
BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION set_audit_organization();
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs (organization_id, created_at DESC);

COMMENT ON TABLE items IS 'Compatibility-only stock model. Enterprise assets are the canonical physical asset ledger.';
COMMENT ON TABLE loans IS 'Compatibility-only loan history. New assignment/return workflows use asset_assignments.';
