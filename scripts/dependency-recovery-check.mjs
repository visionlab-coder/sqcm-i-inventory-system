import process from 'node:process';
import { spawnSync } from 'node:child_process';

if(process.env.ALLOW_DATABASE_PAUSE!=='true'){console.error('ALLOW_DATABASE_PAUSE=true is required.');process.exit(1);}
const baseUrl=String(process.env.RECOVERY_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
if(!['localhost','127.0.0.1','::1'].includes(new URL(baseUrl).hostname)){console.error('Dependency recovery test is restricted to localhost.');process.exit(1);}
const composeFiles=String(process.env.RECOVERY_COMPOSE_FILES||'compose.yaml').split(',').map(value=>value.trim()).filter(Boolean);
const composeArgs=composeFiles.flatMap(file=>['-f',file]);
function docker(action){const result=spawnSync('docker',['compose',...composeArgs,action,'database'],{stdio:'inherit'});if(result.status!==0)throw new Error(`docker compose ${action} failed`);}
async function waitFor(expected,timeoutMs){const started=Date.now();while(Date.now()-started<timeoutMs){try{const response=await fetch(`${baseUrl}/api/health`,{signal:AbortSignal.timeout(8000)});if(response.status===expected)return Date.now()-started;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`health did not reach ${expected} within ${timeoutMs}ms`);}
let paused=false;let failureDetectionMs;let recoveryMs;
try{docker('pause');paused=true;failureDetectionMs=await waitFor(503,20000);}finally{if(paused)docker('unpause');}
recoveryMs=await waitFor(200,30000);
console.log(JSON.stringify({checkedAt:new Date().toISOString(),failureDetectionMs,recoveryMs,limits:{failureDetectionMs:20000,recoveryMs:30000}},null,2));
console.log('Dependency failure and recovery gate passed.');
