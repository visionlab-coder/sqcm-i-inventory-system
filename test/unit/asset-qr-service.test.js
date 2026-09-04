const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQrPublicId, qrScanUrl, findAssetByQr } = require('../../src/services/asset-qr-service');

const publicId = '7d6c1c2e-cad5-4f84-8b9c-370fbc1ef424';

test('QR 공개 식별자는 UUID만 허용하고 소문자로 정규화한다', () => {
  assert.equal(normalizeQrPublicId(publicId.toUpperCase()), publicId);
  assert.throws(() => normalizeQrPublicId('1 OR 1=1'), error => error.status === 400);
  assert.throws(() => normalizeQrPublicId(''), error => error.status === 400);
});

test('QR payload에는 자산 정보나 Secret 없이 공개 식별자 URL만 포함한다', () => {
  const value = qrScanUrl('https://inventory.safe-link.co.kr/', publicId);
  assert.equal(value, `https://inventory.safe-link.co.kr/#scan=${publicId}`);
  assert.doesNotMatch(value, /assetTag|serial|organization|secret/i);
  assert.throws(() => qrScanUrl('', publicId), /valid public base URL/);
});

test('QR 조회는 로그인 조직을 SQL 조건에 포함하고 부서 범위를 다시 검증한다', async () => {
  const queries = [];
  const pool = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('FROM assets')) return { rowCount:1, rows:[{ id:9, organization_id:7, department_id:3, qr_public_id:publicId }] };
    if (sql.includes('FROM user_role_scopes')) return { rowCount:1, rows:[{ scope_type:'DEPARTMENT', organization_id:7, department_id:3 }] };
    if (sql.includes('WITH RECURSIVE tree')) return { rowCount:1, rows:[{ id:3 }] };
    throw new Error(`unexpected SQL: ${sql}`);
  } };
  const asset = await findAssetByQr(pool, { id:4, role:'USER', organizationId:7, departmentId:3 }, publicId);
  assert.equal(asset.id, 9);
  assert.deepEqual(queries[0].values, [publicId, 7]);
  assert.match(queries[0].sql, /organization_id=\$2/);
});

test('다른 부서 QR 자산은 식별자가 유효해도 403으로 차단한다', async () => {
  const pool = { async query(sql) {
    if (sql.includes('FROM assets')) return { rowCount:1, rows:[{ id:9, organization_id:7, department_id:99, qr_public_id:publicId }] };
    if (sql.includes('FROM user_role_scopes')) return { rowCount:1, rows:[{ scope_type:'DEPARTMENT', organization_id:7, department_id:3 }] };
    if (sql.includes('WITH RECURSIVE tree')) return { rowCount:1, rows:[{ id:3 }] };
    throw new Error(`unexpected SQL: ${sql}`);
  } };
  await assert.rejects(findAssetByQr(pool, { id:4, role:'USER', organizationId:7, departmentId:3 }, publicId), error => error.status === 403);
});
