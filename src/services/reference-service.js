const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const repository = require('../repositories/reference-repository');

const KINDS = new Set(['categories','models','vendors','locations','statuses','reasons']);
const LOCATION_TYPES = new Set(['SITE','OFFICE','WAREHOUSE','FLOOR','ROOM']);
const ASSET_STATUSES = new Set(['DRAFT','RECEIVED','INSPECTION_PENDING','AVAILABLE','ASSIGNED','IN_USE','TRANSFER_PENDING','RETURNED','REPAIR','LOST','FOUND','DISPOSE_PENDING','DISPOSED','CANCELLED']);

function fieldError(field, message) {
  const error = new DomainError(message); error.code='VALIDATION_ERROR'; error.fieldErrors=[{field,message}]; throw error;
}

function normalizeKind(value) {
  const kind=String(value||'').trim().toLowerCase();
  if(!KINDS.has(kind)) throw new DomainError('지원하지 않는 기준정보 유형입니다.',404);
  return kind;
}

function code(value) {
  const normalized=String(value||'').trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(normalized)) fieldError('code','코드는 영문·숫자·하이픈·밑줄 2~30자로 입력하세요.');
  return normalized;
}

function name(value, field='name') {
  const normalized=String(value||'').trim();
  if(normalized.length<2||normalized.length>150) fieldError(field,'명칭은 2~150자로 입력하세요.');
  return normalized;
}

function optionalId(value, field) { return value ? positiveInteger(value,field) : null; }
function optionalText(value,field,max=300){const normalized=String(value||'').trim();if(normalized.length>max)fieldError(field,`${field}은(는) ${max}자 이하여야 합니다.`);return normalized||null;}
function statusCode(value,optional=false){const normalized=String(value||'').trim().toUpperCase();if(optional&&!normalized)return null;if(!ASSET_STATUSES.has(normalized))fieldError('code','기존 상태 전이 그래프의 상태 코드만 사용할 수 있습니다.');return normalized;}
function sortOrder(value){const number=Number(value??0);if(!Number.isInteger(number)||number<0||number>999)fieldError('sortOrder','정렬 순서는 0~999 정수여야 합니다.');return number;}

function normalizeCreate(kindInput, input={}) {
  const kind=normalizeKind(kindInput);
  if(kind==='categories') return {kind,code:code(input.code),name:name(input.name),parentId:optionalId(input.parentId,'상위 유형')};
  if(kind==='models') {
    const brand=String(input.brand||'').trim(); if(brand.length<1||brand.length>100) fieldError('brand','브랜드는 1~100자로 입력하세요.');
    let specification=input.specification||{};
    if(typeof specification==='string'){try{specification=specification.trim()?JSON.parse(specification):{};}catch{fieldError('specification','사양은 올바른 JSON이어야 합니다.');}}
    if(!specification||Array.isArray(specification)||typeof specification!=='object'||JSON.stringify(specification).length>5000) fieldError('specification','사양은 5,000자 이하 JSON 객체여야 합니다.');
    return {kind,categoryId:positiveInteger(input.categoryId,'자산 유형'),brand,name:name(input.name),specification};
  }
  if(kind==='vendors') {
    const contactEmail=String(input.contactEmail||'').trim().toLowerCase();
    if(contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) fieldError('contactEmail','올바른 담당 이메일을 입력하세요.');
    return {kind,code:code(input.code),name:name(input.name),contact:contactEmail?{email:contactEmail}:{}};
  }
  if(kind==='statuses') return {kind,code:statusCode(input.code),name:name(input.name),description:optionalText(input.description,'설명'),sortOrder:sortOrder(input.sortOrder)};
  if(kind==='reasons') {
    if(typeof input.requiresDetail!=='boolean') fieldError('requiresDetail','추가 설명 요구 여부는 boolean이어야 합니다.');
    return {kind,code:code(input.code),name:name(input.name),appliesToStatus:statusCode(input.appliesToStatus,true),requiresDetail:input.requiresDetail};
  }
  const locationType=String(input.locationType||'SITE').trim().toUpperCase();
  if(!LOCATION_TYPES.has(locationType)) fieldError('locationType','올바른 위치 유형이 아닙니다.');
  return {kind,code:code(input.code),name:name(input.name),parentId:optionalId(input.parentId,'상위 위치'),locationType};
}

