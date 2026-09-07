const test=require('node:test');
const assert=require('node:assert/strict');
const sha='a'.repeat(40),digest='sha256:'+'b'.repeat(64);
const candidate={sha,target:'synthetic',publicUrl:'https://synthetic.invalid',ciSha:sha,ciConclusion:'success',backendImage:digest,frontendImage:digest};
const approval={candidateSha:sha,target:candidate.target,publicUrl:candidate.publicUrl,window:{start:'2026-09-07T03:30:00Z',rollbackCutoff:'2026-09-07T04:30:00Z',end:'2026-09-07T05:00:00Z'}};
const now=()=>Date.parse('2026-09-07T04:00:00Z');
function fakeDriver(fail) {
 const calls=[];
 const fields={freeze:{ingressBlocked:true,workersStopped:true,activeWritesZero:true},backup:{restoreVerified:true,runtimeFilesPreserved:true,backupDigest:digest,backupReference:'synthetic-memory'},migrate:{historyVerified:true,seedsDisabled:true},switchImages:{imageIdsMatched:true,threeServices:true,privateDatabasePorts:true},verify:{health:true,authenticatedSmoke:true,database:true,tls:true},release:{writesEnabled:true},postReleaseVerify:{publicHttps:true,authenticatedSmoke:true,database:true},rollback:{ingressBlocked:true,originalRuntimeRestored:true,candidateDataPreserved:true,backupDigest:digest}};
 const driver=Object.fromEntries(Object.entries(fields).map(([stage,values])=>[stage,async ctx=>{calls.push(stage);if(stage===fail)throw new Error('sensitive text must never leak');return {runId:ctx.runId,candidateSha:ctx.candidate.sha,...values};}]));
 driver.contain=async ctx=>{calls.push('contain');return {runId:ctx.runId,candidateSha:ctx.candidate.sha,ingressBlocked:true,workersStopped:true,activeWritesZero:true,candidateDataPreserved:true};};
 return {driver,calls};
}
test('R5 exact approval/window/CI gates block before driver execution',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');
 for(const input of [{approval:{...approval,candidateSha:'c'.repeat(40)}},{candidate:{...candidate,ciSha:'d'.repeat(40)}},{now:()=>Date.parse(approval.window.rollbackCutoff)}]){
  const {driver,calls}=fakeDriver();await assert.rejects(executeR5Deployment({approval,candidate,driver,now,execute:true,...input}));assert.deepEqual(calls,[]);
 }
});
test('R5 verified sequence opens writes but never fabricates employee UAT',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();
 const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'DEPLOYED_UAT_PENDING');assert.equal(result.employeeUat,'NOT_RUN');assert.deepEqual(calls,['freeze','backup','migrate','switchImages','verify','release','postReleaseVerify']);
});
test('every pre-release failure enters recovery and never opens traffic',async()=>{
 const {executeR5Deployment,R5_STEPS}=await import('../../src/operations/r5-deployment-executor.mjs');
 for(const fail of R5_STEPS){const {driver,calls}=fakeDriver(fail);const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'ROLLED_BACK_TRAFFIC_HELD');assert.equal(calls.at(-1),'rollback');assert.ok(!calls.includes('release'));assert.ok(!JSON.stringify(result).includes('sensitive'));}
});
test('uncertain release cannot trigger destructive database rollback',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver('release');const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.automaticDatabaseRestore,false);assert.ok(!calls.includes('rollback'));
});
test('backup from a different run cannot permit migration',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();driver.backup=async()=>({runId:'wrong',candidateSha:sha,restoreVerified:true,runtimeFilesPreserved:true});const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'ROLLED_BACK_TRAFFIC_HELD');assert.ok(!calls.includes('migrate'));
});
test('cutoff after verification rolls back without releasing traffic',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();let time=now();const verify=driver.verify;driver.verify=async ctx=>{const receipt=await verify(ctx);time=Date.parse(approval.window.rollbackCutoff);return receipt;};
 const result=await executeR5Deployment({approval,candidate,driver,now:()=>time,execute:true});assert.equal(result.status,'ROLLED_BACK_TRAFFIC_HELD');assert.ok(!calls.includes('release'));
});
test('clock invalidation after freeze fails closed',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();let time=now();const freeze=driver.freeze;driver.freeze=async ctx=>{const receipt=await freeze(ctx);time=NaN;return receipt;};
 const result=await executeR5Deployment({approval,candidate,driver,now:()=>time,execute:true});assert.equal(result.status,'ROLLED_BACK_TRAFFIC_HELD');assert.ok(!calls.includes('backup'));
});
test('release crossing cutoff contains writes but preserves new database',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();let time=now();const release=driver.release;driver.release=async ctx=>{const receipt=await release(ctx);time=Date.parse(approval.window.rollbackCutoff);return receipt;};
 const result=await executeR5Deployment({approval,candidate,driver,now:()=>time,execute:true});assert.equal(result.containmentVerified,true);assert.equal(result.automaticDatabaseRestore,false);assert.equal(calls.at(-1),'contain');assert.ok(!calls.includes('rollback'));
});
test('containment failure remains explicitly unverified',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver}=fakeDriver('release');driver.contain=async()=>{throw new Error('private detail');};
 const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.containmentVerified,false);assert.ok(!JSON.stringify(result).includes('private detail'));
});
test('unverified rollback never claims recovered runtime',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver}=fakeDriver('migrate');driver.rollback=async()=>({originalRuntimeRestored:true});
 const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'HOLD_RECOVERY_UNVERIFIED');
});
test('unknown Docker command completion cannot race database recovery',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver();driver.migrate=async()=>{throw Object.assign(new Error('private command'),{code:'R5_COMMAND_OUTCOME_UNKNOWN'});};
 const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'HOLD_COMMAND_OUTCOME_UNKNOWN');assert.equal(result.automaticDatabaseRestore,false);assert.ok(!calls.includes('rollback'));assert.ok(calls.includes('contain'));
});
test('public verification failure contains traffic and preserves candidate database',async()=>{
 const {executeR5Deployment}=await import('../../src/operations/r5-deployment-executor.mjs');const {driver,calls}=fakeDriver('postReleaseVerify');
 const result=await executeR5Deployment({approval,candidate,driver,now,execute:true});assert.equal(result.status,'HOLD_RELEASE_UNCERTAIN_RECONCILIATION_REQUIRED');assert.equal(result.failedStage,'postReleaseVerify');assert.equal(result.containmentVerified,true);assert.equal(calls.at(-1),'contain');assert.ok(!calls.includes('rollback'));
});
