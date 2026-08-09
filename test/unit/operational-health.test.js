const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateOperationalSnapshot } = require('../../src/operations/health-policy');

const healthy = () => ({frontendStatus:200,backendStatus:200,readinessStatus:200,pendingOutboxOld:0,expiredSessions:0,stuckIdempotency:0,recent5xx:0,backupVerified:true,backupAgeMinutes:10,restoreVerified:true,restoreDrillAgeMinutes:20});
test('운영 상태는 endpoint·DB·백업·복구 증거가 모두 정상일 때만 통과한다',()=>assert.equal(evaluateOperationalSnapshot(healthy()).ok,true));
test('오래된 outbox·5xx·백업·복구 실패는 원인별로 차단한다',()=>{const result=evaluateOperationalSnapshot({...healthy(),pendingOutboxOld:2,recent5xx:1,backupVerified:false,restoreVerified:false});assert.equal(result.ok,false);assert.match(result.failures.join('\n'),/outbox/);assert.match(result.failures.join('\n'),/5xx/);assert.match(result.failures.join('\n'),/backup/);assert.match(result.failures.join('\n'),/restore/);});
test('승인된 임계치는 숫자 범위 안에서만 완화한다',()=>{const snapshot={...healthy(),pendingOutboxOld:2};assert.equal(evaluateOperationalSnapshot(snapshot,{maxPendingOutboxOld:2}).ok,true);assert.equal(evaluateOperationalSnapshot(snapshot,{maxPendingOutboxOld:1}).ok,false);});
