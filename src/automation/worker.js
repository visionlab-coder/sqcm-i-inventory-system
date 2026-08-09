const crypto = require('node:crypto');

const RULE_HANDLERS = {
  IDLE_ASSET: async (pool, rule) => pool.query(`SELECT a.id,a.asset_tag,a.name FROM assets a WHERE a.organization_id=$1 AND a.status_code IN ('AVAILABLE','RETURNED')
    AND GREATEST(0,EXTRACT(DAY FROM now()-COALESCE((SELECT max(aa.ended_at) FROM asset_assignments aa WHERE aa.asset_id=a.id),a.acquired_at::timestamptz))) >= $2 LIMIT 200`, [rule.organization_id, Number(rule.config?.days || 30)]),
  OVERDUE_ASSIGNMENT: async (pool, rule) => pool.query(`SELECT a.id,a.asset_tag,a.name FROM assets a JOIN asset_assignments aa ON aa.asset_id=a.id
    WHERE a.organization_id=$1 AND aa.status='ACTIVE' AND aa.ended_at IS NULL AND aa.started_at < now()-($2::int * interval '1 day') LIMIT 200`, [rule.organization_id, Number(rule.config?.days || 1)]),
  WARRANTY_EXPIRY: async (pool, rule) => pool.query(`SELECT a.id,a.asset_tag,a.name FROM assets a JOIN asset_financial_profiles fp ON fp.asset_id=a.id
    WHERE a.organization_id=$1 AND fp.warranty_end BETWEEN current_date AND current_date+($2::int * interval '1 day') LIMIT 200`, [rule.organization_id, Number(rule.config?.days || 90)]),
  APPROVAL_SLA: async (pool, rule) => pool.query(`SELECT r.id,r.title FROM workflow_requests r WHERE r.organization_id=$1 AND r.status='SUBMITTED'
    AND r.created_at < now()-($2::int * interval '1 hour') LIMIT 200`, [rule.organization_id, Number(rule.config?.hours || 48)])
};

function notificationFor(rule, row) {
  const entityType = rule.rule_type === 'APPROVAL_SLA' ? 'REQUEST' : 'ASSET';
  const id = row.id;
  const title = rule.rule_type === 'IDLE_ASSET' ? '유휴 자산 이동 검토' : rule.rule_type === 'OVERDUE_ASSIGNMENT' ? '반납 SLA 초과' : rule.rule_type === 'WARRANTY_EXPIRY' ? '보증 만료 예정' : '승인 SLA 초과';
  return { entityType, entityId: String(id), severity: rule.rule_type === 'OVERDUE_ASSIGNMENT' ? 'CRITICAL' : 'WARNING', title, body: `${row.asset_tag || row.title || '대상'}을(를) 확인하고 다음 비용 절감 행동을 결정하세요.`, dedupeKey: `${rule.id}:${entityType}:${id}:${new Date().toISOString().slice(0,10)}` };
}

async function acquireLease(pool, ownerId, now = new Date(), ttlMs = 55_000) {
  const expires = new Date(now.getTime() + ttlMs);
  const result = await pool.query(`INSERT INTO automation_leases(lease_name,owner_id,expires_at) VALUES('automation-worker',$1,$2)
    ON CONFLICT(lease_name) DO UPDATE SET owner_id=EXCLUDED.owner_id,expires_at=EXCLUDED.expires_at
    WHERE automation_leases.expires_at < $3 RETURNING lease_name`, [ownerId, expires, now]);
  return result.rowCount > 0;
}

async function runAutomationOnce(pool, { now = new Date(), ownerId = crypto.randomUUID() } = {}) {
  if (!await acquireLease(pool, ownerId, now)) return { skipped: true, runs: [] };
  const rules = await pool.query('SELECT * FROM automation_rules WHERE is_active=true ORDER BY id');
  const runs = [];
  for (const rule of rules.rows) {
    const started = await pool.query('INSERT INTO automation_runs(rule_id,status) VALUES($1,\'RUNNING\') RETURNING id', [rule.id]);
    try {
      const handler = RULE_HANDLERS[rule.rule_type];
      if (!handler) throw new Error(`Unsupported rule type: ${rule.rule_type}`);
      const matches = await handler(pool, rule);
      for (const row of matches.rows) {
        const notification = notificationFor(rule, row);
        await pool.query(`INSERT INTO notifications(organization_id,rule_id,severity,title,body,entity_type,entity_id,dedupe_key)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,dedupe_key) DO NOTHING`, [rule.organization_id,rule.id,notification.severity,notification.title,notification.body,notification.entityType,notification.entityId,notification.dedupeKey]);
      }
      await pool.query('UPDATE automation_runs SET status=\'SUCCEEDED\',finished_at=now(),matched_count=$1 WHERE id=$2', [matches.rowCount, started.rows[0].id]);
      runs.push({ ruleId: rule.id, matched: matches.rowCount, status: 'SUCCEEDED' });
    } catch (error) {
      await pool.query('UPDATE automation_runs SET status=\'FAILED\',finished_at=now(),error_message=$1 WHERE id=$2', [String(error.message).slice(0,500), started.rows[0].id]);
      runs.push({ ruleId: rule.id, status: 'FAILED', error: error.message });
    }
  }
  return { skipped: false, runs };
}

module.exports = { RULE_HANDLERS, notificationFor, acquireLease, runAutomationOnce };
