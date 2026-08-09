-- Phase 53 follow-up: ensure every newly registered asset has a financial profile.
CREATE OR REPLACE FUNCTION ensure_asset_financial_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO asset_financial_profiles(asset_id, organization_id, updated_by)
  VALUES (NEW.id, NEW.organization_id, NEW.created_by)
  ON CONFLICT (asset_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assets_financial_profile ON assets;
CREATE TRIGGER trg_assets_financial_profile
AFTER INSERT ON assets
FOR EACH ROW EXECUTE FUNCTION ensure_asset_financial_profile();
