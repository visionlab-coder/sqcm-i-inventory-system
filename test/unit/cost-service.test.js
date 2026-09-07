const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSavingsEvent, getCostRoiSummary } = require('../../src/services/cost-service');

test('부서 ROI는 조직 전체 예산·거래처와 귀속 없는 절감액을 공개하지 않는다',async()=>{
  const queries=[];
  const pool={query:async(sql,values)=>{queries.push({sql,values});return {rows:[{cost_center:'OTHER',fiscal_year:2026,budget:100,spent:0}]};}};
  const result=await getCostRoiSummary(pool,{organizationId:1},1,{departmentIds:[2]});
  assert.deepEqual(result.vendors,[]);assert.deepEqual(result.budgets,[]);
  assert.equal(result.visibility.organizationAggregatesRestricted,true);
  const savings=queries.find(q=>q.sql.includes('FROM cost_savings_events'));
  assert.doesNotMatch(savings.sql,/OR s\.asset_id IS NULL/);
  assert.deepEqual(savings.values,[1,[2]]);
  assert.equal(queries.some(q=>q.sql.includes('FROM vendors v')),false);
  assert.equal(queries.some(q=>q.sql.includes('FROM cost_budgets')),false);
});

test('Cost 절감 원장은 기준·실제 비용 차이를 절감액으로 계산한다', () => {
  assert.deepEqual(normalizeSavingsEvent({ savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:'1000000', actualCost:'120000', evidence:{note:'유휴 자산 이동'} }), {
    savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:1000000, actualCost:120000, avoidedAmount:880000, evidence:{note:'유휴 자산 이동'}
  });
});

test('Cost 절감 원장은 실제 비용이 기준을 초과하거나 유형이 잘못되면 거부한다', () => {
  assert.throws(() => normalizeSavingsEvent({ savingsType:'TRANSFER_AVOIDED_PURCHASE', baselineCost:100, actualCost:101 }), error => error.status === 400);
  assert.throws(() => normalizeSavingsEvent({ savingsType:'UNKNOWN', baselineCost:100, actualCost:0 }), error => error.status === 400);
});
