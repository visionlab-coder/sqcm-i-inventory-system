const test = require('node:test');
const assert = require('node:assert/strict');
const { can, requirePermission, requireOrganization, assertTransition, normalizePurchasePayload } = require('../../src/services/enterprise-service');

test('역할별 최소 권한과 관리자 전체 권한을 적용한다', () => {
  assert.equal(can({ role: 'USER' }, 'request.create'), true);
  assert.equal(can({ role: 'USER' }, 'asset.create'), false);
  assert.equal(can({ role: 'MANAGER' }, 'request.review'), true);
  assert.equal(can({ role: 'ADMIN' }, 'admin.manage'), true);
});

test('권한 없는 작업은 403으로 거부한다', () => {
  assert.throws(() => requirePermission({ role: 'USER' }, 'stocktake.manage'), error => error.status === 403);
  assert.throws(() => requirePermission(null, 'asset.read'), error => error.status === 401);
});

test('일반 역할은 자기 조직만 접근하고 관리자는 조직을 전환할 수 있다', () => {
  assert.equal(requireOrganization({ role: 'MANAGER', organizationId: 7 }, 7), 7);
  assert.throws(() => requireOrganization({ role: 'MANAGER', organizationId: 7 }, 8), error => error.status === 403);
  assert.equal(requireOrganization({ role: 'ADMIN', organizationId: 7 }, 8), 8);
});

test('자산 상태는 명시된 전이만 허용한다', () => {
  assert.doesNotThrow(() => assertTransition('AVAILABLE', 'ASSIGNED'));
  assert.doesNotThrow(() => assertTransition('LOST', 'FOUND'));
  assert.throws(() => assertTransition('DISPOSED', 'AVAILABLE'), error => error.status === 409);
  assert.throws(() => assertTransition('AVAILABLE', 'DISPOSED'), error => error.status === 409);
});

test('구매 요청 필수정보를 정확한 자료형과 형식으로 정규화한다', () => {
  assert.deepEqual(normalizePurchasePayload({
    itemName: '  현장용 레이저 레벨기 ', quantity: '3', estimatedAmount: '1250000.5', costCenter: ' hq-001 ', neededAt: '2026-09-30'
  }), {
    itemName: '현장용 레이저 레벨기', quantity: 3, estimatedAmount: '1250000.50', costCenter: 'HQ-001', neededAt: '2026-09-30'
  });
});

test('구매 요청의 누락·수량·금액 오류는 해당 필드를 포함해 거부한다', () => {
  const base = { itemName: '안전모', quantity: 2, estimatedAmount: '50000', costCenter: 'SAFETY-01', neededAt: '2026-09-30' };
  for (const [field, value] of [['itemName', ''], ['quantity', 0], ['estimatedAmount', '1.234']]) {
    assert.throws(() => normalizePurchasePayload({ ...base, [field]: value }), error => error.code === 'VALIDATION_ERROR' && error.fieldErrors[0].field === field);
  }
});

test('구매 요청의 비용센터와 실제 달력 날짜를 검증한다', () => {
  const base = { itemName: '안전모', quantity: 2, estimatedAmount: '50000', costCenter: 'SAFETY-01', neededAt: '2026-09-30' };
  assert.throws(() => normalizePurchasePayload({ ...base, costCenter: '!' }), error => error.fieldErrors[0].field === 'costCenter');
  assert.throws(() => normalizePurchasePayload({ ...base, neededAt: '2026-02-30' }), error => error.fieldErrors[0].field === 'neededAt');
});
