const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const { requireDepartmentAccess } = require('./scope-service');

const FIELDS = Object.freeze({name:'name',serialNo:'serial_no',categoryId:'category_id',modelId:'model_id',locationId:'location_id',acquiredAt:'acquired_at'});
function fieldError(field,message){const error=new DomainError(message);error.code='VALIDATION_ERROR';error.fieldErrors=[{field,message}];throw error;}
function normalizeAssetPatch(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))fieldError('body','올바른 수정 정보가 필요합니다.');
  for(const key of Object.keys(input))if(!Object.hasOwn(FIELDS,key)&&!['expectedVersion','reason','_csrf'].includes(key))fieldError(key,'이 항목은 기본정보 수정에서 변경할 수 없습니다.');
  if(!/^[0-9]{1,10}$/.test(String(input.expectedVersion||'')))fieldError('expectedVersion','최신 자산 화면을 다시 불러오세요.');
  if(typeof input.reason!=='string'||input.reason.trim().length<2||input.reason.trim().length>500)fieldError('reason','변경 사유를 2~500자로 입력하세요.');
  const fields={};
  for(const [key,column] of Object.entries(FIELDS)){
    if(!Object.hasOwn(input,key))continue;
    const value=input[key];
    if(['categoryId','modelId','locationId'].includes(key)){
      if(value===null||value==='')fields[column]=null;
      else {if(!/^[1-9][0-9]*$/.test(String(value))||!Number.isSafeInteger(Number(value)))fieldError(key,'올바른 기준정보를 선택하세요.');fields[column]=Number(value);}
    }else if(key==='acquiredAt'){
      if(value===null||value==='')fields[column]=null;
      else {const parsed=typeof value==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T00:00:00Z`):null;if(!parsed||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fieldError(key,'취득일은 실제 달력 날짜로 입력하세요.');fields[column]=value;}
    }else{
      if(value!==null&&typeof value!=='string')fieldError(key,'문자로 입력하세요.');
      const text=(value??'').trim();
      if(key==='name'&&(text.length<2||text.length>150))fieldError(key,'자산명은 2~150자로 입력하세요.');
      if(key==='serialNo'&&text.length>100)fieldError(key,'일련번호는 100자 이하여야 합니다.');
      fields[column]=key==='serialNo'&&!text?null:text;
    }
  }
  if(!Object.keys(fields).length)fieldError('body','수정할 기본정보를 입력하세요.');
  return {fields,expectedVersion:String(input.expectedVersion),reason:input.reason.trim()};
}
const metadata=row=>Object.fromEntries(Object.values(FIELDS).map(column=>[column,row[column]==null?null:['category_id','model_id','location_id'].includes(column)?Number(row[column]):row[column]]));
async function validateReferences(client,asset,fields){
  if(Object.hasOwn(fields,'category_id')&&fields.category_id!==null){const r=await client.query('SELECT id FROM item_categories WHERE id=$1 AND organization_id=$2 AND is_active FOR SHARE',[fields.category_id,asset.organization_id]);if(!r.rowCount)fieldError('categoryId','같은 조직의 활성 분류만 선택할 수 있습니다.');}
  if(Object.hasOwn(fields,'location_id')&&fields.location_id!==null){const r=await client.query("SELECT id FROM locations WHERE id=$1 AND organization_id=$2 AND status='ACTIVE' FOR SHARE",[fields.location_id,asset.organization_id]);if(!r.rowCount)fieldError('locationId','같은 조직의 활성 위치만 선택할 수 있습니다.');}
  const next={...asset,...fields};
  if((Object.hasOwn(fields,'category_id')||Object.hasOwn(fields,'model_id'))&&next.model_id!==null&&next.model_id!==undefined){const r=await client.query('SELECT m.id,m.category_id FROM item_models m JOIN item_categories c ON c.id=m.category_id WHERE m.id=$1 AND c.organization_id=$2 AND m.is_active AND c.is_active FOR SHARE OF m,c',[next.model_id,asset.organization_id]);if(!r.rowCount||Number(r.rows[0].category_id)!==Number(next.category_id))fieldError('modelId','선택한 분류에 속한 같은 조직의 활성 모델만 선택하세요.');}
}
async function updateAssetMetadata(pool,user,assetId,input,trace={}){
  requirePermission(user,'asset.update');const id=positiveInteger(assetId,'자산번호');const patch=normalizeAssetPatch(input);const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query("SELECT a.*,a.xmin::text AS edit_version,to_char(a.acquired_at,'YYYY-MM-DD') AS acquired_at FROM assets a WHERE id=$1 FOR UPDATE",[id]);
    if(!current.rowCount)throw new DomainError('자산을 찾을 수 없습니다.',404);
    const asset=current.rows[0];requireOrganization(user,asset.organization_id);await requireDepartmentAccess(client,user,asset.department_id);
    if(asset.deactivated_at||['CANCELLED','DISPOSED'].includes(asset.status_code))throw new DomainError('취소·폐기된 자산의 기본정보는 수정할 수 없습니다.',409);
    if(asset.edit_version!==patch.expectedVersion){const error=new DomainError('다른 작업에서 자산이 변경되었습니다. 입력을 확인한 뒤 최신 정보를 다시 불러오세요.',409);error.code='ASSET_EDIT_CONFLICT';throw error;}
    const before=metadata(asset),after={...before,...patch.fields};
    const changes=Object.keys(patch.fields).filter(key=>String(before[key]??'')!==String(after[key]??'')).map(field=>({field,before:before[field],after:after[field]}));
    if(!changes.length)fieldError('body','변경된 기본정보가 없습니다.');
    // Validate only changed references; unrelated edits must retain historical inactive references.
    const changedFields=Object.fromEntries(changes.map(change=>[change.field,change.after]));await validateReferences(client,asset,changedFields);
    const result=await client.query("UPDATE assets SET name=$1,serial_no=$2,category_id=$3,model_id=$4,location_id=$5,acquired_at=$6,updated_at=clock_timestamp() WHERE id=$7 RETURNING *,xmin::text AS edit_version,to_char(acquired_at,'YYYY-MM-DD') AS acquired_at",[after.name,after.serial_no,after.category_id,after.model_id,after.location_id,after.acquired_at,id]);
    await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata,request_id,ip_address) VALUES($1,'ASSET_METADATA_UPDATED','ASSET',$2,$3::jsonb,$4,$5)",[user.id,String(id),JSON.stringify({before,after,changes,reason:patch.reason}),trace.requestId||null,trace.ip||null]);
    await client.query('COMMIT');return result.rows[0];
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505'){const conflict=new DomainError('이미 사용 중인 일련번호입니다.',409);conflict.code='ASSET_SERIAL_CONFLICT';throw conflict;}throw error;}finally{client.release();}
}
async function listAssetMetadataHistory(pool,user,asset){
  requirePermission(user,'asset.read');requireOrganization(user,asset.organization_id);await requireDepartmentAccess(pool,user,asset.department_id);
  return (await pool.query("SELECT l.id,l.created_at,u.display_name AS changed_by_name,l.metadata->'changes' AS changes,l.metadata->>'reason' AS reason FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id WHERE l.entity_type='ASSET' AND l.entity_id=$1 AND l.action='ASSET_METADATA_UPDATED' ORDER BY l.created_at DESC,l.id DESC LIMIT 100",[String(asset.id)])).rows;
}
module.exports={FIELDS,normalizeAssetPatch,updateAssetMetadata,listAssetMetadataHistory};
