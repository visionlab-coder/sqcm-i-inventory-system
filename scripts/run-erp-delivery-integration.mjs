import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPool, initializeDatabase } = require('../src/db');
const { createErpEapprovalPublisher } = require('../src/adapters/erp-eapproval-publisher');
const { publishOne, requeueDeadLetter } = require('../src/services/outbox-service');

if (!process.env.DATABASE_URL) throw new Error('Local integration DATABASE_URL is required.');
process.env.DB_AUTO_MIGRATE='false';process.env.DB_RUN_SEEDS='false';process.env.DB_MIGRATION_HISTORY_MODE='application';
const pool=createPool(process.env.DATABASE_URL);
const marker=crypto.randomUUID();const ids=[];let userId;let passed=false;

try{
  await initializeDatabase(pool,{dbAutoMigrate:false,dbRunSeeds:false,dbMigrationHistoryMode:'application'});
  const organization=await pool.query("SELECT id FROM organizations WHERE code='SEOWON'");assert.equal(organization.rowCount,1);const organizationId=organization.rows[0].id;
  const user=await pool.query(`INSERT INTO users(email,display_name,password_hash,role,status,organization_id)
    VALUES($1,'합성 ERP 관리자','$2b$12$synthetic.erp.delivery.only','ADMIN','ACTIVE',$2) RETURNING id`,[`erp-admin-${marker}@example.invalid`,organizationId]);userId=user.rows[0].id;
  const success=await pool.query(`INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key)
    VALUES('REQUEST',$1,'REQUEST_APPROVED',$2::jsonb,$3) RETURNING id`,['991001',JSON.stringify({organizationId,requestId:991001}),`erp-success-${marker}`]);ids.push(success.rows[0].id);
  const publisher=createErpEapprovalPublisher({endpoint:'https://erp.example/events',providerId:'integration-erp',secret:'x'.repeat(32)},async()=>({ok:true,status:202,headers:{get(){return null;}},async text(){return JSON.stringify({receiptId:`receipt-${marker}`,status:'accepted'});}}));
  const published=await publishOne(pool,publisher,`worker-${marker}`,{eventId:success.rows[0].id});assert.equal(published.status,'published');
  const receipt=await pool.query('SELECT delivery_provider,delivery_receipt_id,delivery_receipt_sha256,published_at FROM outbox_events WHERE id=$1',[success.rows[0].id]);
  assert.equal(receipt.rows[0].delivery_provider,'integration-erp');assert.equal(receipt.rows[0].delivery_receipt_id,`receipt-${marker}`);assert.match(receipt.rows[0].delivery_receipt_sha256,/^[a-f0-9]{64}$/);assert.ok(receipt.rows[0].published_at);

  const failed=await pool.query(`INSERT INTO outbox_events(aggregate_type,aggregate_id,event_type,payload,idempotency_key,publish_attempts)
    VALUES('REQUEST',$1,'REQUEST_APPROVED',$2::jsonb,$3,9) RETURNING id`,['991002',JSON.stringify({organizationId,requestId:991002}),`erp-fail-${marker}`]);ids.push(failed.rows[0].id);
  const failurePublisher={providerId:'integration-erp',async publish(){const error=new Error('private endpoint timeout');error.code='ERP_PROVIDER_TIMEOUT';throw error;}};
  const dead=await publishOne(pool,failurePublisher,`worker-${marker}`,{eventId:failed.rows[0].id});assert.deepEqual(dead,{status:'dead-lettered',id:failed.rows[0].id,errorCode:'ERP_PROVIDER_TIMEOUT'});
  const stored=await pool.query('SELECT last_error,last_error_code,dead_lettered_at FROM outbox_events WHERE id=$1',[failed.rows[0].id]);assert.equal(stored.rows[0].last_error,null);assert.equal(stored.rows[0].last_error_code,'ERP_PROVIDER_TIMEOUT');assert.ok(stored.rows[0].dead_lettered_at);
  const requeued=await requeueDeadLetter(pool,{id:userId,role:'ADMIN',organizationId},failed.rows[0].id,{requestId:`integration-${marker}`,ip:'127.0.0.1'});assert.equal(Number(requeued.publish_attempts),0);
  const audit=await pool.query("SELECT count(*)::int count FROM audit_logs WHERE actor_user_id=$1 AND action='OUTBOX_REQUEUED' AND entity_id=$2",[userId,String(failed.rows[0].id)]);assert.equal(audit.rows[0].count,1);
  passed=true;
}finally{
  if(userId)await pool.query("DELETE FROM audit_logs WHERE actor_user_id=$1 AND action='OUTBOX_REQUEUED'",[userId]);
  if(ids.length)await pool.query('DELETE FROM outbox_events WHERE id=ANY($1::bigint[])',[ids]);
  if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
  const remaining=ids.length?await pool.query('SELECT count(*)::int count FROM outbox_events WHERE id=ANY($1::bigint[])',[ids]):{rows:[{count:0}]};
  if(passed){assert.equal(remaining.rows[0].count,0);console.log(JSON.stringify({status:'PASS',signedDelivery:true,receiptPersisted:true,deadLetter:true,adminRequeueAudit:true,cleanupRows:0}));}
  await pool.end();
}
