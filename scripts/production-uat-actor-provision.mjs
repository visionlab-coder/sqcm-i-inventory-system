import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_CHANGE_WINDOW } from '../src/operations/production-cutover-preflight.mjs';
import { validateRoleCredential } from '../src/operations/production-role-core-smoke.mjs';
import { PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION, PRODUCTION_UAT_ACTOR_ROLES, classifyProductionUatActorProvisionResult, evaluateProductionUatActorProvisionGate, validateProductionUatActorApproval } from '../src/operations/production-uat-actor-provision.mjs';

const projectDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const APPROVAL_ENV='PRODUCTION_UAT_ACTOR_APPROVAL_FILE';
const REFERENCE_ENV=Object.freeze({ADMIN:'PRODUCTION_UAT_ADMIN_CREDENTIAL_FILE',MANAGER:'PRODUCTION_UAT_MANAGER_CREDENTIAL_FILE',USER:'PRODUCTION_UAT_USER_CREDENTIAL_FILE'});
const WORKER_LOCAL=path.join(projectDir,'scripts','production-uat-actor-provision-worker.cjs');const WORKER_CONTAINER='/tmp/sqcm-i-production-uat-actor-provision-worker.cjs';
const exactFile=(value)=>{if(!value||!existsSync(value))return false;try{return statSync(value).isFile();}catch{return false;}};
const container=()=>{const r=spawnSync('docker',['ps','--filter','label=com.docker.compose.project=seowon-inventory-production','--filter','label=com.docker.compose.service=backend','--format','{{.ID}}'],{encoding:'utf8',windowsHide:true});const ids=r.stdout.trim().split(/\r?\n/).filter(Boolean);if(r.status!==0||ids.length!==1)throw new Error('Exactly one Production backend container is required.');return ids[0];};
const run=(args,options={})=>spawnSync('docker',args,{encoding:'utf8',windowsHide:true,...options});

const execute=process.argv.includes('--execute');const now=new Date();const credentialReferences=Object.fromEntries(PRODUCTION_UAT_ACTOR_ROLES.map((role)=>[role,exactFile(process.env[REFERENCE_ENV[role]])]));
const gate=evaluateProductionUatActorProvisionGate({environment:'production',organizationCode:'SEOWON',preserveExistingUsers:true,failOnIdentityConflict:true,approvalReferencePresent:exactFile(process.env[APPROVAL_ENV]),credentialReferences,execute,insideWindow:now>=new Date(PRODUCTION_CHANGE_WINDOW.start)&&now<=new Date(PRODUCTION_CHANGE_WINDOW.end),confirmed:process.env.PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION===PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION});
if(gate.status!=='READY_UAT_ACTOR_PROVISION_EXECUTION'){
  const output={checkedAt:now.toISOString(),requiredEnvironment:[APPROVAL_ENV,...Object.values(REFERENCE_ENV),'PRODUCTION_UAT_ACTOR_PROVISION_CONFIRMATION'],secretValuesReadOrRecorded:false,...gate};(gate.status.startsWith('FAIL_')?console.error:console.log)(JSON.stringify(output,null,2));if(gate.status.startsWith('FAIL_'))process.exitCode=1;
}else{
  let workerCopied=false;
  try{
    const approval=JSON.parse(readFileSync(process.env[APPROVAL_ENV],'utf8'));if(!validateProductionUatActorApproval(approval))throw new Error('Production UAT actor approval contract is invalid.');
    const credentials=Object.fromEntries(PRODUCTION_UAT_ACTOR_ROLES.map((role)=>[role,JSON.parse(readFileSync(process.env[REFERENCE_ENV[role]],'utf8'))]));
    for(const role of PRODUCTION_UAT_ACTOR_ROLES)if(!validateRoleCredential(credentials[role]))throw new Error(`${role} credential reference contract is invalid.`);
    const approvedByRole=Object.fromEntries(approval.actors.map((actor)=>[String(actor.role).toUpperCase(),String(actor.email).toLowerCase()]));
    for(const role of PRODUCTION_UAT_ACTOR_ROLES)if(String(credentials[role].email).toLowerCase()!==approvedByRole[role])throw new Error(`${role} credential email is not approved.`);
    const backend=container();const exists=run(['exec',backend,'test','-e',WORKER_CONTAINER]);if(exists.status===0)throw new Error('Production UAT worker temporary path already exists.');
    const copied=run(['cp',WORKER_LOCAL,`${backend}:${WORKER_CONTAINER}`]);if(copied.status!==0)throw new Error('Unable to copy exact Production UAT worker.');workerCopied=true;
    const payload={environment:'production',organizationCode:'SEOWON',approvalId:approval.approvalId,actors:PRODUCTION_UAT_ACTOR_ROLES.map((role)=>({role,...credentials[role]}))};
    const result=run(['exec','-i',backend,'node',WORKER_CONTAINER],{input:JSON.stringify(payload),maxBuffer:1024*1024});
    if(result.status!==0)throw new Error('Production UAT actor transaction failed and was rolled back.');
    const workerResult=JSON.parse(result.stdout);const classification=classifyProductionUatActorProvisionResult(workerResult);
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),roles:workerResult.roles,createdCount:workerResult.createdCount,updatedCount:workerResult.updatedCount,activeCount:workerResult.activeCount,mfaEnabledCount:workerResult.mfaEnabledCount,scopeCount:workerResult.scopeCount,auditCount:workerResult.auditCount,sessionCountAfter:workerResult.sessionCountAfter,externalMutationPerformed:true,secretValuesReadOrRecorded:false,...classification},null,2));if(classification.failures.length)process.exitCode=1;
  }catch(error){console.error(JSON.stringify({checkedAt:new Date().toISOString(),status:'FAIL_UAT_ACTOR_PROVISION_EXECUTION',failure:String(error.message||'provision failure').replace(/[\r\n]/g,' ').slice(0,240),externalMutationPerformed:false,secretValuesReadOrRecorded:false,productionGo:false},null,2));process.exitCode=1;
  }finally{if(workerCopied){const backend=container();run(['exec',backend,'rm','-f',WORKER_CONTAINER]);}}
}
