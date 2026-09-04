const crypto = require('node:crypto');
const { DomainError, positiveInteger } = require('./inventory-service');

const RESULTS = new Set(['MATCH', 'MISSING', 'LOCATION_MISMATCH', 'DAMAGED']);

function normalizeOfflineOperation(input = {}) {
  const operationId = String(input.operationId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) throw new DomainError('올바른 오프라인 작업 ID가 필요합니다.');
  const assetId = positiveInteger(input.assetId, '자산번호');
  const baseVersion = Number(input.baseVersion);
  if (!Number.isInteger(baseVersion) || baseVersion < 0 || baseVersion > 2147483646) throw new DomainError('올바른 기준 버전이 필요합니다.');
  const result = String(input.result || '').trim().toUpperCase();
  if (!RESULTS.has(result)) throw new DomainError('올바른 실사 결과가 아닙니다.');
  const foundLocationId = input.foundLocationId == null || input.foundLocationId === '' ? null : positiveInteger(input.foundLocationId, '발견 위치');
  const reason = String(input.reason || '').trim();
  if (reason.length > 500) throw new DomainError('실사 사유는 500자 이하여야 합니다.');
  const normalized = { operationId, assetId, baseVersion, result, foundLocationId, reason: reason || null };
  return { ...normalized, payloadSha256: crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
}

function normalizeOfflineBatch(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new DomainError('오프라인 작업은 1~100건이어야 합니다.');
  const operations = input.map(normalizeOfflineOperation);
  if (new Set(operations.map(item => item.operationId)).size !== operations.length) throw new DomainError('오프라인 작업 ID가 중복되었습니다.');
  return operations;
}

module.exports = { normalizeOfflineOperation, normalizeOfflineBatch };
