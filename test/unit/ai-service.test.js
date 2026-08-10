const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, organization, normalizeFeedback, normalizeEvaluation } = require('../../src/services/ai-service');

test('자연어 자산 검색은 허용된 필터로만 정규화한다', () => {
  const intent = parseSearch({ q: '유휴 자산 SW-IT-0001 찾아줘; DROP TABLE assets' });
  assert.equal(intent.intent, 'asset_search');
  assert.equal(intent.filters.idle, true);
  assert.equal(intent.filters.q, 'sw-it-0001');
  assert.equal(intent.normalizedQuery.includes('drop table'), true);
});

test('AI 조직 계약은 타 조직을 차단한다', () => {
  assert.throws(() => organization({ organizationId: 1, isSystemAdmin: false }, 2), error => error.status === 403);
  assert.equal(organization({ organizationId: 1, isSystemAdmin: false }, 1), 1);
});

test('AI 피드백과 평가 입력은 설명·버전·점수 범위를 검증한다', () => {
  assert.deepEqual(normalizeFeedback({ actionType:'TRANSFER', decision:'EXECUTED', reason:'현장 이동 완료', confidence:'0.8' }), {
    actionType:'TRANSFER', decision:'EXECUTED', reason:'현장 이동 완료', provider:'rules-and-adapters', modelVersion:'cost-control-v1', estimatedCost:null, avoidedCost:null, confidence:0.8
  });
  assert.throws(() => normalizeFeedback({ actionType:'TRANSFER', decision:'ACCEPTED', reason:'x' }), error => error.status === 400);
  assert.deepEqual(normalizeEvaluation({ provider:'external', modelVersion:'v2', datasetVersion:'pilot-1', sampleCount:'10', precision:'0.9', recall:'0.8', status:'PASSED' }).sampleCount, 10);
  assert.throws(() => normalizeEvaluation({ provider:'external', modelVersion:'v2', datasetVersion:'pilot-1', sampleCount:1, precision:2 }), error => error.status === 400);
});
