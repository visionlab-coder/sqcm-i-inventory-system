const test = require('node:test');
const assert = require('node:assert/strict');
const { can, requirePermission, requireOrganization, assertTransition, normalizePurchasePayload, normalizePurchaseOrderInput, normalizeInspectionResult } = require('../../src/services/enterprise-service');
const { normalizeOrganizationUnit, normalizeInvitation, validatePassword } = require('../../src/services/organization-service');

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

test('발주 입력은 표준 발주번호와 정밀한 금액으로 정규화한다', () => {
  assert.deepEqual(normalizePurchaseOrderInput({ requestId: '7', orderNo: ' po-2026_01 ', totalAmount: '1,250,000.5' }), {
    requestId: 7, orderNo: 'PO-2026_01', totalAmount: '1250000.50'
  });
  assert.throws(() => normalizePurchaseOrderInput({ requestId: 7, orderNo: '!', totalAmount: 1 }), error => error.status === 400);
  assert.throws(() => normalizePurchaseOrderInput({ requestId: 7, orderNo: 'PO-1', totalAmount: 0 }), error => error.status === 400);
});

test('검수 결과는 허용값만 대문자로 정규화한다', () => {
  assert.equal(normalizeInspectionResult(' pass '), 'PASS');
  assert.equal(normalizeInspectionResult('conditional'), 'CONDITIONAL');
  assert.throws(() => normalizeInspectionResult('pending'), error => error.status === 400);
});

test('조직 단위 유형과 부모 계층 입력을 정규화한다', () => {
  assert.deepEqual(normalizeOrganizationUnit({ code:' dev-team ', name:' 개발팀 ', unitType:'team', parentId:'7', costCenter:' it-01 ' }), {
    code:'DEV-TEAM', name:'개발팀', unitType:'TEAM', parentId:7, costCenter:'IT-01'
  });
  assert.throws(() => normalizeOrganizationUnit({ code:'HQ2', name:'본부', unitType:'HEADQUARTERS' }), error => error.fieldErrors[0].field === 'parentId');
  assert.throws(() => normalizeOrganizationUnit({ code:'ROOT', name:'법인', unitType:'CORPORATE', parentId:1 }), error => error.fieldErrors[0].field === 'parentId');
});

test('사용자 초대는 이메일·역할·데이터 범위를 검증한다', () => {
  assert.deepEqual(normalizeInvitation({ email:' New.User@Example.com ', displayName:' 신규 사용자 ', role:'manager', scopeType:'department', departmentId:'3' }), {
    email:'new.user@example.com', displayName:'신규 사용자', role:'MANAGER', scopeType:'DEPARTMENT', departmentId:3
  });
  assert.throws(() => normalizeInvitation({ email:'bad', displayName:'사용자', role:'ADMIN', scopeType:'ORGANIZATION' }), error => error.fieldErrors[0].field === 'email');
  assert.throws(() => normalizeInvitation({ email:'user@example.com', displayName:'사용자', role:'USER', scopeType:'DEPARTMENT' }), error => error.fieldErrors[0].field === 'departmentId');
});

test('초대 활성화 비밀번호는 강화 정책을 적용한다', () => {
  assert.doesNotThrow(() => validatePassword('StrongInvite123!'));
  assert.throws(() => validatePassword('weak-password'), error => error.code === 'VALIDATION_ERROR');
});
