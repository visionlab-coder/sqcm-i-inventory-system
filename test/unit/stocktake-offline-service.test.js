const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOfflineOperation, normalizeOfflineBatch } = require('../../src/services/stocktake-offline-service');

const valid = { operationId:'123e4567-e89b-42d3-a456-426614174000', assetId:7, baseVersion:0, result:'match', foundLocationId:'3', reason:'정상 확인' };

test('오프라인 재물조사 작업은 UUID·기준 version·정규화 payload hash를 만든다',()=>{
  const value=normalizeOfflineOperation(valid);
  assert.deepEqual({operationId:value.operationId,assetId:value.assetId,baseVersion:value.baseVersion,result:value.result,foundLocationId:value.foundLocationId,reason:value.reason},{operationId:valid.operationId,assetId:7,baseVersion:0,result:'MATCH',foundLocationId:3,reason:'정상 확인'});
  assert.match(value.payloadSha256,/^[0-9a-f]{64}$/);
  assert.equal(value.payloadSha256,normalizeOfflineOperation({...valid,assetId:'7'}).payloadSha256);
});

test('잘못된 operation ID·version·결과·긴 사유를 fail-closed한다',()=>{
  for(const patch of [{operationId:'bad'},{baseVersion:-1},{baseVersion:1.2},{result:'PENDING'},{reason:'가'.repeat(501)}]) assert.throws(()=>normalizeOfflineOperation({...valid,...patch}));
});

test('오프라인 batch는 1~100건과 고유 operation ID를 강제한다',()=>{
  assert.equal(normalizeOfflineBatch([valid]).length,1);
  assert.throws(()=>normalizeOfflineBatch([]));
  assert.throws(()=>normalizeOfflineBatch(Array.from({length:101},(_,index)=>({...valid,operationId:`123e4567-e89b-42d3-a456-${String(index).padStart(12,'0')}`}))));
  assert.throws(()=>normalizeOfflineBatch([valid,valid]));
});
