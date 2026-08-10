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

const SAVINGS_TYPES = new Set(['TRANSFER_AVOIDED_PURCHASE','REPAIR_AVOIDED_REPLACE','REUSE_AVOIDED_PURCHASE','DISPOSAL_RECOVERY']);
function normalizeSavingsEvent(input = {}) {
  const savingsType = String(input.savingsType || '').trim().toUpperCase();
  if (!SAVINGS_TYPES.has(savingsType)) throw new DomainError('올바른 절감 유형이 필요합니다.');
  const money = (value, label) => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new DomainError(`${label}은(는) 0 이상 숫자여야 합니다.`); return parsed; };
  const baselineCost = money(input.baselineCost, '기준 비용'); const actualCost = money(input.actualCost, '실제 비용');
  if (actualCost > baselineCost) throw new DomainError('실제 비용은 기준 비용을 초과할 수 없습니다.');
  return { savingsType, baselineCost, actualCost, avoidedAmount: Math.round((baselineCost - actualCost) * 100) / 100, evidence: input.evidence && typeof input.evidence === 'object' ? input.evidence : {} };
}

async function recordSavingsEvent(pool, user, input = {}) {
  const organizationId = requireOrg(user, input.organizationId); const normalized = normalizeSavingsEvent(input);
  const assetId = input.assetId == null || input.assetId === '' ? null : positiveInteger(input.assetId, '자산번호');
  const requestId = input.requestId == null || input.requestId === '' ? null : positiveInteger(input.requestId, '요청번호');
  if (assetId) { const asset = await pool.query('SELECT organization_id FROM assets WHERE id=$1', [assetId]); if (!asset.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404); requireOrg(user, asset.rows[0].organization_id); }
  if (requestId) { const request = await pool.query('SELECT organization_id FROM workflow_requests WHERE id=$1', [requestId]); if (!request.rowCount) throw new DomainError('요청을 찾을 수 없습니다.', 404); requireOrg(user, request.rows[0].organization_id); }
  const result = await pool.query(`INSERT INTO cost_savings_events(organization_id,asset_id,request_id,savings_type,baseline_cost,actual_cost,avoided_amount,evidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id,realized_at`, [organizationId, assetId, requestId, normalized.savingsType, normalized.baselineCost, normalized.actualCost, normalized.avoidedAmount, JSON.stringify(normalized.evidence), user.id]);
  return { ...result.rows[0], organizationId, assetId, requestId, ...normalized };
}

async function getCostRoiSummary(pool, user, organizationInput, scope = {}) {
  const organizationId = requireOrg(user, organizationInput); const values = [organizationId]; const scopeSql = scopeClause(scope, values, 'a');
  const savingsValues = [organizationId]; let savingsScope = '';
  if (scope.departmentIds?.length) { savingsValues.push(scope.departmentIds); savingsScope = ` AND (a.department_id=ANY($${savingsValues.length}::bigint[]) OR s.asset_id IS NULL)`; }
  const [savings, vendors, budgetRows, spendRows, utilization] = await Promise.all([
    pool.query(`SELECT count(*)::int event_count,COALESCE(sum(s.avoided_amount),0)::numeric realized_savings,COALESCE(sum(s.baseline_cost),0)::numeric baseline_cost,COALESCE(sum(s.actual_cost),0)::numeric actual_cost FROM cost_savings_events s LEFT JOIN assets a ON a.id=s.asset_id AND a.organization_id=s.organization_id WHERE s.organization_id=$1${savingsScope}`, savingsValues),
    pool.query(`SELECT v.id,v.name,
      COALESCE((SELECT count(*) FROM purchase_orders po WHERE po.vendor_id=v.id AND po.organization_id=v.organization_id),0)::int order_count,
      COALESCE((SELECT sum(po.total_amount) FROM purchase_orders po WHERE po.vendor_id=v.id AND po.organization_id=v.organization_id),0)::numeric ordered_amount,
      COALESCE((SELECT avg(EXTRACT(EPOCH FROM (r.received_at-po.ordered_at))/86400) FROM receipts r JOIN purchase_orders po ON po.id=r.purchase_order_id WHERE po.vendor_id=v.id AND po.organization_id=v.organization_id),0)::numeric avg_lead_days,
      COALESCE((SELECT count(*) FROM service_tickets st WHERE st.vendor_id=v.id AND st.organization_id=v.organization_id),0)::int repair_count,
      COALESCE((SELECT sum(st.cost) FROM service_tickets st WHERE st.vendor_id=v.id AND st.organization_id=v.organization_id),0)::numeric repair_cost
      FROM vendors v WHERE v.organization_id=$1 AND v.is_active ORDER BY ordered_amount DESC,v.name`, [organizationId]),
    pool.query(`SELECT cost_center,fiscal_year,amount::numeric budget FROM cost_budgets WHERE organization_id=$1 AND fiscal_year=EXTRACT(YEAR FROM current_date)::int ORDER BY cost_center`, [organizationId]),
    pool.query(`SELECT COALESCE(d.cost_center,'UNASSIGNED') cost_center,EXTRACT(YEAR FROM e.occurred_at)::int fiscal_year,COALESCE(sum(e.amount),0)::numeric spent FROM asset_cost_events e LEFT JOIN assets a ON a.id=e.asset_id AND a.organization_id=e.organization_id LEFT JOIN departments d ON d.id=a.department_id WHERE e.organization_id=$1${scopeSql} GROUP BY 1,2`, values),
    pool.query(`SELECT count(*)::int asset_count,count(*) FILTER(WHERE a.status_code IN ('ASSIGNED','IN_USE'))::int active_count,count(*) FILTER(WHERE a.status_code IN ('AVAILABLE','RETURNED'))::int idle_candidate_count FROM assets a WHERE a.organization_id=$1${scopeSql}`, values)
  ]);
  const spendMap = new Map(spendRows.rows.map(row => [`${row.cost_center}:${row.fiscal_year}`, Number(row.spent || 0)]));
  const budgets = budgetRows.rows.map(row => ({ ...row, budget: Number(row.budget || 0), spent: spendMap.get(`${row.cost_center}:${row.fiscal_year}`) || 0, remaining: Number(row.budget || 0) - (spendMap.get(`${row.cost_center}:${row.fiscal_year}`) || 0) }));
  return { organizationId, savings: savings.rows[0], budgets, vendors: vendors.rows, utilization: utilization.rows[0] };
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

module.exports = { requireOrg, getCostCommandCenter, normalizeSavingsEvent, recordSavingsEvent, getCostRoiSummary };
