// Runs only inside the invocation-owned synthetic backend.
export async function verifyImportPostgres() {
  const assert = require('node:assert/strict');
  const { Pool } = require('pg');
  const { analyzeAssetImport, commitAssetImport } = require('./src/services/asset-import-service');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    assert.equal((await pool.query('SELECT current_database() name')).rows[0].name, 'r0_synthetic');
    const row = (await pool.query("SELECT id,organization_id,department_id,role FROM users WHERE email='admin@seowon.local'")).rows[0];
    assert.ok(row);
    const user = { id: Number(row.id), organizationId: Number(row.organization_id), departmentId: Number(row.department_id), role: row.role };
    const csv = '자산번호,자산명\nR0-IMPORT-001,합성 노트북\nR0-IMPORT-002,합성 모니터';
    const preview = await analyzeAssetImport(pool,user,csv);
    assert.equal(preview.summary.invalid,0);
    const counts = async () => (await pool.query(`SELECT
      (SELECT count(*)::int FROM assets) assets,
      (SELECT count(*)::int FROM asset_status_histories) histories,
      (SELECT count(*)::int FROM audit_logs) audits,
      (SELECT count(*)::int FROM outbox_events) outbox`)).rows[0];
    const before = await counts();
    let inserted=0;
    const failingPool = { connect: async () => {
      const client=await pool.connect();
      return { release:()=>client.release(), query:async(sql,args)=>{
        const result=await client.query(sql,args);
        if(sql.includes('INSERT INTO assets') && ++inserted===2) await client.query('SELECT 1/0');
        return result;
      }};
    }};
    await assert.rejects(()=>commitAssetImport(failingPool,user,csv,preview.checksum),error=>error.code==='22012');
    assert.equal(inserted,2);
    assert.deepEqual(await counts(),before);
    const retried=await commitAssetImport(pool,user,csv,preview.checksum);
    assert.equal(retried.imported,2);
    const after=await counts();
    assert.deepEqual(after,{assets:before.assets+2,histories:before.histories+2,audits:before.audits+3,outbox:before.outbox+2});
    await assert.rejects(()=>commitAssetImport(pool,user,csv,preview.checksum),error=>error.code==='ASSET_IMPORT_VALIDATION_FAILED');
    assert.deepEqual(await counts(),after);
    return {status:'PASS',checks:['second insert database failure exercised','assets histories audits outbox rolled back together','same file retry succeeds once','repeat import rejected without additional rows'],syntheticOnly:true};
  } finally { await pool.end(); }
}
