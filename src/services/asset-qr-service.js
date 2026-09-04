const { DomainError, positiveInteger } = require('./inventory-service');
const { requirePermission, requireOrganization } = require('./enterprise-service');
const { resolveScope, canAccessDepartment } = require('./scope-service');

const QR_PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeQrPublicId(value) {
  const publicId = String(value || '').trim().toLowerCase();
  if (!QR_PUBLIC_ID.test(publicId)) throw new DomainError('올바른 QR 자산 식별자가 필요합니다.');
  return publicId;
}

function qrScanUrl(publicBaseUrl, publicId) {
  const base = String(publicBaseUrl || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(base)) throw new Error('QR label requires a valid public base URL.');
  return `${base}/#scan=${encodeURIComponent(normalizeQrPublicId(publicId))}`;
}

async function findAssetByQr(pool, user, publicId) {
  requirePermission(user, 'asset.read');
  const normalized = normalizeQrPublicId(publicId);
  const organizationId = Number(user.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new DomainError('올바른 조직이 필요합니다.');
  const result = await pool.query('SELECT * FROM assets WHERE qr_public_id=$1 AND organization_id=$2', [normalized, organizationId]);
  if (!result.rowCount) throw new DomainError('QR에 연결된 자산을 찾을 수 없습니다.', 404);
  const asset = result.rows[0];
  const scope = await resolveScope(pool, user);
  if (!canAccessDepartment(scope, asset.department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.', 403);
  return asset;
}

async function findAssetForQrLabel(pool, user, assetId) {
  requirePermission(user, 'asset.read');
  const id = positiveInteger(assetId, '자산번호');
  const result = await pool.query('SELECT * FROM assets WHERE id=$1', [id]);
  if (!result.rowCount) throw new DomainError('자산을 찾을 수 없습니다.', 404);
  const asset = result.rows[0];
  requireOrganization(user, asset.organization_id);
  const scope = await resolveScope(pool, user);
  if (!canAccessDepartment(scope, asset.department_id)) throw new DomainError('허용된 부서 범위를 벗어났습니다.', 403);
  return asset;
}

module.exports = { normalizeQrPublicId, qrScanUrl, findAssetByQr, findAssetForQrLabel };
