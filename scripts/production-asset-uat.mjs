import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readProductionUatJsonDocument } from '../src/operations/production-uat-input-reader.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target='https://inventory.safe-link.co.kr';
const credentialRef='D:/seowon_runtime/sqcm-i-inventory-production/secrets/production-uat-admin-credential.json';
const tag='UAT-20261029-LOGIN-ASSET-01';
const name='[시험용·실물아님] 로그인 등록 수정 조회 검증';
const execute=process.argv.includes('--execute');
const outputArg=process.argv.find(value=>value.startsWith('--output='));
const output=outputArg?.slice('--output='.length);
if(output && (path.resolve(output)!==path.join(root,'agent docs','harness','PRODUCTION_ASSET_UAT_20261029_EVIDENCE.json') || fs.existsSync(output))) throw new Error('OUTPUT_MUST_BE_CREATE_ONLY_APPROVED_EVIDENCE');
const receipt={schemaVersion:1,dateKst:'2026-10-29',target,tag,mode:execute?'execute':'preflight',checks:{},browserFlow:'NOT_RUN_API_DB_VALIDATION_ONLY',metadataEdit:'NOT_IMPLEMENTED_NO_UI_OR_ROUTE',mutationScope:'one synthetic asset only',credentialsRecorded:false};
const require=createRequire(import.meta.url);
const {totp}=require('../src/services/mfa-service.js');
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
function db(sql){const r=spawnSync('docker',['exec','-i','seowon-inventory-production-database-1','psql','-U','seowon','-d','seowon_inventory','-X','-qAt','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});if(r.status!==0)throw new Error('READ_ONLY_DB_CHECK_FAILED');return JSON.parse(r.stdout.trim());}
const assert=(condition,code)=>{if(!condition)throw new Error(code);};
const tables=['assets','asset_assignments','items','loans','workflow_requests','purchase_orders','receipts','inspections','asset_files','stocktakes','stocktake_lines','repair_orders','item_categories','item_models','locations','departments','organizations','asset_status_definitions','asset_reason_definitions'];
function snapshot(){const available=db(`SELECT coalesce(json_agg(tablename),'[]'::json) FROM pg_tables WHERE schemaname='public';`);const states={};for(const table of tables.filter(t=>available.includes(t))){const filter=table==='assets'?` WHERE asset_tag<>${quote(tag)}`:'';states[table]=db(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),''))) FROM ${table} t${filter};`);}states.employeeAccounts=db(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(u)::text,'|' ORDER BY id),''))) FROM users u WHERE lower(email) LIKE '%@seowonenc.co.kr';`);states.employeeRoles=db(`SELECT json_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(s)::text,'|' ORDER BY s.id),''))) FROM user_role_scopes s JOIN users u ON u.id=s.user_id WHERE lower(u.email) LIKE '%@seowonenc.co.kr';`);return states;}
let jar=new Map(),token='',createdId=null,cancelled=false,authenticated=false,actor,policy;
async function http(route,body){const headers={accept:'application/json',origin:target};if(jar.size)headers.cookie=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');if(body){headers['content-type']='application/json';headers['x-csrf-token']=token;headers['idempotency-key']=randomUUID();}const r=await fetch(target+route,{method:body?'POST':'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000),...(body?{body:JSON.stringify({...body,_csrf:token})}:{})});for(const value of r.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');if(i>0)jar.set(pair.slice(0,i),pair.slice(i+1));}const data=await r.json().catch(()=>({}));if(data.csrfToken)token=data.csrfToken;return {status:r.status,data};}
try{
 const credential=readProductionUatJsonDocument(credentialRef,{repositoryRoot:root}).value;
 assert(typeof credential.email==='string'&&typeof credential.password==='string','TEST_CREDENTIAL_INVALID');
 assert(!/@seowonenc\.co\.kr$/i.test(credential.email),'EMPLOYEE_ACCOUNT_MUST_NOT_BE_USED');
 actor=db(`SELECT coalesce((SELECT json_build_object('id',id,'role',role,'status',status,'organizationId',organization_id,'passwordResetRequired',password_reset_required) FROM users WHERE lower(email)=lower(${quote(credential.email)})),'null'::json);`);
 assert(actor?.role==='ADMIN'&&actor.status==='ACTIVE'&&!actor.passwordResetRequired&&actor.organizationId,'TEST_ACTOR_NOT_READY');
 policy=db(`SELECT coalesce((SELECT json_build_object('reasonCode',r.code) FROM asset_reason_definitions r JOIN asset_status_definitions s ON s.organization_id=r.organization_id AND s.code='CANCELLED' AND s.is_active WHERE r.organization_id=${Number(actor.organizationId)} AND r.is_active AND (r.applies_to_status IS NULL OR r.applies_to_status='CANCELLED') ORDER BY r.id LIMIT 1),'null'::json);`);
 assert(policy?.reasonCode,'APPROVED_CANCEL_POLICY_MISSING');
 const existing=db(`SELECT json_build_object('count',count(*)) FROM assets WHERE asset_tag=${quote(tag)};`);
 assert(existing.count===0,'TEST_TAG_ALREADY_EXISTS_NO_DUPLICATE_CREATE');
 receipt.preflight={testActorReady:true,employeeAccountUsed:false,cancelPolicyReady:true,existingTestTagCount:0};
 if(execute){
  receipt.before=snapshot();
  const anon=await fetch(target+'/api/enterprise/assets',{redirect:'error',signal:AbortSignal.timeout(20000)});receipt.checks.anonymousRead=anon.status;assert(anon.status===401,'ANONYMOUS_READ_NOT_DENIED');
  assert((await http('/api/auth/csrf')).status===200,'CSRF_FAILED');
  const login=await http('/api/auth/login',{email:credential.email,password:credential.password});receipt.checks.passwordLogin=login.status;
  assert(login.status===200||login.status===202,'TEST_LOGIN_FAILED_NO_PASSWORD_RESET');
  if(login.data.mfaRequired){assert(typeof credential.totpSecret==='string','EXISTING_MFA_REFERENCE_MISSING');const mfa=await http('/api/auth/mfa/verify',{code:totp(credential.totpSecret)});receipt.checks.mfa=mfa.status;assert(mfa.status===200,'TEST_MFA_FAILED_NO_ACCOUNT_CHANGE');}
  authenticated=true;
  const me=await http('/api/auth/me');receipt.checks.authenticatedMe=me.status;assert(me.status===200&&Number(me.data.user?.id)===Number(actor.id)&&!me.data.user?.passwordResetRequired,'AUTHENTICATED_ACTOR_MISMATCH');
  const create=await http('/api/enterprise/assets',{organizationId:actor.organizationId,assetTag:tag,name,serialNo:tag+'-SYNTHETIC',statusCode:'DRAFT',acquisitionCost:0,attributes:{synthetic:true,testRun:'PRODUCTION_ASSET_UAT_20261029',physicalAsset:false}});
  receipt.checks.create=create.status;const candidate=create.data.asset;assert(create.status===201&&Number.isSafeInteger(Number(candidate?.id))&&Number(candidate.id)>0&&candidate.asset_tag===tag&&candidate.name===name&&Number(candidate.created_by)===Number(actor.id)&&Number(candidate.organization_id)===Number(actor.organizationId)&&candidate.attributes?.synthetic===true,'SYNTHETIC_CREATE_FAILED');createdId=candidate.id;receipt.assetId=createdId;
  const initial=await http(`/api/enterprise/assets/${createdId}`);receipt.checks.initialDetail=initial.status;assert(initial.status===200&&initial.data.asset?.name===name&&initial.data.asset?.status_code==='DRAFT','INITIAL_READ_MISMATCH');
  const update=await http(`/api/enterprise/assets/${createdId}/status`,{toStatus:'CANCELLED',reasonCode:policy.reasonCode,reasonDetail:'승인된 시험 자산 검증 완료·실물 없음·실업무 배정 금지'});receipt.checks.statusModification=update.status;assert(update.status===200&&update.data.asset?.status_code==='CANCELLED','TEST_STATUS_CHANGE_FAILED');cancelled=true;
  const query=await http('/api/enterprise/assets?q='+encodeURIComponent(tag));receipt.checks.search=query.status;assert(query.status===200&&query.data.assets?.length===1&&String(query.data.assets[0].id)===String(createdId)&&query.data.assets[0].status_code==='CANCELLED','SEARCH_PERSISTENCE_MISMATCH');
  const detail=await http(`/api/enterprise/assets/${createdId}`);receipt.checks.updatedDetail=detail.status;assert(detail.status===200&&detail.data.asset?.status_code==='CANCELLED'&&detail.data.history?.length===2,'UPDATED_DETAIL_HISTORY_MISMATCH');
  receipt.persisted=db(`SELECT json_build_object('assetCount',count(*),'cancelled',bool_and(status_code='CANCELLED'),'deactivated',bool_and(deactivated_at IS NOT NULL),'zeroCost',bool_and(acquisition_cost=0),'historyCount',(SELECT count(*) FROM asset_status_histories WHERE asset_id=${Number(createdId)}),'auditCount',(SELECT count(*) FROM audit_logs WHERE entity_type='ASSET' AND entity_id=${quote(createdId)} AND action IN ('ASSET_CREATED','ASSET_STATUS_CHANGED')),'assignments',(SELECT count(*) FROM asset_assignments WHERE asset_id=${Number(createdId)})) FROM assets WHERE id=${Number(createdId)} AND asset_tag=${quote(tag)};`);
  assert(receipt.persisted.assetCount===1&&receipt.persisted.cancelled&&receipt.persisted.deactivated&&receipt.persisted.zeroCost&&receipt.persisted.historyCount===2&&receipt.persisted.auditCount===2&&receipt.persisted.assignments===0,'DB_HISTORY_AUDIT_MISMATCH');
  receipt.status='PASS_LOGIN_CREATE_STATUS_EDIT_READ_METADATA_EDIT_UNIMPLEMENTED';
 }else receipt.status='PASS_READ_ONLY_PREFLIGHT';
}catch(error){receipt.status='FAIL_OR_BLOCKED';receipt.errorCode=/^[A-Z_]+$/.test(error.message)?error.message:'BOUNDED_TEST_EXECUTION_ERROR';process.exitCode=1;}
finally{
 if(createdId&&!cancelled){try{const r=await http(`/api/enterprise/assets/${createdId}/status`,{toStatus:'CANCELLED',reasonCode:policy.reasonCode,reasonDetail:'시험 중단 후 시험 자산만 취소'});cancelled=r.status===200;}catch{}receipt.partialTestAssetCancelled=cancelled;}
 if(authenticated){try{receipt.checks.logout=(await http('/api/auth/logout',{})).status;receipt.checks.oldSessionAfterLogout=(await http('/api/auth/me')).status;assert(receipt.checks.logout===204&&receipt.checks.oldSessionAfterLogout===401,'LOGOUT_SESSION_REVOCATION_FAILED');}catch{receipt.status='FAIL_LOGOUT_SESSION_CHECK';process.exitCode=1;}}
 if(receipt.before){try{receipt.after=snapshot();receipt.preserved=Object.keys(receipt.before).every(key=>JSON.stringify(receipt.before[key])===JSON.stringify(receipt.after[key]));if(!receipt.preserved){receipt.status='FAIL_PRESERVATION_CHECK';process.exitCode=1;}}catch{receipt.status='FAIL_PRESERVATION_CHECK';process.exitCode=1;}}
 receipt.finishedAtUtc=new Date().toISOString();
 if(output)fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(receipt));
}
