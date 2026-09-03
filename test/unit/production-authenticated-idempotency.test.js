const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePromise = import('../../src/operations/production-authenticated-idempotency.mjs');

const passing = { missingCsrfStatus:403,missingCsrfCode:'CSRF_INVALID',firstStatus:201,assetId:7,replayStatus:201,replayHeader:'true',replayAssetId:7,conflictStatus:409,conflictCode:'IDEMPOTENCY_CONFLICT',assetCount:1,auditCount:1,keyCount:1,cleanupAssetCount:0,cleanupAuditCount:0,cleanupKeyCount:0,logoutStatus:204 };

test('정상 쓰기·replay·conflict·DB·cleanup이 모두 맞으면 PASS한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency(passing);assert.equal(result.status,'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY');assert.deepEqual(result.failures,[]);assert.equal(result.productionGo,false);});
test('CSRF 누락이 403 전용 코드로 거부되지 않으면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,missingCsrfStatus:200});assert.ok(result.failures.includes('CSRF_NEGATIVE_CHECK_FAILED'));});
test('동일 key replay 또는 다른 payload conflict가 다르면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,replayHeader:null,conflictStatus:201});assert.ok(result.failures.includes('IDEMPOTENT_REPLAY_FAILED'));assert.ok(result.failures.includes('IDEMPOTENCY_CONFLICT_CHECK_FAILED'));});
test('DB 단일 행·감사·정리가 확인되지 않으면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,assetCount:2,cleanupKeyCount:1});assert.ok(result.failures.includes('DATABASE_EVIDENCE_FAILED'));assert.ok(result.failures.includes('CLEANUP_FAILED'));});

const window = {
  windowStart:new Date('2026-09-03T20:00:00+09:00'),
  windowEnd:new Date('2026-09-03T23:00:00+09:00')
};
test('기본 인증 idempotency 실행은 loopback 기준선만 사용한다',async()=>{const {selectAuthenticatedIdempotencyTarget}=await modulePromise;const result=selectAuthenticatedIdempotencyTarget({...window,now:new Date('2026-09-01T18:00:00+09:00')});assert.equal(result.target,'http://127.0.0.1:3300');assert.equal(result.actualProductionGate,false);});
test('변경창 밖 공개 인증 idempotency 쓰기를 차단한다',async()=>{const {selectAuthenticatedIdempotencyTarget}=await modulePromise;const result=selectAuthenticatedIdempotencyTarget({...window,publicMode:true,now:new Date('2026-09-01T18:00:00+09:00')});assert.equal(result.status,'FAIL_PUBLIC_AUTHENTICATED_IDEMPOTENCY_OUTSIDE_CHANGE_WINDOW');assert.equal(result.target,null);});
test('변경창 안 공개 인증 idempotency는 exact Production HTTPS만 사용한다',async()=>{const {selectAuthenticatedIdempotencyTarget}=await modulePromise;const result=selectAuthenticatedIdempotencyTarget({...window,publicMode:true,now:new Date('2026-09-03T21:00:00+09:00')});assert.equal(result.target,'https://inventory.safe-link.co.kr');assert.equal(result.actualProductionGate,true);});
test('loopback 성공을 실제 Production CSRF idempotency 증거로 승격하지 않는다',async()=>{const {classifyAuthenticatedIdempotencyEvidence}=await modulePromise;const result=classifyAuthenticatedIdempotencyEvidence({status:'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY',failures:[],productionGo:false},false);assert.equal(result.status,'PASS_LOOPBACK_AUTHENTICATED_CSRF_IDEMPOTENCY_BASELINE');assert.equal(result.actualAuthenticatedCsrfIdempotency,'NOT_RUN');});
test('공개 Production 성공만 실제 CSRF idempotency 증거가 된다',async()=>{const {classifyAuthenticatedIdempotencyEvidence}=await modulePromise;const result=classifyAuthenticatedIdempotencyEvidence({status:'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY',failures:[],productionGo:false},true);assert.equal(result.status,'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY');assert.equal(result.actualAuthenticatedCsrfIdempotency,'PASS');});
test('실제 인증 쓰기 요청은 선택된 target의 same-origin 헤더를 전송한다',()=>{const source=fs.readFileSync(path.join(__dirname,'../../scripts/production-authenticated-idempotency.mjs'),'utf8');assert.match(source,/origin:target/);});
test('시험 asset 정리는 자동 생성된 재무 profile을 asset보다 먼저 제거한다',()=>{const source=fs.readFileSync(path.join(__dirname,'../../scripts/production-authenticated-idempotency.mjs'),'utf8');assert.ok(source.indexOf('delete from asset_financial_profiles')<source.indexOf("delete from assets where asset_tag"));});
test('DB가 정규화하는 asset tag와 cleanup marker는 동일한 대문자를 사용한다',()=>{const source=fs.readFileSync(path.join(__dirname,'../../scripts/production-authenticated-idempotency.mjs'),'utf8');assert.match(source,/slice\(0, 16\)\.toUpperCase\(\)/);assert.match(source,/`P6-IDEM-\$\{marker\}`\.toUpperCase\(\)/);});
test('직전 Gate의 TOTP 재사용 401은 다음 30초 구간의 새 코드로 한 번만 재검증한다',()=>{const source=fs.readFileSync(path.join(__dirname,'../../scripts/production-authenticated-idempotency.mjs'),'utf8');assert.match(source,/mfaResponse\.status === 401/);assert.match(source,/30 - \(Math\.floor\(Date\.now\(\) \/ 1000\) % 30\)/);assert.match(source,/mfa-retry-/);});
