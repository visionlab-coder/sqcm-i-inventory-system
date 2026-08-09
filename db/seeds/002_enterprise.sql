INSERT INTO item_categories(organization_id,code,name)
SELECT o.id,v.code,v.name FROM organizations o CROSS JOIN (VALUES
  ('IT','IT 장비'),('SAFETY','안전용품'),('FIELD','현장장비'),('FACILITY','시설자산')
) v(code,name) WHERE o.code='SEOWON' ON CONFLICT(organization_id,code) DO NOTHING;

INSERT INTO item_models(category_id,brand,model_name,specification)
SELECT c.id,v.brand,v.model_name,v.specification::jsonb FROM item_categories c JOIN (VALUES
  ('IT','Samsung','Galaxy Book','{"cpu":"Intel","os":"Windows 11"}'),
  ('FIELD','Bosch','GBH 18V','{"voltage":"18V"}'),
  ('SAFETY','3M','SecureFit','{"standard":"KCS"}')
) v(category_code,brand,model_name,specification) ON v.category_code=c.code
WHERE c.organization_id=(SELECT id FROM organizations WHERE code='SEOWON') ON CONFLICT(category_id,brand,model_name) DO NOTHING;

INSERT INTO vendors(organization_id,code,name,contact)
SELECT id,'VENDOR-001','서원산업 공급센터','{"email":"procurement@example.invalid"}'::jsonb FROM organizations WHERE code='SEOWON'
ON CONFLICT(organization_id,code) DO NOTHING;

INSERT INTO assets(organization_id,asset_tag,serial_no,name,category_id,model_id,status_code,location_id,department_id,acquired_at,acquisition_cost,attributes,created_by)
SELECT o.id,v.asset_tag,v.serial_no,v.name,c.id,m.id,v.status_code,l.id,d.id,v.acquired_at::date,v.cost::numeric,v.attributes::jsonb,u.id
FROM organizations o
JOIN users u ON u.email='admin@seowon.local'
JOIN locations l ON l.organization_id=o.id AND l.code='SEOUL-HQ'
JOIN departments d ON d.organization_id=o.id AND d.code='HQ'
JOIN (VALUES
  ('SW-IT-0001','SN-BOOK-0001','현장 노트북 01','IT','Galaxy Book','AVAILABLE','2025-01-15',1800000,'{"qr":"SW-IT-0001"}'),
  ('SW-FD-0001','SN-DRILL-0001','충전 해머드릴 01','FIELD','GBH 18V','AVAILABLE','2025-02-01',620000,'{"qr":"SW-FD-0001"}'),
  ('SW-SA-0001','SN-HELMET-0001','안전모 01','SAFETY','SecureFit','AVAILABLE','2025-03-10',85000,'{"qr":"SW-SA-0001"}')
) v(asset_tag,serial_no,name,category_code,model_name,status_code,acquired_at,cost,attributes) ON true
JOIN item_categories c ON c.organization_id=o.id AND c.code=v.category_code
LEFT JOIN item_models m ON m.category_id=c.id AND m.model_name=v.model_name
WHERE o.code='SEOWON' ON CONFLICT(organization_id,asset_tag) DO NOTHING;
