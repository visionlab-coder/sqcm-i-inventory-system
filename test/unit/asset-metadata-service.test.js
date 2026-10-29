const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeAssetPatch,updateAssetMetadata,listAssetMetadataHistory}=require('../../src/services/asset-metadata-service');
const manager={id:7,role:'MANAGER',organizationId:1,isSystemAdmin:false,departmentId:2};
const original={id:5,organization_id:1,department_id:2,name:'기존 시험 자산',serial_no:null,category_id:1,model_id:null,location_id:2,acquired_at:'2020-01-01',edit_version:'100',status_code:'AVAILABLE',deactivated_at:null};
function fixture({asset=original,scope='ORGANIZATION',auditFailure=false,duplicate=false}={}){
 let stored=structuredClone(asset),backup;const calls=[],audits=[];
 const query=async(sql,values=[])=>{calls.push({sql,values});
  if(sql==='BEGIN'){backup=structuredClone(stored);return {};}
  if(sql==='ROLLBACK'){stored=backup;audits.length=0;return {};}
  if(sql==='COMMIT')return {};
  if(sql.includes('FROM user_role_scopes'))return {rows:[{scope_type:scope,organization_id:1,department_id:2}]};
  if(sql.startsWith('WITH RECURSIVE tree'))return {rows:[{id:2}],rowCount:1};
  if(sql.startsWith('SELECT a.*'))return {rows:stored?[stored]:[],rowCount:stored?1:0};
  if(sql.startsWith('SELECT id FROM item_categories'))return {rows:values[0]===10&&values[1]===1?[{id:10}]:[],rowCount:values[0]===10&&values[1]===1?1:0};
  if(sql.startsWith('SELECT id FROM locations'))return {rows:values[0]===20&&values[1]===1?[{id:20}]:[],rowCount:values[0]===20&&values[1]===1?1:0};
  if(sql.startsWith('SELECT m.id'))return {rows:values[0]===30?[{id:30,category_id:10}]:[],rowCount:values[0]===30?1:0};
  if(sql.startsWith('UPDATE assets')){if(duplicate)throw Object.assign(new Error('duplicate'),{code:'23505'});stored={...stored,name:values[0],serial_no:values[1],category_id:values[2],model_id:values[3],location_id:values[4],acquired_at:values[5],edit_version:'101'};return {rows:[stored]};}
  if(sql.startsWith('INSERT INTO audit_logs')){if(auditFailure)throw new Error('audit unavailable');audits.push(JSON.parse(values[2]));return {};}
  if(sql.startsWith('SELECT l.id'))return {rows:audits.map(a=>({changes:a.changes,reason:a.reason}))};
  throw new Error('Unhandled test SQL');
 };
 return {pool:{connect:async()=>({query,release(){}}),query},calls,audits,get stored(){return stored;}};
}
const patch=fields=>({...fields,expectedVersion:'100',reason:'시험 기본정보 수정'});
test('기본정보 수정은 허용 필드·실제 날짜·선택값 해제를 정규화한다',()=>{
 assert.deepEqual(normalizeAssetPatch(patch({name:'  새 자산 ',serialNo:' ',categoryId:'10',modelId:null,locationId:'20',acquiredAt:'2024-02-29'})),{fields:{name:'새 자산',serial_no:null,category_id:10,model_id:null,location_id:20,acquired_at:'2024-02-29'},expectedVersion:'100',reason:'시험 기본정보 수정'});
});
test('자산번호·상태·조직·부서·취득가·속성 변경은 명시적으로 거부한다',()=>{
 for(const key of ['assetTag','statusCode','organizationId','departmentId','acquisitionCost','attributes','unexpected'])assert.throws(()=>normalizeAssetPatch(patch({name:'이름',[key]:'x'})),e=>e.code==='VALIDATION_ERROR'&&e.fieldErrors[0].field===key);
});
test('빈 이름·과도한 일련번호·불가능한 날짜·ID·누락 사유/버전을 거부한다',()=>{
 for(const value of [patch({name:''}),patch({name:'a'}),patch({serialNo:'x'.repeat(101)}),patch({name:123}),patch({acquiredAt:'2026-02-30'}),patch({acquiredAt:'2026-1-1'}),patch({categoryId:-1}),patch({modelId:'1e3'}),{...patch({name:'ok'}),reason:''},{name:'ok',reason:'reason'},patch({})])assert.throws(()=>normalizeAssetPatch(value),e=>e.status===400);
});
test('USER와 미인증 사용자는 DB 연결 전 수정이 차단된다',async()=>{
 const f=fixture();await assert.rejects(updateAssetMetadata(f.pool,{role:'USER'},5,patch({name:'새 이름'})),e=>e.status===403);await assert.rejects(updateAssetMetadata(f.pool,null,5,patch({name:'새 이름'})),e=>e.status===401);assert.equal(f.calls.length,0);
});
test('타 조직·부서 접근은 UPDATE·감사 없이 거부한다',async()=>{
 for(const f of [fixture({asset:{...original,organization_id:9}}),fixture({asset:{...original,department_id:9},scope:'DEPARTMENT'})]){await assert.rejects(updateAssetMetadata(f.pool,manager,5,patch({name:'새 이름'})),e=>e.status===403);assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE')));assert.equal(f.audits.length,0);}
});
test('없는 자산·취소/폐기 자산·오래된 버전은 수정하지 않는다',async()=>{
 for(const [f,p,status] of [[fixture({asset:null}),patch({name:'새 이름'}),404],[fixture({asset:{...original,status_code:'CANCELLED'}}),patch({name:'새 이름'}),409],[fixture({asset:{...original,deactivated_at:'2026-01-01'}}),patch({name:'새 이름'}),409],[fixture(),{...patch({name:'새 이름'}),expectedVersion:'99'},409]]){await assert.rejects(updateAssetMetadata(f.pool,manager,5,p),e=>e.status===status);assert.equal(f.audits.length,0);assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE')));}
});
test('같은 조직의 활성 분류·위치·일치하는 모델만 저장한다',async()=>{
 const f=fixture();const result=await updateAssetMetadata(f.pool,manager,5,patch({name:'새 이름',categoryId:10,modelId:30,locationId:20,acquiredAt:'2026-10-28'}),{requestId:'test',ip:'127.0.0.1'});assert.equal(result.edit_version,'101');assert.equal(result.model_id,30);assert.equal(f.audits.length,1);assert.equal(f.audits[0].before.name,'기존 시험 자산');assert.equal(f.audits[0].after.name,'새 이름');assert.equal(f.audits[0].changes.length,5);assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('활성·조직 밖 기준정보와 분류가 다른 모델은 롤백한다',async()=>{
 for(const fields of [{categoryId:99},{locationId:99},{categoryId:10,modelId:99},{categoryId:1,modelId:30},{categoryId:null,modelId:30}]){const f=fixture();await assert.rejects(updateAssetMetadata(f.pool,manager,5,patch(fields)),e=>e.code==='VALIDATION_ERROR');assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE')));assert.equal(f.calls.at(-1).sql,'ROLLBACK');}
});
test('이름만 수정하면 변경하지 않은 과거 기준정보를 강제로 재분류하지 않는다',async()=>{
 const f=fixture({asset:{...original,category_id:99,model_id:99,location_id:99}});await updateAssetMetadata(f.pool,manager,5,patch({name:'이름 보정'}));assert.equal(f.stored.category_id,99);assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT m.id')));
});
test('동일 값 저장은 변경 이력·버전 갱신 없이 거부한다',async()=>{
 const f=fixture();await assert.rejects(updateAssetMetadata(f.pool,manager,5,patch({name:original.name})),e=>e.status===400);assert.equal(f.stored.edit_version,'100');assert.equal(f.audits.length,0);
});
test('감사 저장 실패는 기본정보 UPDATE까지 롤백한다',async()=>{
 const f=fixture({auditFailure:true});await assert.rejects(updateAssetMetadata(f.pool,manager,5,patch({name:'실패 이름'})));assert.equal(f.stored.name,original.name);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
test('일련번호 중복은409로 매핑되고 감사가 생기지 않는다',async()=>{
 const f=fixture({duplicate:true});await assert.rejects(updateAssetMetadata(f.pool,manager,5,patch({serialNo:'DUP'})),e=>e.status===409&&e.code==='ASSET_SERIAL_CONFLICT');assert.equal(f.audits.length,0);
});
test('이력 조회도 동일 조직·부서 권한을 다시 검사한다',async()=>{
 const f=fixture();await updateAssetMetadata(f.pool,manager,5,patch({name:'변경 이름'}));assert.equal((await listAssetMetadataHistory(f.pool,manager,original)).length,1);await assert.rejects(listAssetMetadataHistory(f.pool,manager,{...original,organization_id:99}),e=>e.status===403);
});
