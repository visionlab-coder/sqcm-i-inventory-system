const crypto = require('node:crypto');

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,99}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const retryDelaySeconds = attempts => Math.min(3600, 2 ** Math.min(10, Math.max(1, attempts)));
const failureCode = error => SAFE_CODE.test(String(error?.code || '').trim().toUpperCase())
  ? String(error.code).trim().toUpperCase() : 'OUTBOX_PUBLISH_FAILED';
function outboxError(code,status){const error=new Error(code);error.code=code;error.status=status;return error;}

async function claimNext(pool, workerId, { eventId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,publish_attempts
      FROM outbox_events
      WHERE published_at IS NULL AND dead_lettered_at IS NULL AND next_attempt_at<=now()
        AND ($1::bigint IS NULL OR id=$1)
        AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,[eventId]);
    if (!found.rowCount) { await client.query('COMMIT'); return null; }
    const event = found.rows[0];
    await client.query(`UPDATE outbox_events SET locked_at=now(),locked_by=$1,publish_attempts=publish_attempts+1 WHERE id=$2`, [workerId,event.id]);
    await client.query('COMMIT');
    return {...event,publish_attempts:Number(event.publish_attempts)+1};
  } catch(error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

async function publishOne(pool, publisher, workerId=crypto.randomUUID(), options={}) {
  const event = await claimNext(pool, workerId, options);
  if (!event) return {status:'idle'};
  try {
    const published = await publisher.publish({id:String(event.id),type:event.event_type,aggregateType:event.aggregate_type,aggregateId:event.aggregate_id,payload:event.payload,idempotencyKey:event.idempotency_key||`outbox-${event.id}`});
    const receiptId = String(published?.id || '').trim();
    const provider = String(published?.provider || publisher.providerId || 'event-publisher').trim();
    if (!SAFE_ID.test(receiptId)) { const invalid=new Error('OUTBOX_RECEIPT_INVALID');invalid.code='OUTBOX_RECEIPT_INVALID';throw invalid; }
    if (!SAFE_ID.test(provider)) { const invalid=new Error('OUTBOX_PROVIDER_INVALID');invalid.code='OUTBOX_PROVIDER_INVALID';throw invalid; }
    const receiptSha256 = String(published?.responseSha256 || crypto.createHash('sha256').update(JSON.stringify({id:receiptId})).digest('hex'));
    if (!/^[a-f0-9]{64}$/.test(receiptSha256)) { const invalid=new Error('OUTBOX_RECEIPT_HASH_INVALID');invalid.code='OUTBOX_RECEIPT_HASH_INVALID';throw invalid; }
    await pool.query(`UPDATE outbox_events SET published_at=now(),locked_at=NULL,locked_by=NULL,last_error=NULL,last_error_code=NULL,
      delivery_provider=$1,delivery_receipt_id=$2,delivery_receipt_sha256=$3 WHERE id=$4 AND locked_by=$5`,[provider,receiptId,receiptSha256,event.id,workerId]);
    return {status:'published',id:event.id,receiptId};
  } catch(error) {
    const dead=event.publish_attempts>=10;
    const code=failureCode(error);
    await pool.query(`UPDATE outbox_events SET locked_at=NULL,locked_by=NULL,last_error=NULL,last_error_code=$1,
      next_attempt_at=now()+($2::text||' seconds')::interval,dead_lettered_at=CASE WHEN $3 THEN now() ELSE NULL END
      WHERE id=$4 AND locked_by=$5`,[code,retryDelaySeconds(event.publish_attempts),dead,event.id,workerId]);
    return {status:dead?'dead-lettered':'retry',id:event.id,errorCode:code};
  }
}

async function requeueDeadLetter(pool,user,outboxId,trace={}) {
  if (!user || user.role !== 'ADMIN') throw outboxError('OUTBOX_REQUEUE_FORBIDDEN',403);
  const id=Number(outboxId);
  if (!Number.isInteger(id)||id<=0) throw outboxError('OUTBOX_ID_INVALID',400);
  const organizationId=Number(user.organizationId);
  if(!Number.isInteger(organizationId)||organizationId<=0) throw outboxError('OUTBOX_ORGANIZATION_REQUIRED',403);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const found=await client.query(`SELECT id,dead_lettered_at,published_at FROM outbox_events
      WHERE id=$1 AND dead_lettered_at IS NOT NULL AND published_at IS NULL
        AND ((payload ? 'organizationId' AND payload->>'organizationId'=$2::text)
          OR (aggregate_type='ASSET' AND aggregate_id ~ '^[0-9]+$' AND EXISTS(SELECT 1 FROM assets a WHERE a.id=aggregate_id::bigint AND a.organization_id=$2::bigint))
          OR (aggregate_type='REQUEST' AND aggregate_id ~ '^[0-9]+$' AND EXISTS(SELECT 1 FROM workflow_requests r WHERE r.id=aggregate_id::bigint AND r.organization_id=$2::bigint)))
      FOR UPDATE`,[id,organizationId]);
    if(!found.rowCount) throw outboxError('OUTBOX_DEAD_LETTER_NOT_FOUND',404);
    const updated=await client.query(`UPDATE outbox_events SET publish_attempts=0,next_attempt_at=now(),locked_at=NULL,locked_by=NULL,
      last_error=NULL,last_error_code=NULL,dead_lettered_at=NULL WHERE id=$1 RETURNING id,publish_attempts,next_attempt_at`,[id]);
    await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address)
      VALUES($1,$2,'OUTBOX_REQUEUED','OUTBOX_EVENT',$3,'{}'::jsonb,$4,$5)`,
    [organizationId,user.id,String(id),trace.requestId||null,trace.ip||null]);
    await client.query('COMMIT');
    return updated.rows[0];
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function publishBatch(pool,publisher,size=20) {
  const results=[];
  for(let index=0;index<size;index+=1){const result=await publishOne(pool,publisher);if(result.status==='idle')break;results.push(result);}
  return results;
}

module.exports={retryDelaySeconds,failureCode,publishOne,publishBatch,requeueDeadLetter};
