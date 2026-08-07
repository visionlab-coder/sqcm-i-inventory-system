const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReportFilters, normalizeAuditFilters } = require('../../src/services/reporting-service');

test('자산 보고 필터는 차원 ID·상태·날짜를 정규화한다', () => {
  assert.deepEqual(normalizeReportFilters({ departmentId:'2', locationId:'3', categoryId:'4', status:' available ', from:'2026-01-01', to:'2026-12-31' }), {
    departmentId:2, locationId:3, categoryId:4, status:'AVAILABLE', from:'2026-01-01', to:'2026-12-31'
  });
});

test('자산 보고 필터는 잘못된 상태·달력 날짜·역전 기간을 거부한다', () => {
  assert.throws(() => normalizeReportFilters({ status:'UNKNOWN' }), error => error.status === 400);
  assert.throws(() => normalizeReportFilters({ from:'2026-02-30' }), error => error.status === 400);
  assert.throws(() => normalizeReportFilters({ from:'2026-12-31', to:'2026-01-01' }), error => error.status === 400);
});

test('감사 필터는 행위·대상·작업자·변경값 검색어를 정규화한다', () => {
  assert.deepEqual(normalizeAuditFilters({ action:' ASSET_CREATED ', entityType:' ASSET ', actorId:'7', from:'2026-01-01T00:00', to:'2026-12-31T23:59', q:' before value ' }), {
    action:'ASSET_CREATED', entityType:'ASSET', actorId:7, from:'2026-01-01T00:00', to:'2026-12-31T23:59', q:'before value'
  });
});

test('감사 필터는 잘못된 작업자·시각·역전 기간을 거부한다', () => {
  assert.throws(() => normalizeAuditFilters({ actorId:'x' }), error => error.status === 400);
  assert.throws(() => normalizeAuditFilters({ from:'not-a-date' }), error => error.status === 400);
  assert.throws(() => normalizeAuditFilters({ from:'2026-12-31', to:'2026-01-01' }), error => error.status === 400);
});
