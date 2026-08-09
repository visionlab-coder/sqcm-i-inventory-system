const { DomainError, positiveInteger } = require('./inventory-service');

const ASSET_STATUSES = new Set(['DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED']);

function reportFieldError(message) {
  throw new DomainError(message);
}

function dateOnly(value, label) {
  if (!value) return null;
  const text = String(value).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) reportFieldError(`${label}은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.`);
  return text;
}

function normalizeReportFilters(input = {}) {
  const filters = {
    departmentId: input.departmentId ? positiveInteger(input.departmentId, '부서') : null,
    locationId: input.locationId ? positiveInteger(input.locationId, '위치') : null,
    categoryId: input.categoryId ? positiveInteger(input.categoryId, '유형') : null,
    status: String(input.status || '').trim().toUpperCase() || null,
    from: dateOnly(input.from, '시작일'),
    to: dateOnly(input.to, '종료일')
  };
  if (filters.status && !ASSET_STATUSES.has(filters.status)) reportFieldError('올바른 자산 상태가 아닙니다.');
  if (filters.from && filters.to && filters.from > filters.to) reportFieldError('시작일은 종료일보다 늦을 수 없습니다.');
  return filters;
}

function assetFilterSql(organizationId, input, scope = {}) {
  const filters = normalizeReportFilters(input);
  const values = [organizationId];
  const where = ['a.organization_id=$1'];
  if (scope.departmentIds) {
    if (filters.departmentId && !scope.departmentIds.includes(Number(filters.departmentId))) {
      throw new DomainError('허용된 부서 범위를 벗어났습니다.', 403);
    }
    values.push(scope.departmentIds);
    where.push(`a.department_id=ANY($${values.length}::bigint[])`);
  }
  for (const [key, column] of [['departmentId','a.department_id'],['locationId','a.location_id'],['categoryId','a.category_id']]) {
    if (filters[key]) { values.push(filters[key]); where.push(`${column}=$${values.length}`); }
  }
  if (filters.status) { values.push(filters.status); where.push(`a.status_code=$${values.length}`); }
  if (filters.from) { values.push(filters.from); where.push(`a.acquired_at >= $${values.length}::date`); }
  if (filters.to) { values.push(filters.to); where.push(`a.acquired_at <= $${values.length}::date`); }
  return { filters, values, where: where.join(' AND ') };
}

async function getAssetReport(pool, organizationId, input = {}, scope = {}) {
  const query = assetFilterSql(organizationId, input, scope);
  const from = `FROM assets a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN locations l ON l.id=a.location_id LEFT JOIN item_categories c ON c.id=a.category_id WHERE ${query.where}`;
  const [summary, departments, locations, categories, statuses] = await Promise.all([
    pool.query(`SELECT count(*)::int assets,count(*) FILTER(WHERE a.status_code='AVAILABLE')::int available,
      count(*) FILTER(WHERE a.status_code IN ('ASSIGNED','IN_USE'))::int in_use,count(*) FILTER(WHERE a.status_code='REPAIR')::int repair,
      count(*) FILTER(WHERE a.status_code='LOST')::int lost,count(*) FILTER(WHERE a.status_code='DISPOSE_PENDING')::int dispose_pending,
      coalesce(sum(a.acquisition_cost),0) total_cost ${from}`, query.values),
    pool.query(`SELECT coalesce(d.name,'미지정') label,count(*)::int count,coalesce(sum(a.acquisition_cost),0) total_cost ${from} GROUP BY d.name ORDER BY count DESC,label`, query.values),
    pool.query(`SELECT coalesce(l.name,'미지정') label,count(*)::int count,coalesce(sum(a.acquisition_cost),0) total_cost ${from} GROUP BY l.name ORDER BY count DESC,label`, query.values),
    pool.query(`SELECT coalesce(c.name,'미지정') label,count(*)::int count,coalesce(sum(a.acquisition_cost),0) total_cost ${from} GROUP BY c.name ORDER BY count DESC,label`, query.values),
    pool.query(`SELECT a.status_code label,count(*)::int count,coalesce(sum(a.acquisition_cost),0) total_cost ${from} GROUP BY a.status_code ORDER BY count DESC,label`, query.values)
  ]);
  return { filters: query.filters, summary: summary.rows[0], breakdowns: { departments: departments.rows, locations: locations.rows, categories: categories.rows, statuses: statuses.rows } };
}

async function getReportAssets(pool, organizationId, input = {}, scope = {}) {
  const query = assetFilterSql(organizationId, input, scope);
  const result = await pool.query(`SELECT a.asset_tag,a.name,a.serial_no,a.status_code,d.name department_name,l.name location_name,c.name category_name,a.acquired_at,a.acquisition_cost
    FROM assets a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN locations l ON l.id=a.location_id LEFT JOIN item_categories c ON c.id=a.category_id
    WHERE ${query.where} ORDER BY a.asset_tag`, query.values);
  return { filters: query.filters, assets: result.rows };
}

function normalizeAuditFilters(input = {}) {
  const filters = {
    action: String(input.action || '').trim().slice(0, 80) || null,
    entityType: String(input.entityType || '').trim().slice(0, 40) || null,
    actorId: input.actorId ? positiveInteger(input.actorId, '작업자') : null,
    from: input.from ? String(input.from).trim() : null,
    to: input.to ? String(input.to).trim() : null,
    q: String(input.q || '').trim().slice(0, 100) || null
  };
  for (const key of ['from','to']) if (filters[key] && Number.isNaN(Date.parse(filters[key]))) reportFieldError('감사 조회 기간이 올바르지 않습니다.');
  if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) reportFieldError('감사 시작일은 종료일보다 늦을 수 없습니다.');
  return filters;
}

async function getAuditLogs(pool, input = {}, user = null) {
  const filters = normalizeAuditFilters(input); const values = []; const where = [];
  if (!user?.isSystemAdmin) {
    const organizationId = Number(user?.organizationId);
    if (!Number.isInteger(organizationId) || organizationId <= 0) throw new DomainError('조직 범위가 지정된 사용자만 감사 로그를 조회할 수 있습니다.', 403);
    values.push(organizationId); where.push(`a.organization_id=$${values.length}`);
  }
  if (filters.action) { values.push(filters.action); where.push(`a.action=$${values.length}`); }
  if (filters.entityType) { values.push(filters.entityType); where.push(`a.entity_type=$${values.length}`); }
  if (filters.actorId) { values.push(filters.actorId); where.push(`a.actor_user_id=$${values.length}`); }
  if (filters.from) { values.push(filters.from); where.push(`a.created_at >= $${values.length}::timestamptz`); }
  if (filters.to) { values.push(filters.to); where.push(`a.created_at <= $${values.length}::timestamptz`); }
  if (filters.q) {
    values.push(`%${filters.q}%`); const p = `$${values.length}`;
    where.push(`(a.action ILIKE ${p} OR a.entity_type ILIKE ${p} OR a.entity_id ILIKE ${p} OR a.request_id ILIKE ${p} OR a.metadata::text ILIKE ${p} OR u.display_name ILIKE ${p} OR u.email ILIKE ${p})`);
  }
  const result = await pool.query(`SELECT a.*,u.display_name,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.created_at DESC LIMIT 200`, values);
  return { filters, logs: result.rows };
}

module.exports = { normalizeReportFilters, normalizeAuditFilters, assetFilterSql, getAssetReport, getReportAssets, getAuditLogs };
