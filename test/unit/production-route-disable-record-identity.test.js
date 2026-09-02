const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeModule = import('../../src/operations/production-route-disable.mjs');
const zoneId = '0123456789abcdef0123456789abcdef';
const recordId = 'fedcba9876543210fedcba9876543210';
const hostname = 'inventory.safe-link.co.kr';
const expectedContent = '994b5a27-cba4-4958-aecf-ed43db8730ef.cfargotunnel.com';

function exactRecord(overrides = {}) {
  return {
    id: recordId,
    zone_id: zoneId,
    name: hostname,
    type: 'CNAME',
    content: expectedContent,
    proxied: true,
    ...overrides
  };
}

test('zone 조회도 exact id·name·active identity 하나만 허용한다', async () => {
  const { selectProductionRouteDisableZone } = await routeModule;
  assert.deepEqual(selectProductionRouteDisableZone({
    zones: [{ id: zoneId, name: 'safe-link.co.kr', status: 'active' }],
    zone: 'safe-link.co.kr'
  }), { id: zoneId, name: 'safe-link.co.kr', status: 'active' });
  assert.throws(
    () => selectProductionRouteDisableZone({ zones: [{ id: '../other-zone', name: 'safe-link.co.kr', status: 'active' }], zone: 'safe-link.co.kr' }),
    /ROUTE_DISABLE_ZONE_IDENTITY_INVALID/
  );
  assert.throws(
    () => selectProductionRouteDisableZone({ zones: [{ id: zoneId, name: 'other.example', status: 'active' }], zone: 'safe-link.co.kr' }),
    /ROUTE_DISABLE_ZONE_IDENTITY_INVALID/
  );
});

test('삭제 대상은 exact zone·record id·name·type·content·proxied identity만 허용한다', async () => {
  const { selectProductionRouteDisableRecord } = await routeModule;
  assert.equal(typeof selectProductionRouteDisableRecord, 'function');
  assert.deepEqual(selectProductionRouteDisableRecord({
    records: [exactRecord()], zoneId, hostname, expectedContent
  }), exactRecord());
});

test('DNS record가 없으면 idempotent null을 반환한다', async () => {
  const { selectProductionRouteDisableRecord } = await routeModule;
  assert.equal(selectProductionRouteDisableRecord({ records: [], zoneId, hostname, expectedContent }), null);
});

test('복수 record 또는 malformed provider response는 ambiguous로 차단한다', async () => {
  const { selectProductionRouteDisableRecord } = await routeModule;
  assert.throws(
    () => selectProductionRouteDisableRecord({ records: [exactRecord(), exactRecord({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })], zoneId, hostname, expectedContent }),
    /ROUTE_DISABLE_DNS_IDENTITY_AMBIGUOUS/
  );
  assert.throws(
    () => selectProductionRouteDisableRecord({ records: {}, zoneId, hostname, expectedContent }),
    /ROUTE_DISABLE_DNS_RESPONSE_INVALID/
  );
});

test('identity 필드 하나라도 다르면 삭제 권한으로 승격하지 않는다', async () => {
  const { selectProductionRouteDisableRecord } = await routeModule;
  const mutations = [
    { id: '../other-record' },
    { zone_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { name: 'other.safe-link.co.kr' },
    { type: 'A' },
    { content: 'other.cfargotunnel.com' },
    { proxied: false }
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => selectProductionRouteDisableRecord({ records: [exactRecord(mutation)], zoneId, hostname, expectedContent }),
      /ROUTE_DISABLE_DNS_TARGET_INVALID/
    );
  }
});

test('실행 진입점은 검증된 record 객체의 id만 삭제에 사용한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-route-disable.mjs'), 'utf8');
  assert.match(source, /selectProductionRouteDisableRecord/);
  assert.match(source, /selectedZone\.id/);
  assert.match(source, /selectedRecord\.id/);
  assert.doesNotMatch(source, /records\[0\]\.id/);
});
