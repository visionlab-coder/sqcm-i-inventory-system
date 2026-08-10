const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSavingsEvent } = require('../../src/services/cost-service');

test('Cost 절감 원장은 기준·실제 비용 차이를 절감액으로 계산한다', () => {
  assert.deepEqual(normalizeSavingsEvent({ savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:'1000000', actualCost:'120000', evidence:{note:'유휴 자산 이동'} }), {
    savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:1000000, actualCost:120000, avoidedAmount:880000, evidence:{note:'유휴 자산 이동'}
  });
});

test('Cost 절감 원장은 실제 비용이 기준을 초과하거나 유형이 잘못되면 거부한다', () => {
  assert.throws(() => normalizeSavingsEvent({ savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:100, actualCost:101 }), error => error.status === 400);
  assert.throws(() => normalizeSavingsEvent({ savingsType:'UNKNOWN', baselineCost:100, actualCost:0 }), error => error.status === 400);
});
