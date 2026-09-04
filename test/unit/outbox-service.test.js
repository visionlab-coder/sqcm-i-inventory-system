const test=require('node:test');
const assert=require('node:assert/strict');
const {retryDelaySeconds,failureCode,publishOne,requeueDeadLetter}=require('../../src/services/outbox-service');

test('outbox 재시도는 지수 백오프와 1시간 상한을 적용한다',()=>{
  assert.equal(retryDelaySeconds(1),2);
  assert.equal(retryDelaySeconds(5),32);
  assert.equal(retryDelaySeconds(20),1024);
});

test('outbox 오류는 원문 대신 제한된 코드만 저장한다',()=>{
  assert.equal(failureCode({code:'ERP_PROVIDER_TIMEOUT'}),'ERP_PROVIDER_TIMEOUT');
  assert.equal(failureCode(new Error('https://secret.example/path failed')),'OUTBOX_PUBLISH_FAILED');
});

function fakePool(event){
  const calls=[];
  const client={async query(sql,params=[]){calls.push({sql,params});if(sql.includes('SELECT id,aggregate_type'))return{rowCount:event?1:0,rows:event?[event]:[]};return{rowCount:1,rows:[]};},release(){}};
  return{calls,async connect(){return client;},async query(sql,params=[]){calls.push({sql,params});return{rowCount:1,rows:[]};}};
}

test('outbox 성공은 공급자 멱등키를 전달하고 published_at을 기록한다',async()=>{
  const pool=fakePool({id:7,aggregate_type:'REQUEST',aggregate_id:'11',event_type:'APPROVED',payload:{ok:true},idempotency_key:'request-11',publish_attempts:0});
  let delivered;
  const result=await publishOne(pool,{providerId:'approved-erp',async publish(event){delivered=event;return{id:'receipt-1',responseSha256:'a'.repeat(64)};}},'worker-1');
  assert.equal(result.status,'published');
  assert.equal(result.receiptId,'receipt-1');
  assert.equal(delivered.idempotencyKey,'request-11');
  assert.ok(pool.calls.some(call=>call.sql.includes('published_at=now()')));
  assert.ok(pool.calls.some(call=>call.params.includes('receipt-1')));
});

test('outbox 공급자 실패는 오류 원문 없이 재시도 상태를 반환한다',async()=>{
  const pool=fakePool({id:8,aggregate_type:'ASSET',aggregate_id:'2',event_type:'UPDATED',payload:{},idempotency_key:null,publish_attempts:1});
  const result=await publishOne(pool,{async publish(){const error=new Error('secret endpoint timeout');error.code='ERP_PROVIDER_TIMEOUT';throw error;}},'worker-2');
  assert.equal(result.status,'retry');
  assert.equal(result.errorCode,'ERP_PROVIDER_TIMEOUT');
  assert.equal(JSON.stringify(pool.calls).includes('secret endpoint'),false);
  assert.ok(pool.calls.some(call=>call.sql.includes('next_attempt_at')));
});

test('receipt가 없거나 형식이 잘못되면 published로 승격하지 않는다',async()=>{
  const pool=fakePool({id:9,aggregate_type:'REQUEST',aggregate_id:'12',event_type:'APPROVED',payload:{},idempotency_key:'request-12',publish_attempts:0});
  const result=await publishOne(pool,{async publish(){return{};}},'worker-3');
  assert.deepEqual(result,{status:'retry',id:9,errorCode:'OUTBOX_RECEIPT_INVALID'});
  assert.equal(pool.calls.some(call=>call.sql.includes('published_at=now()')),false);
});

test('관리자 재처리는 dead-letter 한 건만 감사와 함께 READY로 되돌린다',async()=>{
  const calls=[];
  const client={async query(sql,params=[]){calls.push({sql,params});if(sql.includes('FROM outbox_events')&&sql.includes('FOR UPDATE'))return{rowCount:1,rows:[{id:10,dead_lettered_at:new Date(),published_at:null}]};if(sql.includes('UPDATE outbox_events'))return{rowCount:1,rows:[{id:10,publish_attempts:0,next_attempt_at:new Date()}]};return{rowCount:1,rows:[]};},release(){}};
  const pool={async connect(){return client;}};
  const result=await requeueDeadLetter(pool,{id:3,role:'ADMIN',organizationId:1},10,{requestId:'req-1'});
  assert.equal(result.id,10);
  assert.equal(calls.some(call=>call.sql.includes('OUTBOX_REQUEUED')),true);
  assert.equal(calls.some(call=>call.sql==='COMMIT'),true);
  assert.equal(calls.find(call=>call.sql.includes('FROM outbox_events')).params[1],1);
});
