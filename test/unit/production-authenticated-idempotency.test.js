const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../../src/operations/production-authenticated-idempotency.mjs');

const passing = { missingCsrfStatus:403,missingCsrfCode:'CSRF_INVALID',firstStatus:201,assetId:7,replayStatus:201,replayHeader:'true',replayAssetId:7,conflictStatus:409,conflictCode:'IDEMPOTENCY_CONFLICT',assetCount:1,auditCount:1,keyCount:1,cleanupAssetCount:0,cleanupAuditCount:0,cleanupKeyCount:0,logoutStatus:204 };

test('정상 쓰기·replay·conflict·DB·cleanup이 모두 맞으면 PASS한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency(passing);assert.equal(result.status,'PASS_AUTHENTICATED_CSRF_IDEMPOTENCY');assert.deepEqual(result.failures,[]);assert.equal(result.productionGo,false);});
test('CSRF 누락이 403 전용 코드로 거부되지 않으면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,missingCsrfStatus:200});assert.ok(result.failures.includes('CSRF_NEGATIVE_CHECK_FAILED'));});
test('동일 key replay 또는 다른 payload conflict가 다르면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,replayHeader:null,conflictStatus:201});assert.ok(result.failures.includes('IDEMPOTENT_REPLAY_FAILED'));assert.ok(result.failures.includes('IDEMPOTENCY_CONFLICT_CHECK_FAILED'));});
test('DB 단일 행·감사·정리가 확인되지 않으면 실패한다', async()=>{const {evaluateAuthenticatedIdempotency}=await modulePromise;const result=evaluateAuthenticatedIdempotency({...passing,assetCount:2,cleanupKeyCount:1});assert.ok(result.failures.includes('DATABASE_EVIDENCE_FAILED'));assert.ok(result.failures.includes('CLEANUP_FAILED'));});