function normalizeUpdate(kindInput,input={}) {
  const kind=normalizeKind(kindInput); const isActive=input.isActive;
  if(typeof isActive!=='boolean') fieldError('isActive','활성 상태는 boolean이어야 합니다.');
  if(kind==='statuses') return {kind,name:name(input.name),isActive,description:optionalText(input.description,'설명'),sortOrder:sortOrder(input.sortOrder)};
  if(kind==='reasons') {
    if(typeof input.requiresDetail!=='boolean') fieldError('requiresDetail','추가 설명 요구 여부는 boolean이어야 합니다.');
    return {kind,name:name(input.name),isActive,appliesToStatus:statusCode(input.appliesToStatus,true),requiresDetail:input.requiresDetail};
  }
  return {kind,name:name(input.name),isActive};
}

async function getOperationalReferences(pool,user,organizationIdInput){return repository.listOperationalReferences(pool,requireOrganization(user,organizationIdInput||user.organizationId));}
async function getAdminReferences(pool,user,organizationIdInput){requirePermission(user,'admin.manage');return repository.listAdminReferences(pool,requireOrganization(user,organizationIdInput||user.organizationId));}

async function createReference(pool,user,kindInput,organizationIdInput,input,trace={}){
  requirePermission(user,'admin.manage'); const organizationId=requireOrganization(user,organizationIdInput||user.organizationId); const value=normalizeCreate(kindInput,input); const client=await pool.connect();
  try{await client.query('BEGIN');
    if(value.kind==='models'&&!await repository.findActiveCategory(client,value.categoryId,organizationId)) throw new DomainError('같은 조직의 활성 자산 유형이 필요합니다.',409);
    if(value.parentId&&!await repository.findActiveParent(client,value.kind,value.parentId,organizationId)) throw new DomainError('같은 조직의 활성 상위 기준정보가 필요합니다.',409);
    const created=await repository.insertReference(client,value.kind,organizationId,value);
    await repository.insertAudit(client,user.id,'REFERENCE_CREATED',value.kind.toUpperCase(),created.id,{kind:value.kind,code:value.code||null,name:value.name},trace);
    await client.query('COMMIT'); return created;
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw new DomainError('이미 사용 중인 기준정보입니다.',409);throw error;}finally{client.release();}
}

async function updateReference(pool,user,kindInput,idInput,organizationIdInput,input,trace={}){
  requirePermission(user,'admin.manage'); const organizationId=requireOrganization(user,organizationIdInput||user.organizationId); const kind=normalizeKind(kindInput); const id=positiveInteger(idInput,'기준정보번호'); const value=normalizeUpdate(kind,input); const client=await pool.connect();
  try{await client.query('BEGIN');const current=await repository.findReferenceForUpdate(client,kind,id);if(!current)throw new DomainError('기준정보를 찾을 수 없습니다.',404);if(Number(current.organization_id)!==organizationId)throw new DomainError('다른 조직의 기준정보를 변경할 수 없습니다.',403);
    const updated=await repository.updateReference(client,kind,id,value);
    const before={name:current.current_name,isActive:Boolean(current.current_active)}; const after={name:value.name,isActive:value.isActive};
    if(kind==='statuses'){Object.assign(before,{description:current.description,sortOrder:current.sort_order});Object.assign(after,{description:value.description,sortOrder:value.sortOrder});}
    if(kind==='reasons'){Object.assign(before,{appliesToStatus:current.applies_to_status,requiresDetail:current.requires_detail});Object.assign(after,{appliesToStatus:value.appliesToStatus,requiresDetail:value.requiresDetail});}
    await repository.insertAudit(client,user.id,'REFERENCE_UPDATED',kind.toUpperCase(),id,{kind,before,after},trace);
    await client.query('COMMIT');return updated;
  }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw new DomainError('이미 사용 중인 기준정보 명칭입니다.',409);throw error;}finally{client.release();}
}

module.exports={KINDS,ASSET_STATUSES,normalizeKind,normalizeCreate,normalizeUpdate,getOperationalReferences,getAdminReferences,createReference,updateReference};
