import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateR5ProductionDriverPreflight, R5_RUNTIME_PRESERVE_PATHS } from '../../src/operations/r5-production-driver-preflight.mjs';

const sha = 'a'.repeat(40);
const approval = { candidateSha:sha, target:'production', publicUrl:'https://inventory.safe-link.co.kr/', window:{ start:'2026-09-07T05:00:00Z', rollbackCutoff:'2026-09-07T07:00:00Z', end:'2026-09-07T08:00:00Z' } };
const candidate = { sha, target:approval.target, publicUrl:approval.publicUrl, backendImage:`sha256:${'b'.repeat(64)}`, frontendImage:`sha256:${'c'.repeat(64)}` };
function valid() {
  return {
    approval, candidate, now:Date.parse('2026-09-07T06:00:00Z'),
    runtime:{ composeProject:'seowon-inventory-production', activeClientWrites:0,
      candidateBackendImageId:candidate.backendImage, candidateFrontendImageId:candidate.frontendImage,
      candidateBackendRevision:sha, candidateFrontendRevision:sha,
      services:[
        {name:'database',running:true,healthy:true,publishedPorts:[]},
        {name:'backend',running:true,healthy:true,publishedPorts:[]},
        {name:'frontend',running:true,healthy:true,publishedPorts:['127.0.0.1:3300']}
      ] },
    backup:{ physicalDirectory:true,reparsePoint:false,inheritanceDisabled:true,currentUserFullControl:true,systemFullControl:true,administratorsFullControl:true,unexpectedPrincipalCount:0,runtimePreservePaths:[...R5_RUNTIME_PRESERVE_PATHS],unexpectedRuntimeChanges:[] },
    credentials:{ADMIN:true,MANAGER:true,USER:true}
  };
}

test('exact production observations pass only inside the execution interval',()=>{
  const result=evaluateR5ProductionDriverPreflight(valid());assert.equal(result.status,'PASS_R5_PRODUCTION_DRIVER_PREFLIGHT');assert.equal(result.safeToMutate,true);
});
test('passed cutoff is a non-mutating wait while technical readiness remains visible',()=>{
  const input=valid();input.now=Date.parse(approval.window.rollbackCutoff);const result=evaluateR5ProductionDriverPreflight(input);assert.equal(result.status,'READY_WAIT_R5_CHANGE_WINDOW');assert.equal(result.technicalReady,true);assert.equal(result.safeToMutate,false);
});
test('extra services, exposed database port or wrong image fail closed',()=>{
  const input=valid();input.runtime.services.push({name:'worker',running:true,healthy:true,publishedPorts:[]});input.runtime.services[0].publishedPorts=['0.0.0.0:5432'];input.runtime.candidateBackendImageId=`sha256:${'d'.repeat(64)}`;
  const result=evaluateR5ProductionDriverPreflight(input);assert.equal(result.status,'BLOCKED_R5_PRODUCTION_DRIVER_PREFLIGHT');assert.equal(result.safeToMutate,false);assert.ok(result.failures.length>=3);
});
test('backup ACL and every known runtime overlay are mandatory',()=>{
  const input=valid();input.backup.inheritanceDisabled=false;input.backup.runtimePreservePaths.pop();input.backup.unexpectedRuntimeChanges=['backend:/unexpected'];
  const result=evaluateR5ProductionDriverPreflight(input);assert.equal(result.status,'BLOCKED_R5_PRODUCTION_DRIVER_PREFLIGHT');assert.match(result.failures.join(','),/BACKUP_ACL|PRESERVE_PATH|UNEXPECTED_RUNTIME/);
});
test('credential absence is input wait and never mutation authority',()=>{
  const input=valid();input.credentials.USER=false;const result=evaluateR5ProductionDriverPreflight(input);assert.equal(result.status,'READY_WAIT_R5_CHANGE_WINDOW');assert.equal(result.technicalReady,false);assert.equal(result.safeToMutate,false);
});
