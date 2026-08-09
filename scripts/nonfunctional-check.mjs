import process from 'node:process';
import policy from '../src/operations/nonfunctional-policy.js';

const baseUrl=String(process.env.NONFUNCTIONAL_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
const allowRemote=process.env.ALLOW_REMOTE_NONFUNCTIONAL_TEST==='true';
if(!policy.isAllowedTarget(baseUrl,allowRemote)){console.error('Nonfunctional tests are restricted to localhost, .test, or .internal targets.');process.exit(1);}
const total=Math.min(1000,Math.max(1,Number(process.env.LOAD_REQUESTS||60)));
const concurrency=Math.min(50,Math.max(1,Number(process.env.LOAD_CONCURRENCY||6)));
const samples=[];let cursor=0;
async function worker(){while(cursor<total){cursor++;const started=performance.now();try{const response=await fetch(`${baseUrl}/api/health`,{signal:AbortSignal.timeout(10000)});samples.push({ok:response.status===200,durationMs:Number((performance.now()-started).toFixed(1)),status:response.status});}catch{samples.push({ok:false,durationMs:Number((performance.now()-started).toFixed(1)),status:0});}}}
await Promise.all(Array.from({length:concurrency},worker));
const load=policy.evaluateLoad(samples,{maxP95Ms:Number(process.env.MAX_P95_MS||1000),maxErrorRate:Number(process.env.MAX_ERROR_RATE||0)});
const root=await fetch(`${baseUrl}/`);const headers={csp:root.headers.get('content-security-policy'),frame:root.headers.get('x-frame-options'),nosniff:root.headers.get('x-content-type-options'),permissions:root.headers.get('permissions-policy')};
const anonymous=await fetch(`${baseUrl}/api/items`);
const crossSite=await fetch(`${baseUrl}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json','origin':'https://attacker.invalid','sec-fetch-site':'cross-site'},body:'{}'});
const crossSiteBody=await crossSite.json().catch(()=>({}));
const security={ok:Boolean(headers.csp&&headers.frame==='DENY'&&headers.nosniff==='nosniff'&&headers.permissions)&&anonymous.status===401&&crossSite.status===403&&crossSiteBody.code==='CROSS_SITE_REQUEST',headers,anonymousStatus:anonymous.status,crossSiteStatus:crossSite.status,crossSiteCode:crossSiteBody.code||null};
console.log(JSON.stringify({checkedAt:new Date().toISOString(),target:baseUrl,load,security},null,2));
if(!load.ok||!security.ok){console.error('Nonfunctional quality gate failed.');process.exit(1);}console.log('Nonfunctional quality gate passed.');
