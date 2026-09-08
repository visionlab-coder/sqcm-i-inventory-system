import assert from 'node:assert/strict';
import test from 'node:test';
import {createR5MutationDriver} from '../../src/operations/r5-mutation-driver.mjs';

const sha='a'.repeat(40), digest=`sha256:${'b'.repeat(64)}`;
const context={runId:'12345678-1234-1234-1234-123456789012',candidate:{sha}};
function actions(){return {
 freeze:async()=>({ingressBlocked:true,workersStopped:true,activeWritesZero:true}),
 backup:async()=>({restoreVerified:true,runtimeFilesPreserved:true,backupDigest:digest,backupReference:'private'}),
 migrate:async()=>({historyVerified:true,seedsDisabled:true}),
 switchImages:async()=>({imageIdsMatched:true,threeServices:true,privateDatabasePorts:true}),
 verify:async()=>({health:true,authenticatedSmoke:true,database:true,tls:true}),
 release:async()=>({writesEnabled:true}),postReleaseVerify:async()=>({publicHttps:true,authenticatedSmoke:true,database:true}),
 contain:async()=>({ingressBlocked:true,workersStopped:true,activeWritesZero:true,candidateDataPreserved:true}),
 rollback:async()=>({ingressBlocked:true,originalRuntimeRestored:true,candidateDataPreserved:true,backupDigest:digest})
};}
test('driver binds every observation to the exact run and candidate',async()=>{const driver=createR5MutationDriver({candidateSha:sha,actions:actions()});const receipt=await driver.backup(context);assert.equal(receipt.runId,context.runId);assert.equal(receipt.candidateSha,sha);assert.equal(receipt.backupDigest,digest);});
test('driver rejects a false success observation',async()=>{const value=actions();value.freeze=async()=>({ingressBlocked:true,workersStopped:false,activeWritesZero:true});const driver=createR5MutationDriver({candidateSha:sha,actions:value});await assert.rejects(driver.freeze(context),/OBSERVATION_INVALID/);});
test('migration rollback requires candidate DB preservation and the same backup digest',async()=>{const value=actions();value.rollback=async()=>({ingressBlocked:true,originalRuntimeRestored:true,candidateDataPreserved:true,backupDigest:`sha256:${'c'.repeat(64)}`});const driver=createR5MutationDriver({candidateSha:sha,actions:value});await assert.rejects(driver.rollback(context,{migrationAttempted:true,backup:{backupDigest:digest}}),/DATA_PRESERVATION_INVALID/);});
