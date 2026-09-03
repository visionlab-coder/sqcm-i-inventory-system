const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicationModule = import('../../src/operations/production-ingress-publication.mjs');
const zoneId = '0123456789abcdef0123456789abcdef';
const recordId = 'fedcba9876543210fedcba9876543210';
const zone = 'safe-link.co.kr';
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
    ttl: 1,
    ...overrides
  };
}

test('publication zone은 exact id·name·active identity 하나만 허용한다', async () => {
  const { selectProductionIngressZone } = await publicationModule;
  assert.deepEqual(selectProductionIngressZone({
    zones: [{ id: zoneId, name: zone, status: 'active' }], expectedName: zone
  }), { id: zoneId, name: zone, status: 'active' });
  for (const zones of [[], [{ id: '../zone', name: zone, status: 'active' }], [{ id: zoneId, name: 'other.example', status: 'active' }], [{ id: zoneId, name: zone, status: 'pending' }]]) {
    assert.throws(() => selectProductionIngressZone({ zones, expectedName: zone }), /INGRESS_DNS_ZONE_IDENTITY_INVALID/);
  }
});

test('existing/created record는 전체 exact identity일 때만 publication 성공 근거가 된다', async () => {
  const { selectProductionIngressDnsRecord } = await publicationModule;
  assert.deepEqual(selectProductionIngressDnsRecord({
    records: [exactRecord()], zoneId, hostname, expectedContent
  }), exactRecord());
  assert.equal(selectProductionIngressDnsRecord({ records: [], zoneId, hostname, expectedContent }), null);
});

test('exact zone endpoint 응답이 zone_id를 생략해도 나머지 전체 identity를 검증한다', async () => {
  const { selectProductionIngressDnsRecord } = await publicationModule;
  const record = exactRecord();
  delete record.zone_id;
  assert.deepEqual(selectProductionIngressDnsRecord({ records: [record], zoneId, hostname, expectedContent }), record);
});

test('malformed 또는 복수 record는 create/reuse 전에 fail-closed한다', async () => {
  const { selectProductionIngressDnsRecord } = await publicationModule;
  assert.throws(() => selectProductionIngressDnsRecord({ records: {}, zoneId, hostname, expectedContent }), /INGRESS_DNS_RECORD_RESPONSE_INVALID/);
  assert.throws(() => selectProductionIngressDnsRecord({ records: [exactRecord(), exactRecord({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })], zoneId, hostname, expectedContent }), /INGRESS_DNS_RECORD_IDENTITY_AMBIGUOUS/);
});

test('record identity 필드 하나라도 다르면 exact publication으로 승격하지 않는다', async () => {
  const { selectProductionIngressDnsRecord } = await publicationModule;
  const mutations = [
    { id: '../record' },
    { zone_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { name: 'other.safe-link.co.kr' },
    { type: 'A' },
    { content: 'other.cfargotunnel.com' },
    { proxied: false },
    { ttl: 300 }
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => selectProductionIngressDnsRecord({ records: [exactRecord(mutation)], zoneId, hostname, expectedContent }),
      /INGRESS_DNS_RECORD_TARGET_INVALID/
    );
  }
});

test('selector 입력 자체가 승인 target과 다르면 차단한다', async () => {
  const { selectProductionIngressDnsRecord } = await publicationModule;
  assert.throws(() => selectProductionIngressDnsRecord({ records: [], zoneId: '../zone', hostname, expectedContent }), /INGRESS_DNS_RECORD_TARGET_INVALID/);
  assert.throws(() => selectProductionIngressDnsRecord({ records: [], zoneId, hostname: 'other.example', expectedContent }), /INGRESS_DNS_RECORD_TARGET_INVALID/);
});

test('진입점은 selected zone과 selected record로만 DNS exact 상태를 판정한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/production-ingress-publication.mjs'), 'utf8');
  assert.match(source, /selectProductionIngressZone/);
  assert.match(source, /selectProductionIngressDnsRecord/);
  assert.match(source, /const dnsRecordExact = selectedRecord !== null/);
  assert.doesNotMatch(source, /records\[0\]/);
  assert.doesNotMatch(source, /zones\[0\]/);
});
