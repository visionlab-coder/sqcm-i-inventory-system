// Diagnostic only: detects whether recorded repair costs reach the TCO reader.
export async function probeRepairCost() {
  const assert = require('node:assert/strict');
  const { Pool } = require('pg');
  const { getCostCommandCenter } = require('./src/services/cost-service');
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  try {
    assert.equal((await pool.query('SELECT current_database() name')).rows[0].name,'r0_synthetic');
    const actor=(await pool.query("SELECT id,organization_id FROM users WHERE email='admin@seowon.local'")).rows[0];
    const user={id:Number(actor.id),organizationId:Number(actor.organization_id)};
    const before=await getCostCommandCenter(pool,user,user.organizationId);
    const asset=(await pool.query("INSERT INTO assets(organization_id,asset_tag,name,created_by) VALUES($1,'R3-REPAIR-PROBE','Synthetic repair',$2) RETURNING id",[user.organizationId,user.id])).rows[0].id;
    const ticket=(await pool.query("INSERT INTO service_tickets(organization_id,asset_id,reporter_id,status,symptom,cost) VALUES($1,$2,$3,'RESOLVED','Synthetic provenance',12345) RETURNING id,cost",[user.organizationId,asset,user.id])).rows[0];
    const after=await getCostCommandCenter(pool,user,user.organizationId);
    const delta=Number(after.summary.repair_cost)-Number(before.summary.repair_cost);
    const receipt={status:delta===12345?'PASS':'GAP_CONFIRMED',recordedRepairCost:Number(ticket.cost),tcoRepairDelta:delta,expectedDelta:12345,syntheticOnly:true,actualPostgres:true,actualHttpWrite:false,productionChanged:false};
    // Current status-only update route converts an omitted cost to NULL.
    await pool.query("UPDATE service_tickets SET status='CLOSED',cost=$1 WHERE id=$2",[null,ticket.id]);
    receipt.statusOnlyUpdatePreservesCost=(await pool.query('SELECT cost FROM service_tickets WHERE id=$1',[ticket.id])).rows[0].cost!==null;
    return receipt;
  } finally { await pool.end(); }
}
