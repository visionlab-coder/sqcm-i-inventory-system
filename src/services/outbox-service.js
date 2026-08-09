const crypto = require('node:crypto');

const retryDelaySeconds = attempts => Math.min(3600, 2 ** Math.min(10, Math.max(1, attempts)));
const safeError = error => String(error?.message || error || 'publish failed').replace(/[\r\n]+/g, ' ').slice(0, 500);

async function claimNext(pool, workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT id,aggregate_type,aggregate_id,event_type,payload,idempotency_key,publish_attempts
      FROM outbox_events
      WHERE published_at IS NULL AND dead_lettered_at IS NULL AND next_attempt_at<=now()
        AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!found.rowCount) { await client.query('COMMIT'); return null; }
    const event = found.rows[0];
    await client.query(`UPDATE outbox_events SET locked_at=now(),locked_by=$1,publish_attempts=publish_attempts+1 WHERE id=$2`, [workerId,event.id]);
    await client.query('COMMIT');
    return {...event,publish_attempts:Number(event.publish_attempts)+1};
  } catch(error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}

async function publishOne(pool, publisher, workerId=crypto.randomUUID()) {
  const event = await claimNext(pool, workerId);
  if (!event) return {status:'idle'};
  try {
    await publisher.publish({id:String(event.id),type:event.event_type,aggregateType:event.aggregate_type,aggregateId:event.aggregate_id,payload:event.payload,idempotencyKey:event.idempotency_key||`outbox-${event.id}`});
    await pool.query(`UPDATE outbox_events SET published_at=now(),locked_at=NULL,locked_by=NULL,last_error=NULL WHERE id=$1 AND locked_by=$2`,[event.id,workerId]);
    return {status:'published',id:event.id};
  } catch(error) {
    const dead=event.publish_attempts>=10;
    await pool.query(`UPDATE outbox_events SET locked_at=NULL,locked_by=NULL,last_error=$1,
      next_attempt_at=now()+($2::text||' seconds')::interval,dead_lettered_at=CASE WHEN $3 THEN now() ELSE NULL END
      WHERE id=$4 AND locked_by=$5`,[safeError(error),retryDelaySeconds(event.publish_attempts),dead,event.id,workerId]);
    return {status:dead?'dead-lettered':'retry',id:event.id,error:safeError(error)};
  }
}

async function publishBatch(pool,publisher,size=20) {
  const results=[];
  for(let index=0;index<size;index+=1){const result=await publishOne(pool,publisher);if(result.status==='idle')break;results.push(result);}
  return results;
}

module.exports={retryDelaySeconds,safeError,publishOne,publishBatch};
