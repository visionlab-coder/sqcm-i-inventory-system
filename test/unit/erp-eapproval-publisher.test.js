const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createErpEapprovalPublisher } = require('../../src/adapters/erp-eapproval-publisher');

test('ERP 전송은 canonical envelope를 timestamp HMAC으로 서명하고 receipt hash만 반환한다',async()=>{
  let request;
  const publisher=createErpEapprovalPublisher({endpoint:'https://erp.example/events',providerId:'approved-erp',secret:'x'.repeat(32)},async(url,options)=>{
    request={url,options};return{ok:true,status:202,headers:{get(){return null;}},async text(){return JSON.stringify({receiptId:'erp-receipt-001',status:'accepted'});}};
  },()=>new Date('2026-09-04T00:00:00.000Z'));
  const result=await publisher.publish({id:'7',type:'REQUEST_APPROVED',aggregateType:'REQUEST',aggregateId:'11',idempotencyKey:'request-11-approved',payload:{organizationId:1,requestId:11}});
  assert.equal(result.id,'erp-receipt-001');
  assert.equal(result.provider,'approved-erp');
  assert.match(result.responseSha256,/^[a-f0-9]{64}$/);
  assert.equal(request.options.headers['x-sqcm-timestamp'],'1788480000');
  const expected=crypto.createHmac('sha256','x'.repeat(32)).update('1788480000').update('.').update(request.options.body).digest('hex');
  assert.equal(request.options.headers['x-sqcm-signature'],`v1=${expected}`);
});

test('HTTPS·32바이트 Secret·정상 receipt가 아니면 fail-closed 한다',async()=>{
  assert.throws(()=>createErpEapprovalPublisher({endpoint:'http://erp.example/events',providerId:'erp',secret:'x'.repeat(32)}),/HTTPS/);
  assert.throws(()=>createErpEapprovalPublisher({endpoint:'https://erp.example/events',providerId:'erp',secret:'short'}),/secret/);
  const publisher=createErpEapprovalPublisher({endpoint:'https://erp.example/events',providerId:'erp',secret:'x'.repeat(32)},async()=>({ok:true,status:202,headers:{get(){return null;}},async text(){return'{}';}}));
  await assert.rejects(publisher.publish({id:'7',type:'REQUEST_APPROVED',aggregateType:'REQUEST',aggregateId:'11',idempotencyKey:'request-11-approved',payload:{}}),error=>error.code==='OUTBOX_RECEIPT_INVALID');
});
