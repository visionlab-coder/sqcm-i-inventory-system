// Serialized into the fresh test backend by r0-authenticated-isolated-check only.
export async function verifyC4Postgres() {
  const assert = require('node:assert/strict');
  const { Pool } = require('pg');
  const { getEmployeeSelfService, createEmployeeAssetRequest } = require('./src/services/employee-self-service');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    assert.equal((await pool.query('SELECT current_database() name')).rows[0].name, 'r0_synthetic');
    const rows = (await pool.query("SELECT id,organization_id,department_id,role FROM users WHERE email='employee@seowon.local'")).rows;
    const row = rows[0];
    const user = { id: Number(row.id), organizationId: Number(row.organization_id), departmentId: Number(row.department_id), role: row.role };
    const other = (await pool.query("SELECT id FROM users WHERE email='manager@seowon.local'")).rows[0].id;
    const asset = (await pool.query('SELECT id FROM assets WHERE organization_id=$1 ORDER BY id LIMIT 1', [user.organizationId])).rows[0].id;
    const values = [user.organizationId, user.id, asset];
    await pool.query(`INSERT INTO workflow_requests(organization_id,requester_id,asset_id,request_type,status,title,reason)
      SELECT $1,$2,$3,'REPAIR',CASE WHEN n<=61 THEN 'DRAFT' ELSE 'COMPLETED' END,'synthetic count','synthetic count'
      FROM generate_series(1,65) n`, values);
    await pool.query(`INSERT INTO service_tickets(organization_id,reporter_id,asset_id,status,symptom)
      SELECT $1,$2,$3,CASE WHEN n<=52 THEN 'OPEN' ELSE 'CLOSED' END,'synthetic count' FROM generate_series(1,55) n`, values);
    await pool.query(`INSERT INTO notifications(organization_id,recipient_user_id,title,body,dedupe_key,read_at)
      SELECT $1,$2,'synthetic count','synthetic count','r0-count-'||n,CASE WHEN n>25 THEN now() END FROM generate_series(1,28) n`, values.slice(0,2));
    await pool.query(`INSERT INTO workflow_requests(organization_id,requester_id,request_type,status,title,reason)
      VALUES($1,$2,'REPAIR','DRAFT','other user','synthetic exclusion')`, [user.organizationId, other]);
    await pool.query(`INSERT INTO service_tickets(organization_id,reporter_id,asset_id,symptom)
      VALUES($1,$2,$3,'other user')`, [user.organizationId, other, asset]);
    await pool.query(`INSERT INTO notifications(organization_id,recipient_user_id,title,body,dedupe_key)
      VALUES($1,$2,'other user','synthetic exclusion','r0-other')`, [user.organizationId, other]);
    const result = await getEmployeeSelfService(pool, user);
    assert.deepEqual(result.summary, { assignedAssets: 0, activeRequests: 61, openRepairs: 52, unreadNotifications: 25 });
    assert.equal(result.requests.length, 50); assert.equal(result.repairs.length, 50); assert.equal(result.notifications.length, 20);
    assert.ok(!result.requests.some(item => item.title === 'other user'));
    const otherResult = await getEmployeeSelfService(pool, { ...user, id: Number(other) });
    assert.deepEqual(otherResult.summary, { assignedAssets: 0, activeRequests: 1, openRepairs: 1, unreadNotifications: 1 });
    await pool.query('INSERT INTO asset_assignments(asset_id,user_id,assigned_by) VALUES($1,$2,$2)', [asset,user.id]);
    const racingPool = {
      connect: () => pool.connect(),
      query: async (sql, args) => {
        const result = await pool.query(sql,args);
        if (sql.includes('FROM asset_assignments')) {
          await pool.query("UPDATE asset_assignments SET ended_at=now(),status='ENDED' WHERE asset_id=$1 AND status='ACTIVE'",[asset]);
        }
        return result;
      }
    };
    await assert.rejects(() => createEmployeeAssetRequest(racingPool,user,{assetId:asset,requestType:'LOST',reason:'synthetic race'}),error=>error.status===403);
    assert.equal((await pool.query("SELECT count(*)::int n FROM workflow_requests WHERE reason='synthetic race'")).rows[0].n,0);
    await pool.query('INSERT INTO asset_assignments(asset_id,user_id,assigned_by) VALUES($1,$2,$2)', [asset,user.id]);
    const revoker = await pool.connect();
    let revocation;
    try {
      const pid = (await revoker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const lockedPool = {
        query: (...args) => pool.query(...args),
        connect: async () => {
          const client=await pool.connect();
          return { release:()=>client.release(), query:async(sql,args)=>{
            const result=await client.query(sql,args);
            if (sql.startsWith('SELECT id FROM asset_assignments') && sql.includes('FOR UPDATE')) {
              revocation=revoker.query("UPDATE asset_assignments SET ended_at=now(),status='ENDED' WHERE asset_id=$1 AND status='ACTIVE'",[asset]);
              let waiting=false;
              for(let n=0;n<50&&!waiting;n++){
                waiting=(await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock';
                if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
              }
              assert.ok(waiting,'assignment revocation must wait for request transaction');
            }
            return result;
          }};
        }
      };
      const created=await createEmployeeAssetRequest(lockedPool,user,{assetId:asset,requestType:'LOST',reason:'synthetic serialized'});
      assert.equal(created.status,'DRAFT');
      assert.ok(revocation,'assignment lock branch exercised');
      await revocation;
      assert.equal((await pool.query("SELECT count(*)::int n FROM audit_logs WHERE action='REQUEST_CREATED' AND entity_id=$1",[String(created.id)])).rows[0].n,1);
    } finally { if(revocation)await revocation; revoker.release(); }
    return { status: 'PASS', checks: ['full counts exceed page caps', 'closed and read rows excluded', 'other actor excluded', 'list caps preserved', 'assignment revoked after precheck blocks request insertion', 'concurrent revocation waits for request commit and single audit'], expectedCounts: [61,52,25], syntheticOnly: true };
  } finally { await pool.end(); }
}
