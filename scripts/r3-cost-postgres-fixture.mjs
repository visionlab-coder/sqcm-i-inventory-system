// Runs only inside the invocation-owned synthetic backend; never loads host Secrets.
export async function verifyCostPostgres() {
  const assert = require('node:assert/strict');
  const { Pool } = require('pg');
  const { getCostRoiSummary } = require('./src/services/cost-service');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    assert.equal((await pool.query('SELECT current_database() name')).rows[0].name, 'r0_synthetic');
    const row = (await pool.query("SELECT id,organization_id FROM users WHERE email='employee@seowon.local'")).rows[0];
    const org = Number(row.organization_id), user = { id: Number(row.id), organizationId: org };
    const depts = (await pool.query("INSERT INTO departments(organization_id,code,name) VALUES($1,'R3-OWN','Synthetic own'),($1,'R3-OTHER','Synthetic other') RETURNING id",[org])).rows;
    const assets = [];
    for (let i=0;i<2;i++) assets.push((await pool.query('INSERT INTO assets(organization_id,asset_tag,name,department_id,created_by) VALUES($1,$2,$2,$3,$4) RETURNING id',[org,`R3-COST-${i}`,depts[i].id,user.id])).rows[0].id);
    for (const [asset,amount] of [[assets[0],10],[assets[1],100],[null,1000]]) {
      await pool.query("INSERT INTO cost_savings_events(organization_id,asset_id,savings_type,baseline_cost,actual_cost,avoided_amount,created_by) VALUES($1,$2,'REUSE_AVOIDED_PURCHASE',$3,0,$3,$4)",[org,asset,amount,user.id]);
    }
    await pool.query("INSERT INTO vendors(organization_id,code,name) VALUES($1,'R3-COST','Synthetic vendor')",[org]);
    await pool.query("INSERT INTO cost_budgets(organization_id,cost_center,fiscal_year,amount,created_by) VALUES($1,'R3-COST',EXTRACT(YEAR FROM current_date)::int,1234,$2)",[org,user.id]);
    const scoped = await getCostRoiSummary(pool,user,org,{departmentIds:[Number(depts[0].id)]});
    assert.equal(Number(scoped.savings.realized_savings),10);
    assert.equal(scoped.savings.event_count,1);
    assert.equal(scoped.utilization.asset_count,1);
    assert.deepEqual(scoped.vendors,[]); assert.deepEqual(scoped.budgets,[]);
    assert.equal(scoped.visibility.organizationAggregatesRestricted,true);
    const all = await getCostRoiSummary(pool,user,org);
    assert.ok(Number(all.savings.realized_savings)>=1110);
    assert.ok(all.vendors.some(v=>v.name==='Synthetic vendor'));
    assert.ok(all.budgets.some(b=>b.cost_center==='R3-COST' && b.budget===1234));
    assert.equal(all.visibility.organizationAggregatesRestricted,false);
    return {status:'PASS',checks:['own-department-only','unassigned-excluded','organization-aggregates-withheld','organization-baseline-preserved'],actualPostgres:true,syntheticOnly:true};
  } finally { await pool.end(); }
}
