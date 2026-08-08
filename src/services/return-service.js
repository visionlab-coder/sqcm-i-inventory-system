const crypto = require('node:crypto');
const { DomainError, positiveInteger } = require('./inventory-service');
const { normalizeUpload, storageKey } = require('./file-service');
const { requireDepartmentAccess } = require('./scope-service');
const repository = require('../repositories/file-repository');

const CONDITIONS = new Set(['GOOD','DAMAGED','MISSING_PARTS']);

function normalizeReturnPayload(input = {}) {
  const conditionCode = String(input.conditionCode || input.returnCondition || '').trim().toUpperCase();
  const note = String(input.note || input.returnNote || '').trim();
  const source = Array.isArray(input.accessories) ? input.accessories : String(input.accessories || '').split(',');
  const accessories = [...new Set(source.map(value=>String(value).trim()).filter(Boolean))];
  if (!CONDITIONS.has(conditionCode)) throw new DomainError('반납 상태는 GOOD, DAMAGED, MISSING_PARTS 중 하나여야 합니다.');
  if (note.length > 500) throw new DomainError('반납 메모는 500자 이하여야 합니다.');
  if (conditionCode !== 'GOOD' && note.length < 2) throw new DomainError('손상 또는 부속품 누락 시 2자 이상의 메모가 필요합니다.');
  if (accessories.length > 20 || accessories.some(value=>value.length > 80)) throw new DomainError('부속품은 20개 이하, 각 80자 이하로 입력하세요.');
  return { conditionCode, note:note || null, accessories };
}

async function uploadReturnPhoto({ pool,fileStore,maxBytes,user,requestId,input,trace }) {
  const id = positiveInteger(requestId,'반납 요청번호');
  const found = await pool.query(`SELECT r.id,r.organization_id,r.requester_id,r.asset_id,r.request_type,r.status,a.department_id
    FROM workflow_requests r JOIN assets a ON a.id=r.asset_id WHERE r.id=$1`, [id]);
  if (!found.rowCount) throw new DomainError('반납 요청을 찾을 수 없습니다.',404);
  const request = found.rows[0];
  if (request.request_type !== 'RETURN' || request.status !== 'DRAFT') throw new DomainError('초안 상태의 반납 요청에만 사진을 추가할 수 있습니다.',409);
  if (Number(request.requester_id) !== Number(user.id)) throw new DomainError('반납 요청자만 사진을 추가할 수 있습니다.',403);
  if (Number(request.organization_id) !== Number(user.organizationId) && user.role !== 'ADMIN') throw new DomainError('다른 조직 요청에 접근할 수 없습니다.',403);
  await requireDepartmentAccess(pool,user,request.department_id);
  const normalized = normalizeUpload({ ...input,fileType:'RETURN' },maxBytes);
  const key = storageKey(request.organization_id,normalized.media.ext);
  const checksum = crypto.createHash('sha256').update(input.content).digest('hex');
  await fileStore.write(key,input.content);
  try {
    return await repository.createReturnEvidence(pool,{organizationId:request.organization_id,requestId:id,assetId:request.asset_id,storageKey:key,originalName:normalized.originalName,contentType:normalized.contentType,checksum,sizeBytes:input.content.length,storageDriver:'LOCAL',userId:user.id},trace);
  } catch(error) { await fileStore.removeNew(key).catch(()=>{}); throw error; }
}

module.exports = { CONDITIONS, normalizeReturnPayload, uploadReturnPhoto };
