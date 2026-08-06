const test = require('node:test');
const assert = require('node:assert/strict');
const { positiveInteger, nonNegativeInteger, DomainError } = require('../../src/services/inventory-service');
const { safeReturnPath } = require('../../src/app');

test('positiveInteger는 양의 정수를 반환한다', () => {
  assert.equal(positiveInteger('3', '수량'), 3);
});

test('positiveInteger는 0, 음수, 소수를 거부한다', () => {
  for (const value of [0, -1, 1.5, 'abc']) {
    assert.throws(() => positiveInteger(value, '수량'), DomainError);
  }
});

test('nonNegativeInteger는 0을 허용하고 음수를 거부한다', () => {
  assert.equal(nonNegativeInteger('0', '재고'), 0);
  assert.throws(() => nonNegativeInteger('-1', '재고'), DomainError);
});

test('safeReturnPath는 외부/프로토콜 상대 리다이렉트를 차단한다', () => {
  assert.equal(safeReturnPath('/items'), '/items');
  assert.equal(safeReturnPath('//evil.example'), '/');
  assert.equal(safeReturnPath('https://evil.example'), '/');
  assert.equal(safeReturnPath(undefined), '/');
});
