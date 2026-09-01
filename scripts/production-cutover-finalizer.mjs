import{existsSync,readFileSync,statSync}from'node:fs';import{validateActualCutoverProvenance}from'../src/operations/production-cutover-finalizer.mjs';
const env='PRODUCTION_CUTOVER_ACTUAL_EVIDENCE_FILE',file=process.env[env];let present=false;try{present=Boolean(file&&existsSync(file)&&statSync(file).isFile());}catch{}
if(!present){console.log(JSON.stringify({checkedAt:new Date().toISOString(),status:'READY_WAIT_ACTUAL_CUTOVER_EVIDENCE',requiredEnvironment:env,actualEvidencePresent:false,productionGo:false},null,2));process.exit(0);}
const result=validateActualCutoverProvenance(JSON.parse(readFileSync(file,'utf8')));console.log(JSON.stringify({checkedAt:new Date().toISOString(),actualEvidencePresent:true,...result},null,2));if(result.failures.length)process.exitCode=1;
