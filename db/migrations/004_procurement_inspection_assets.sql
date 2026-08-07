CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_request
  ON purchase_orders(request_id);

CREATE INDEX IF NOT EXISTS idx_receipts_purchase_order
  ON receipts(purchase_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspections_receipt
  ON inspections(receipt_id);

CREATE TABLE IF NOT EXISTS inspection_assets (
  inspection_id BIGINT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES assets(id),
  unit_no INTEGER NOT NULL CHECK (unit_no > 0),
  PRIMARY KEY (inspection_id, unit_no),
  UNIQUE (asset_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_assets_asset
  ON inspection_assets(asset_id);
