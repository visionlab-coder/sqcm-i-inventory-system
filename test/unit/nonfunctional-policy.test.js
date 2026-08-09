const test=require('node:test');const assert=require('node:assert/strict');
const {evaluateLoad,isAllowedTarget,percentile}=require('../../src/operations/nonfunctional-policy');
test('percentile은 정렬된 p95 경계를 계산한다',()=>assert.equal(percentile([5,1,3,2,4],.95),5));
test('비기능 시험은 기본적으로 안전한 내부 대상만 허용한다',()=>{assert.equal(isAllowedTarget('http://localhost:3000'),true);assert.equal(isAllowedTarget('https://pilot.internal'),true);assert.equal(isAllowedTarget('https://example.com'),false);});
test('부하 판정은 오류율과 p95 임계치를 함께 강제한다',()=>{assert.equal(evaluateLoad([{ok:true,durationMs:10},{ok:true,durationMs:20}],{maxP95Ms:20}).ok,true);assert.equal(evaluateLoad([{ok:false,durationMs:10}],{maxP95Ms:20}).ok,false);assert.equal(evaluateLoad([{ok:true,durationMs:30}],{maxP95Ms:20}).ok,false);});
