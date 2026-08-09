ALTER TABLE item_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE item_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE item_models ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE item_models ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE item_models ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_item_categories_parent ON item_categories(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_categories_active_org ON item_categories(organization_id,name) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_item_models_category ON item_models(category_id);
CREATE INDEX IF NOT EXISTS idx_item_models_active_category ON item_models(category_id,model_name) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_vendors_active_org ON vendors(organization_id,name) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_locations_active_org ON locations(organization_id,name) WHERE status='ACTIVE';
