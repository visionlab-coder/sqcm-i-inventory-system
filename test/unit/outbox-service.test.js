const test=require('node:test');
const assert=require('node:assert/strict');
const {retryDelaySeconds,safeError,publishOne}=require('../../src/services/outbox-service');

test('outbox 재시도는 지수 백오프와 1시간 상한을 적용한다',()=>{
  assert.equal(retryDelaySeconds(1),2);
  assert.equal(retryDelaySeconds(5),32);
  assert.equal(retryDelaySeconds(20),1024);
});

test('outbox 오류는 줄바꿈과 과도한 길이를 제거한다',()=>{
  const value=safeError(new Error(`민감하지 않은 오류\n${'x'.repeat(600)}`));
  assert.equal(value.includes('\n'),false);
  assert.equal(value.length,500);
});

function fakePool(event){
  const calls=[];
  const client={async query(sql,params=[]){calls.push({sql,params});if(sql.includes('SELECT id,aggregate_type'))return{rowCount:event?1:0,rows:event?[event]:[]};return{rowCount:1,rows:[]};},release(){}};
  return{calls,async connect(){return client;},async query(sql,params=[]){calls.push({sql,params});return{rowCount:1,rows:[]};}};
}

test('outbox 성공은 공급자 멱등키를 전달하고 published_at을 기록한다',async()=>{
  const pool=fakePool({id:7,aggregate_type:'REQUEST',aggregate_id:'11',event_type:'APPROVED',payload:{ok:true},idempotency_key:'request-11',publish_attempts:0});
  let delivered;
  const result=await publishOne(pool,{async publish(event){delivered=event;}},'worker-1');
  assert.equal(result.status,'published');
  assert.equal(delivered.idempotencyKey,'request-11');
  assert.ok(pool.calls.some(call=>call.sql.includes('published_at=now()')));
});

test('outbox 공급자 실패는 오류를 저장하고 재시도 상태를 반환한다',async()=>{
  const pool=fakePool({id:8,aggregate_type:'ASSET',aggregate_id:'2',event_type:'UPDATED',payload:{},idempotency_key:null,publish_attempts:1});
  const result=await publishOne(pool,{async publish(){throw new Error('provider timeout');}},'worker-2');
  assert.equal(result.status,'retry');
  assert.equal(result.error,'provider timeout');
  assert.ok(pool.calls.some(call=>call.sql.includes('next_attempt_at')));
});
