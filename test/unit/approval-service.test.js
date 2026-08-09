const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeApprovalPolicy, requestAmount, requireStepRole } = require('../../src/services/approval-service');

test('승인 정책은 금액 구간과 순차 단계를 정규화한다', () => {
  assert.deepEqual(normalizeApprovalPolicy({ name:'고액 구매 승인',requestType:'purchase',amountMin:'1000000',amountMax:'5000000',priority:'10',steps:[{name:'팀장 승인',approverRole:'manager'},{name:'관리자 승인',approverRole:'admin',departmentScope:'organization'}] }), {
    name:'고액 구매 승인',requestType:'PURCHASE',amountMin:1000000,amountMax:5000000,priority:10,
    steps:[{stepOrder:1,name:'팀장 승인',approverRole:'MANAGER',departmentScope:'REQUEST_DEPARTMENT'},{stepOrder:2,name:'관리자 승인',approverRole:'ADMIN',departmentScope:'ORGANIZATION'}]
  });
});

test('승인 정책은 단계 누락·역전 금액·잘못된 역할을 거부한다', () => {
  assert.throws(()=>normalizeApprovalPolicy({name:'정책',requestType:'PURCHASE',steps:[]}),error=>error.status===400);
  assert.throws(()=>normalizeApprovalPolicy({name:'정책',requestType:'PURCHASE',amountMin:10,amountMax:1,steps:[{name:'승인',approverRole:'MANAGER'}]}),error=>error.status===400);
  assert.throws(()=>normalizeApprovalPolicy({name:'정책',requestType:'PURCHASE',steps:[{name:'승인',approverRole:'USER'}]}),error=>error.status===400);
});

test('구매 요청 금액을 정책 선택 숫자로 변환하고 단계 역할을 강제한다', () => {
  assert.equal(requestAmount({request_type:'PURCHASE',payload:{estimatedAmount:'1234.50'}}),1234.5);
  assert.equal(requestAmount({request_type:'RETURN',payload:{estimatedAmount:'999'}}),0);
  assert.doesNotThrow(()=>requireStepRole({role:'ADMIN'},{approver_role:'MANAGER',step_name:'팀장 승인'}));
  assert.throws(()=>requireStepRole({role:'MANAGER'},{approver_role:'ADMIN',step_name:'관리자 승인'}),error=>error.status===403);
});
