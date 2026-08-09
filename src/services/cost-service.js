const { DomainError, positiveInteger } = require('./inventory-service');

function requireOrg(user, input) {
  const id = positiveInteger(input || user?.organizationId, '조직');
  if (!user?.isSystemAdmin && Number(user?.organizationId) !== id) throw new DomainError('다른 조직의 비용 데이터에 접근할 수 없습니다.', 403);
  return id;
}

function scopeClause(scope, values, alias = 'a') {
  if (!scope?.departmentIds?.length) return '';
  values.push(scope.departmentIds);
  return ` AND ${alias}.department_id=ANY($${values.length}::bigint[])`;
}

function costEventScopeClause(scope, departmentParam, eventAlias = 'e', assetAlias = 'ea') {
  if (!scope?.departmentIds?.length) return '';
  return ` AND ${eventAlias}.asset_id IS NOT NULL AND ${assetAlias}.organization_id=${eventAlias}.organization_id AND ${assetAlias}.department_id=ANY($${departmentParam}::bigint[])`;
}

function depreciationSql() {
  return `CASE WHEN a.acquired_at IS NULL OR COALESCE(fp.depreciation_method,'NONE')='NONE' THEN 0
    ELSE LEAST(COALESCE(a.acquisition_cost,0), GREATEST(0, (EXTRACT(YEAR FROM age(current_date,a.acquired_at))*12 + EXTRACT(MONTH FROM age(current_date,a.acquired_at)))::numeric)
      * GREATEST(0, COALESCE(a.acquisition_cost,0)-COALESCE(fp.salvage_value,0)) / NULLIF(fp.useful_life_months,0)) END`;
}

async function getCostCommandCenter(pool, user, organizationInput, scope = {}) {
  const organizationId = requireOrg(user, organizationInput);
  const values = [organizationId];
  const scopeSql = scopeClause(scope, values);
  const eventScopeSql = costEventScopeClause(scope, values.length);
  const depr = depreciationSql();
  const monthlyValues = [organizationId];
  const monthlyEventScopeSql = scope?.departmentIds?.length
    ? (monthlyValues.push(scope.departmentIds), costEventScopeClause(scope, monthlyValues.length))
    : '';
  const [summary, monthly, idle, warranties, budgets] = await Promise.all([
    pool.query(`SELECT count(*)::int asset_count,
      COALESCE(sum(a.acquisition_cost),0)::numeric acquisition_cost,
      COALESCE((SELECT sum(e.amount) FROM asset_cost_events e LEFT JOIN assets ea ON ea.id=e.asset_id WHERE e.organization_id=$1 AND e.event_type='REPAIR'${eventScopeSql}),0)::numeric repair_cost,
      COALESCE((SELECT sum(e.amount) FROM asset_cost_events e LEFT JOIN assets ea ON ea.id=e.asset_id WHERE e.organization_id=$1 AND e.event_type='TRANSFER'${eventScopeSql}),0)::numeric transfer_cost,
      COALESCE((SELECT sum(e.amount) FROM asset_cost_events e LEFT JOIN assets ea ON ea.id=e.asset_id WHERE e.organization_id=$1 AND e.event_type='DISPOSAL'${eventScopeSql}),0)::numeric disposal_cost,
      COALESCE(sum(${depr}),0)::numeric depreciation,
      COALESCE(sum(a.acquisition_cost-${depr}) FILTER (WHERE a.status_code='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM asset_assignments aa WHERE aa.asset_id=a.id AND aa.status='ACTIVE' AND aa.ended_at IS NULL)),0)::numeric idle_capital,
      count(*) FILTER (WHERE a.status_code='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM asset_assignments aa WHERE aa.asset_id=a.id AND aa.status='ACTIVE' AND aa.ended_at IS NULL))::int idle_asset_count
      FROM assets a LEFT JOIN asset_financial_profiles fp ON fp.asset_id=a.id WHERE a.organization_id=$1${scopeSql}`, values),
    pool.query(`SELECT to_char(date_trunc('month',e.occurred_at),'YYYY-MM') AS period_month,COALESCE(sum(e.amount),0)::numeric amount,e.event_type
      FROM asset_cost_events e LEFT JOIN assets ea ON ea.id=e.asset_id WHERE e.organization_id=$1${monthlyEventScopeSql} GROUP BY 1,e.event_type ORDER BY 1 DESC LIMIT 24`, monthlyValues),
    pool.query(`SELECT a.id,a.asset_tag,a.name,a.status_code,a.acquisition_cost,a.acquired_at,l.name location_name,
      GREATEST(0,EXTRACT(DAY FROM now()-COALESCE((SELECT max(aa.ended_at) FROM asset_assignments aa WHERE aa.asset_id=a.id),a.acquired_at::timestamptz)))::int idle_days
      FROM assets a LEFT JOIN locations l ON l.id=a.location_id WHERE a.organization_id=$1 AND a.status_code IN ('AVAILABLE','RETURNED')${scopeSql} ORDER BY idle_days DESC,a.acquisition_cost DESC LIMIT 10`, values.slice()),
    pool.query(`SELECT a.asset_tag,a.name,fp.warranty_end,fp.lease_end FROM assets a JOIN asset_financial_profiles fp ON fp.asset_id=a.id
      WHERE a.organization_id=$1 AND (fp.warranty_end BETWEEN current_date AND current_date+interval '90 days' OR fp.lease_end BETWEEN current_date AND current_date+interval '90 days')${scopeSql} ORDER BY fp.warranty_end NULLS LAST LIMIT 10`, values.slice()),
    pool.query(`SELECT cost_center,fiscal_year,amount FROM cost_budgets WHERE organization_id=$1 AND fiscal_year BETWEEN EXTRACT(YEAR FROM current_date)::int-1 AND EXTRACT(YEAR FROM current_date)::int+1 ORDER BY fiscal_year DESC,cost_center`, [organizationId])
  ]);
  const row = summary.rows[0] || {};
  return { organizationId, summary: { ...row, tco: ['acquisition_cost','repair_cost','transfer_cost','disposal_cost'].reduce((sum,key)=>sum+Number(row[key]||0),0), book_value:Math.max(0,Number(row.acquisition_cost||0)-Number(row.depreciation||0)) }, monthly: monthly.rows, idleAssets: idle.rows, upcomingRenewals: warranties.rows, budgets: scope?.departmentIds?.length ? [] : budgets.rows };
}

module.exports = { requireOrg, getCostCommandCenter };
