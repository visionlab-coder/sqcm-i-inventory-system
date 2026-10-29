// Bounded fixture support for the explicitly approved 2026-10-29 browser test.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readProductionUatJsonDocument} from '../src/operations/production-uat-input-reader.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),target='https://inventory.safe-link.co.kr';
const tag='UAT-20261029-METADATA-01',code='UAT-METADATA-20261029';
const fixturePath='D:/seowon_runtime/sqcm-i-inventory-production/evidence/asset-edit-browser-fixture-20261029.json';
const mode=process.argv[2],require=createRequire(import.meta.url),{totp}=require('../src/services/mfa-service');
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const check=(v,code)=>{if(!v)throw new Error(code);};
function db(sql){const r=spawnSync('docker',['exec','-i','seowon-inventory-production-database-1','psql','-U','seowon','-d','seowon_inventory','-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',windowsHide:true});check(r.status===0,'READ_ONLY_DB_FAILED');return JSON.parse(r.stdout.trim());}
function snapshot(){const names=['assets','asset_assignments','items','loans','workflow_requests','purchase_orders','receipts','inspections','asset_files','stocktakes','item_categories','item_models','locations','departments','organizations','asset_status_definitions','asset_reason_definitions'];const state={};for(const name of names){const where=name==='assets'?`WHERE asset_tag<>${quote(tag)}`:['item_categories','locations'].includes(name)?`WHERE code<>${quote(code)}`:'';state[name]=db(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),''))) FROM ${name} t ${where};`);}for(const [key,from] of Object.entries({employees:"users u WHERE lower(u.email) LIKE '%@seowonenc.co.kr'",employeeRoles:"user_role_scopes u WHERE user_id IN (SELECT id FROM users WHERE lower(email) LIKE '%@seowonenc.co.kr')"})){state[key]=db(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(u)::text,'|' ORDER BY u.id),''))) FROM ${from};`);}return state;}
async function session(role){const c=readProductionUatJsonDocument(`D:/seowon_runtime/sqcm-i-inventory-production/secrets/production-uat-${role.toLowerCase()}-credential.json`,{repositoryRoot:root}).value;check(typeof c.email==='string'&&!/@seowonenc\.co\.kr$/i.test(c.email),'EMPLOYEE_CREDENTIAL_REFUSED');const cookies=new Map();let token='';const call=async(route,body,method=body?'POST':'GET')=>{const headers={accept:'application/json',origin:target,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')};if(body)Object.assign(headers,{'content-type':'application/json','x-csrf-token':token,'idempotency-key':randomUUID()});const r=await fetch(target+route,{method,headers,redirect:'error',signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify({...body,_csrf:token})}:{})});for(const raw of r.headers.getSetCookie()){const pair=raw.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}const data=await r.json().catch(()=>({}));if(data.csrfToken)token=data.csrfToken;return{status:r.status,data};};check((await call('/api/auth/csrf')).status===200,'CSRF_FAILED');const login=await call('/api/auth/login',{email:c.email,password:c.password});check([200,202].includes(login.status),'LOGIN_FAILED');if(login.data.mfaRequired)check((await call('/api/auth/mfa/verify',{code:totp(c.totpSecret)})).status===200,'MFA_FAILED');const me=await call('/api/auth/me');check(me.status===200&&me.data.user?.role===role&&!me.data.user?.passwordResetRequired,'TEST_ACTOR_NOT_READY');return{call,user:me.data.user,reauth:()=>call('/api/auth/reauth',{password:c.password})};}
let active;const report={mode,target,tag,credentialsRecorded:false};
try{
 check(['--prepare','--verify','--cleanup'].includes(mode),'UNSUPPORTED_MODE');
 if(mode==='--prepare'){
  check(!fs.existsSync(fixturePath),'FIXTURE_EXISTS_NO_OVERWRITE');check(db(`SELECT json_build_object('count',count(*)) FROM assets WHERE asset_tag=${quote(tag)};`).count===0,'TAG_ALREADY_EXISTS');
  for(const table of ['item_categories','locations'])check(db(`SELECT json_build_object('count',count(*)) FROM ${table} WHERE code=${quote(code)};`).count===0,'REFERENCE_ALREADY_EXISTS');
  const before=snapshot();active=await session('ADMIN');check((await active.reauth()).status===204,'REAUTH_FAILED');
  const organizationId=active.user.organizationId;const state={tag,code,organizationId,actorId:active.user.id,categoryId:null,locationId:null,before};fs.writeFileSync(fixturePath,JSON.stringify(state,null,2),{flag:'wx'});
  const category=await active.call('/api/enterprise/admin/references/categories',{organizationId,code,name:'[시험전용] 기본정보 수정 분류'});check(category.status===201,'CATEGORY_PREPARE_FAILED');
  state.categoryId=category.data.reference.id;fs.writeFileSync(fixturePath,JSON.stringify(state,null,2));
  const location=await active.call('/api/enterprise/admin/references/locations',{organizationId,code,name:'[시험전용] 기본정보 수정 위치',locationType:'ROOM'});check(location.status===201,'LOCATION_PREPARE_FAILED');
  state.locationId=location.data.reference.id;fs.writeFileSync(fixturePath,JSON.stringify(state,null,2));report.prepared={categoryId:state.categoryId,locationId:state.locationId};
 }else{
  const state=JSON.parse(fs.readFileSync(fixturePath,'utf8'));check(state.tag===tag&&state.code===code,'FIXTURE_MISMATCH');
  const asset=db(`SELECT coalesce((SELECT json_build_object('id',id,'name',name,'serialNo',serial_no,'categoryId',category_id,'locationId',location_id,'acquiredAt',to_char(acquired_at,'YYYY-MM-DD'),'status',status_code,'createdBy',created_by,'organizationId',organization_id,'editVersion',xmin::text) FROM assets WHERE asset_tag=${quote(tag)}),'null'::json);`);check((asset&&String(asset.createdBy)===String(state.actorId)&&String(asset.organizationId)===String(state.organizationId))||(!asset&&mode==='--cleanup'),'OWNED_SYNTHETIC_ASSET_MISSING');report.asset=asset;
  if(mode==='--verify'){
   check(asset.name==='[시험용] 기본정보 수정 완료'&&String(asset.categoryId)===String(state.categoryId)&&String(asset.locationId)===String(state.locationId)&&asset.acquiredAt==='2026-10-28','BROWSER_CHANGES_NOT_PERSISTED');
   report.history=db(`SELECT json_build_object('count',count(*),'fields',json_agg(metadata->'changes')) FROM audit_logs WHERE entity_type='ASSET' AND entity_id=${quote(asset.id)} AND action='ASSET_METADATA_UPDATED';`);check(report.history.count>=1,'EDIT_HISTORY_MISSING');
   active=await session('USER');const denied=await active.call(`/api/enterprise/assets/${asset.id}`,{name:'[시험] 권한 없는 수정',expectedVersion:asset.editVersion,reason:'시험 USER 권한 거부'},'PATCH');report.userPatchStatus=denied.status;check(denied.status===403,'USER_PERMISSION_FAILED');
  }else{
   active=await session('ADMIN');check(String(active.user.id)===String(state.actorId),'ACTOR_MISMATCH');
   if(asset&&asset.status!=='CANCELLED'){const ref=await active.call('/api/enterprise/reference');const reason=ref.data.reasons?.find(r=>!r.applies_to_status||r.applies_to_status==='CANCELLED');check(reason,'CANCEL_REASON_MISSING');check((await active.call(`/api/enterprise/assets/${asset.id}/status`,{toStatus:'CANCELLED',reasonCode:reason.code,reasonDetail:'브라우저 시험 완료·실물 없음·실업무 배정 금지'})).status===200,'CANCEL_FAILED');}
   check((await active.reauth()).status===204,'REAUTH_FAILED');for(const [kind,id,name,table] of [['categories',state.categoryId,'[시험전용] 기본정보 수정 분류','item_categories'],['locations',state.locationId,'[시험전용] 기본정보 수정 위치','locations']]){if(!id)continue;check(db(`SELECT json_build_object('count',count(*)) FROM ${table} WHERE id=${Number(id)} AND code=${quote(code)} AND organization_id=${Number(state.organizationId)};`).count===1,'REFERENCE_OWNERSHIP_MISMATCH');check((await active.call(`/api/enterprise/admin/references/${kind}/${id}`,{organizationId:state.organizationId,name,isActive:false},'PATCH')).status===200,'REFERENCE_CLEANUP_FAILED');}report.cancelled=!!asset;report.testReferencesDeactivated=true;
  }
  report.after=snapshot();report.preserved=JSON.stringify(state.before)===JSON.stringify(report.after);check(report.preserved,'EXISTING_DATA_CHANGED');
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.errorCode=/^[A-Z_]+$/.test(error.message)?error.message:'BOUNDED_UAT_FAILURE';process.exitCode=1;}
finally{if(active){try{report.logoutStatus=(await active.call('/api/auth/logout',{})).status;}catch{report.logoutStatus='NOT_CONFIRMED';}}console.log(JSON.stringify(report));}
