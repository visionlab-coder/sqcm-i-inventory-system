const test = require('node:test');
const assert = require('node:assert/strict');
const { can, requirePermission, requireOrganization, assertTransition } = require('../../src/services/enterprise-service');

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
