const selectAdmin = {
  categories: `SELECT id,organization_id,parent_id,code,name,is_active,created_at,updated_at FROM item_categories WHERE organization_id=$1 ORDER BY is_active DESC,name`,
  models: `SELECT m.id,c.organization_id,m.category_id,c.name category_name,m.brand,m.model_name name,m.specification,m.is_active,m.created_at,m.updated_at FROM item_models m JOIN item_categories c ON c.id=m.category_id WHERE c.organization_id=$1 ORDER BY m.is_active DESC,m.model_name`,
  vendors: `SELECT id,organization_id,code,name,contact,is_active,created_at,updated_at FROM vendors WHERE organization_id=$1 ORDER BY is_active DESC,name`,
  locations: `SELECT id,organization_id,parent_id,code,name,location_type,status='ACTIVE' is_active,created_at,updated_at FROM locations WHERE organization_id=$1 ORDER BY (status='ACTIVE') DESC,name`
};

async function listAdminReferences(pool, organizationId) {
  const entries = await Promise.all(Object.entries(selectAdmin).map(async ([kind, sql]) => [kind, (await pool.query(sql, [organizationId])).rows]));
  return Object.fromEntries(entries);
}

async function listOperationalReferences(pool, organizationId) {
  const [organizations, departments, locations, categories, models, vendors, users] = await Promise.all([
    pool.query('SELECT id,code,name,status FROM organizations WHERE id=$1', [organizationId]),
    pool.query("SELECT id,code,name,cost_center FROM departments WHERE organization_id=$1 AND status='ACTIVE' ORDER BY name", [organizationId]),
    pool.query("SELECT id,code,name,location_type FROM locations WHERE organization_id=$1 AND status='ACTIVE' ORDER BY name", [organizationId]),
    pool.query('SELECT id,code,name FROM item_categories WHERE organization_id=$1 AND is_active ORDER BY name', [organizationId]),
    pool.query(`SELECT m.id,m.brand,m.model_name,m.category_id FROM item_models m JOIN item_categories c ON c.id=m.category_id
      WHERE c.organization_id=$1 AND c.is_active AND m.is_active ORDER BY m.model_name`, [organizationId]),
    pool.query('SELECT id,code,name FROM vendors WHERE organization_id=$1 AND is_active ORDER BY name', [organizationId]),
    pool.query("SELECT id,email,display_name,role,department_id FROM users WHERE organization_id=$1 AND status='ACTIVE' ORDER BY display_name", [organizationId])
  ]);
  return { organizations:organizations.rows,departments:departments.rows,locations:locations.rows,categories:categories.rows,models:models.rows,vendors:vendors.rows,users:users.rows };
}

async function findActiveCategory(client, id, organizationId) {
  return (await client.query('SELECT id FROM item_categories WHERE id=$1 AND organization_id=$2 AND is_active', [id, organizationId])).rows[0] || null;
}

async function findActiveParent(client, kind, id, organizationId) {
  const sql = kind === 'categories'
    ? 'SELECT id FROM item_categories WHERE id=$1 AND organization_id=$2 AND is_active'
    : "SELECT id FROM locations WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'";
  return (await client.query(sql, [id, organizationId])).rows[0] || null;
}

async function insertReference(client, kind, organizationId, value) {
  if (kind === 'categories') return (await client.query(`INSERT INTO item_categories(organization_id,parent_id,code,name) VALUES($1,$2,$3,$4) RETURNING *`, [organizationId,value.parentId,value.code,value.name])).rows[0];
  if (kind === 'models') return (await client.query(`INSERT INTO item_models(category_id,brand,model_name,specification) VALUES($1,$2,$3,$4::jsonb) RETURNING id,category_id,brand,model_name name,specification,is_active,created_at,updated_at`, [value.categoryId,value.brand,value.name,JSON.stringify(value.specification)])).rows[0];
  if (kind === 'vendors') return (await client.query(`INSERT INTO vendors(organization_id,code,name,contact) VALUES($1,$2,$3,$4::jsonb) RETURNING *`, [organizationId,value.code,value.name,JSON.stringify(value.contact)])).rows[0];
  return (await client.query(`INSERT INTO locations(organization_id,parent_id,code,name,location_type) VALUES($1,$2,$3,$4,$5) RETURNING *,status='ACTIVE' is_active`, [organizationId,value.parentId,value.code,value.name,value.locationType])).rows[0];
}

async function findReferenceForUpdate(client, kind, id) {
  const sql = {
    categories:'SELECT *,name AS current_name,is_active AS current_active FROM item_categories WHERE id=$1 FOR UPDATE',
    models:'SELECT m.*,c.organization_id,m.model_name AS current_name,m.is_active AS current_active FROM item_models m JOIN item_categories c ON c.id=m.category_id WHERE m.id=$1 FOR UPDATE OF m',
    vendors:'SELECT *,name AS current_name,is_active AS current_active FROM vendors WHERE id=$1 FOR UPDATE',
    locations:"SELECT *,name AS current_name,status='ACTIVE' AS current_active FROM locations WHERE id=$1 FOR UPDATE"
  }[kind];
  return (await client.query(sql, [id])).rows[0] || null;
}

async function updateReference(client, kind, id, value) {
  if (kind === 'categories') return (await client.query('UPDATE item_categories SET name=$1,is_active=$2,updated_at=now() WHERE id=$3 RETURNING *', [value.name,value.isActive,id])).rows[0];
  if (kind === 'models') return (await client.query('UPDATE item_models SET model_name=$1,is_active=$2,updated_at=now() WHERE id=$3 RETURNING id,category_id,brand,model_name name,specification,is_active,created_at,updated_at', [value.name,value.isActive,id])).rows[0];
  if (kind === 'vendors') return (await client.query('UPDATE vendors SET name=$1,is_active=$2,updated_at=now() WHERE id=$3 RETURNING *', [value.name,value.isActive,id])).rows[0];
  return (await client.query("UPDATE locations SET name=$1,status=CASE WHEN $2 THEN 'ACTIVE' ELSE 'INACTIVE' END,updated_at=now() WHERE id=$3 RETURNING *,status='ACTIVE' is_active", [value.name,value.isActive,id])).rows[0];
}

async function insertAudit(client, actorId, action, entityType, entityId, metadata, trace = {}) {
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`, [actorId,action,entityType,String(entityId),JSON.stringify(metadata),trace.requestId||null,trace.ip||null]);
}

module.exports = { listAdminReferences, listOperationalReferences, findActiveCategory, findActiveParent, insertReference, findReferenceForUpdate, updateReference, insertAudit };
