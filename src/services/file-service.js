const crypto = require('node:crypto');
const path = require('node:path');
const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const { requireDepartmentAccess } = require('./scope-service');
const repository = require('../repositories/file-repository');

const TYPES = new Set(['PHOTO','RECEIPT','INSPECTION','DISPOSAL','RETURN']);
const MEDIA = {
  'image/jpeg': { ext:'jpg', matches:b=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff },
  'image/png': { ext:'png', matches:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  'application/pdf': { ext:'pdf', matches:b=>b.length>=5&&b.subarray(0,5).toString('ascii')==='%PDF-' }
};

function normalizeUpload(input, maxBytes) {
  const contentType = String(input.contentType || '').toLowerCase().split(';')[0].trim();
  const media = MEDIA[contentType];
  if (!media) throw new DomainError('JPEG, PNG, PDF 파일만 업로드할 수 있습니다.', 415);
  if (!Buffer.isBuffer(input.content) || input.content.length < 1) throw new DomainError('업로드할 파일이 비어 있습니다.');
  if (input.content.length > maxBytes) throw new DomainError('파일은 5 MiB 이하여야 합니다.', 413);
  if (!media.matches(input.content)) throw new DomainError('파일 내용과 Content-Type이 일치하지 않습니다.');
  const fileType = String(input.fileType || '').toUpperCase();
  if (!TYPES.has(fileType)) throw new DomainError('올바른 증빙 유형이 필요합니다.');
  if (fileType === 'RETURN' && !contentType.startsWith('image/')) throw new DomainError('반납 사진은 JPEG 또는 PNG만 허용됩니다.', 415);
  let decodedName;
  try { decodedName = decodeURIComponent(String(input.originalName || '')); } catch { decodedName = String(input.originalName || ''); }
  const rawName = decodedName.replace(/[\u0000-\u001f\u007f]/g,'').trim();
  const originalName = path.basename(rawName).slice(0,255);
  if (!originalName) throw new DomainError('원본 파일명이 필요합니다.');
  return { contentType, fileType, originalName, media };
}

function storageKey(organizationId, extension, now = new Date()) {
  return `${organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${crypto.randomBytes(20).toString('hex')}.${extension}`;
}

async function uploadAssetFile({ pool, fileStore, maxBytes, user, assetId, input, trace }) {
  requirePermission(user, 'asset.update');
  const id = positiveInteger(assetId, '자산번호');
  const asset = await repository.findAsset(pool,id);
  if (!asset) throw new DomainError('자산을 찾을 수 없습니다.',404);
  requireOrganization(user,asset.organization_id);
  await requireDepartmentAccess(pool,user,asset.department_id);
  const normalized = normalizeUpload(input,maxBytes);
  const key = storageKey(asset.organization_id,normalized.media.ext);
  const checksum = crypto.createHash('sha256').update(input.content).digest('hex');
  await fileStore.write(key,input.content);
  try {
    return await repository.createAssetFile(pool,{ organizationId:asset.organization_id,assetId:id,storageKey:key,
      originalName:normalized.originalName,contentType:normalized.contentType,checksum,sizeBytes:input.content.length,
      storageDriver:'LOCAL',userId:user.id,fileType:normalized.fileType },trace);
  } catch (error) {
    await fileStore.removeNew(key).catch(()=>{});
    throw error;
  }
}

async function getAssetFile({ pool, fileStore, user, assetId, fileId, trace }) {
  requirePermission(user,'asset.read');
  const file = await repository.findActiveAssetFile(pool,positiveInteger(assetId,'자산번호'),positiveInteger(fileId,'파일번호'));
  if (!file) throw new DomainError('파일을 찾을 수 없습니다.',404);
  requireOrganization(user,file.asset_organization_id);
  await requireDepartmentAccess(pool,user,file.asset_department_id);
  const filePath = await fileStore.readPath(file.storage_key).catch(()=>{ throw new DomainError('파일 저장소에서 파일을 찾을 수 없습니다.',404); });
  await repository.recordDownload(pool,user.id,file,trace);
  return { file,filePath };
}

async function deactivateAssetFile({ pool, user, assetId, fileId, trace }) {
  requirePermission(user,'asset.update');
  const file = await repository.findActiveAssetFile(pool,positiveInteger(assetId,'자산번호'),positiveInteger(fileId,'파일번호'));
  if (!file) throw new DomainError('파일을 찾을 수 없습니다.',404);
  requireOrganization(user,file.asset_organization_id);
  await requireDepartmentAccess(pool,user,file.asset_department_id);
  return repository.deactivate(pool,user.id,file,trace);
}

module.exports = { TYPES, MEDIA, normalizeUpload, storageKey, uploadAssetFile, getAssetFile, deactivateAssetFile };
