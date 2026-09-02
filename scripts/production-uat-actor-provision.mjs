import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { validateRoleCredential } from '../src/operations/production-role-core-smoke.mjs';
import { PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION, PRODUCTION_UAT_ACTOR_ROLES, classifyProductionUatActorProvisionResult, evaluateProductionUatActorProvisionGate, validateProductionUatActorApproval } from '../src/operations/production-uat-actor-provision.mjs';
import { cleanupProductionUatActorWorker, parseProductionUatActorWorkerResult, runProductionUatActorProcess } from '../src/operations/production-uat-actor-provision-runtime.mjs';
import { inspectProductionUatJsonReference, readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';

const projectDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const APPROVAL_ENV='PRODUCTION_UAT_ACTOR_APPROVAL_FILE';
const REFERENCE_ENV=Object.freeze({ADMIN:'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',MANAGER:'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',USER:'PRODUCTION_UAT_USER_CREDENTIAL_FILE'});
const WORKER_LOCAL=path.join(projectDir,'scripts','production-uat-actor-provision-worker.cjs');const WORKER_CONTAINER='/tmp/sqcm-i-production-uat-actor-provision-worker.cjs';
const exactFile=(value)=>inspectProductionUatJsonReference(value,{repositoryRoot:projectDir}).present;
const run=(args,options={})=>runProductionUatActorProcess(args,options);
const container=()=>{const r=run(['ps','--filter','label=com.docker.compose.project=seowon-inventory-production','--filter','label=com.docker.compose.service=backend','--format','{{.ID}}']);const ids=r.stdout.trim().split(/\r?\n/).filter(Boolean);if(r.status!==0||ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))throw new Error('UAT_ACTOR_BACKEND_CONTAINER_INVALID');return ids[0];};

const execute=process.argv.includes('--execute');const now=new Date();const credentialReferences=Object.fromEntries(PRODUCTION_UAT_ACTOR_ROLES.map((role)=>[role,exactFile(process.env[REFERENCE_ENV[role]])]));
const gate=evaluateProductionUatActorProvisionGate({environment:'production',organizationCode:'SEOWON',preserveExistingUsers:true,failOnIdentityConflict:true,approvalReferencePresent:exactFile(process.env[APPROVAL_ENV]),credentialReferences,execute,insideWindow:now>=new Date(PRODUCTION_CHANGE_WINDOW.start)&&now<=new Date(PRODUCTION_CHANGE_WINDOW.end),confirmed:process.env.PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION===PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION});
if(gate.status!=='READY_UAT_ACTOR_PROVISION_EXECUTION'){
  const output={checkedAt:now.toISOString(),requiredEnvironment:[APPROVAL_ENV,...Object.values(REFERENCE_ENV),'PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION'],secretValuesReadOrRecorded:false,...gate};(gate.status.startsWith('FAIL_')?console.error:console.log)(JSON.stringify(output,null,2));if(gate.status.startsWith('FAIL_'))process.exitCode=1;
}else{
  let backend=null;let workerCopied=false;let workerExecutionStarted=false;let workerCleanupSucceeded=null;let finalOutput=null;let failure=null;
  try{
    const approval=readProductionUatJsonDocument(process.env[APPROVAL_ENV],{repositoryRoot:projectDir}).value;if(!validateProductionUatActorApproval(approval))throw new Error('UAT_ACTOR_APPROVAL_CONTRACT_INVALID');
    const credentials=Object.fromEntries(PRODUCTION_UAT_ACTOR_ROLES.map((role)=>[role,readProductionUatJsonDocument(process.env[REFERENCE_ENV[role]],{repositoryRoot:projectDir}).value]));
    for(const role of PRODUCTION_UAT_ACTOR_ROLES)if(!validateRoleCredential(credentials[role]))throw new Error('UAT_ACTOR_CREDENTIAL_REFERENCE_INVALID');
    const approvedByRole=Object.fromEntries(approval.actors.map((actor)=>[String(actor.role).toUpperCase(),String(actor.email).toLowerCase()]));
    for(const role of PRODUCTION_UAT_ACTOR_ROLES)if(String(credentials[role].email).toLowerCase()!==approvedByRole[role])throw new Error('UAT_ACTOR_CREDENTIAL_EMAIL_NOT_APPROVED');
    backend=container();const exists=run(['exec',backend,'test','-e',WORKER_CONTAINER]);if(exists.status===0)throw new Error('UAT_ACTOR_TEMP_WORKER_ALREADY_EXISTS');if(exists.status!==1)throw new Error('UAT_ACTOR_TEMP_WORKER_OBSERVATION_FAILED');
    const copied=run(['cp',WORKER_LOCAL,`${backend}:${WORKER_CONTAINER}`]);if(copied.status!==0)throw new Error('UAT_ACTOR_TEMP_WORKER_COPY_FAILED');workerCopied=true;
    const payload={environment:'production',organizationCode:'SEOWON',approvalId:approval.approvalId,actors:PRODUCTION_UAT_ACTOR_ROLES.map((role)=>({role,...credentials[role]}))};
    workerExecutionStarted=true;const result=run(['exec','-i',backend,'node',WORKER_CONTAINER],{input:JSON.stringify(payload),timeoutMs:60_000});
    if(result.status!==0)throw new Error('UAT_ACTOR_TRANSACTION_FAILED');
    const workerResult=parseProductionUatActorWorkerResult(result.stdout);const classification=classifyProductionUatActorProvisionResult(workerResult);
    finalOutput={checkedAt:new Date().toISOString(),roles:workerResult.roles,createdCount:workerResult.createdCount,updatedCount:workerResult.updatedCount,activeCount:workerResult.activeCount,mfaEnabledCount:workerResult.mfaEnabledCount,scopeCount:workerResult.scopeCount,auditCount:workerResult.auditCount,sessionCountAfter:workerResult.sessionCountAfter,externalMutationPerformed:true,secretValuesReadOrRecorded:false,...classification};if(classification.failures.length)process.exitCode=1;
  }catch(error){failure=/^(UAT_ACTOR_[A-Z0-9_]+)$/.test(error?.message||'')?error.message:'UAT_ACTOR_PROVISION_EXECUTION_FAILED';
  }finally{
    if(workerCopied&&backend){const cleanup=await cleanupProductionUatActorWorker({removeWorker:async()=>{const removed=run(['exec',backend,'rm','-f',WORKER_CONTAINER]);if(removed.status!==0)throw new Error('UAT_ACTOR_TEMP_WORKER_REMOVE_FAILED');}});workerCleanupSucceeded=cleanup.succeeded;if(!cleanup.succeeded)failure='UAT_ACTOR_TEMP_WORKER_CLEANUP_FAILED';}
  }
  if(failure){console.error(JSON.stringify({checkedAt:new Date().toISOString(),status:'FAIL_UAT_ACTOR_PROVISION_EXECUTION',failure,externalMutationPerformed:workerCopied||workerExecutionStarted,temporaryWorkerCleanupSucceeded:workerCleanupSucceeded,actualProductionActors:'FAIL',secretValuesReadOrRecorded:false,productionGo:false},null,2));process.exitCode=1;
  }else{console.log(JSON.stringify({...finalOutput,temporaryWorkerCleanupSucceeded:workerCleanupSucceeded},null,2));}
}
