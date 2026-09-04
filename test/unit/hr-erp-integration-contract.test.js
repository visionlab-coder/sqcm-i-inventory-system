const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  INBOUND_SIGNATURE_VERSION,
  IntegrationContractError,
  buildErpOutboxEnvelope,
  canonicalJson,
  normalizeHrEvent,
  signWebhookPayload,
  verifyHrWebhook
} = require('../../src/integrations/hr-erp-contract');

const secret = 'unit-test-secret-with-at-least-32-bytes';
const now = new Date('2026-09-04T00:00:00.000Z');

function signedHeaders(rawBody, timestamp = Math.floor(now.getTime() / 1000)) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'x-sqcm-event-id': 'hr-event-0001',
    'x-sqcm-timestamp': String(timestamp),
    'x-sqcm-signature': `${INBOUND_SIGNATURE_VERSION}=${signWebhookPayload({ rawBody, timestamp, secret })}`
  };
}

test('HR webhook은 서명 검증 뒤 허용된 이벤트만 최소 필드로 정규화한다', async () => {
  const rawBody = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    type: 'employee.transferred',
    occurredAt: '2026-09-03T23:59:30.000Z',
    employee: {
      employeeId: 'EMP-100',
      email: 'Worker@Example.com',
      displayName: '홍길동',
      organizationCode: 'SEOWON',
      departmentCode: 'SITE-01'
    },
    ignoredProviderField: 'must-not-propagate'
  }));
  const replayClaims = new Set();

  const result = await verifyHrWebhook({
    providerId: 'approved-hr', rawBody, headers: signedHeaders(rawBody), secret, now,
    reserveReplayKey: async key => {
      if (replayClaims.has(key)) return false;
      replayClaims.add(key);
      return true;
    }
  });

  assert.deepEqual(result, {
    providerId: 'approved-hr',
    eventId: 'hr-event-0001',
    schemaVersion: 1,
    type: 'employee.transferred',
    occurredAt: '2026-09-03T23:59:30.000Z',
    employee: {
      employeeId: 'EMP-100',
      email: 'worker@example.com',
      displayName: '홍길동',
      organizationCode: 'SEOWON',
      departmentCode: 'SITE-01'
    }
  });
  await assert.rejects(
    verifyHrWebhook({
      providerId: 'approved-hr', rawBody, headers: signedHeaders(rawBody), secret, now,
      reserveReplayKey: async key => {
        if (replayClaims.has(key)) return false;
        replayClaims.add(key);
        return true;
      }
    }),
    error => error instanceof IntegrationContractError && error.code === 'WEBHOOK_REPLAYED'
  );
});

test('HR webhook은 변조·만료·짧은 Secret·과대 body를 fail-closed 한다', async () => {
  const rawBody = Buffer.from(JSON.stringify({ schemaVersion: 1, type: 'employee.terminated', occurredAt: now.toISOString(), employee: { employeeId: 'EMP-100' } }));
  const cases = [
    { rawBody: Buffer.from(`${rawBody} `), headers: signedHeaders(rawBody), secret, code: 'WEBHOOK_SIGNATURE_INVALID' },
    { rawBody, headers: signedHeaders(rawBody, Math.floor(now.getTime() / 1000) - 301), secret, code: 'WEBHOOK_TIMESTAMP_EXPIRED' },
    { rawBody, headers: signedHeaders(rawBody), secret: 'too-short', code: 'WEBHOOK_SECRET_INVALID' },
    { rawBody: Buffer.alloc(1024 * 1024 + 1), headers: signedHeaders(rawBody), secret, code: 'WEBHOOK_BODY_TOO_LARGE' }
  ];
  for (const item of cases) {
    await assert.rejects(
      verifyHrWebhook({ ...item, providerId: 'approved-hr', now, reserveReplayKey: async () => true }),
      error => error instanceof IntegrationContractError && error.code === item.code
    );
  }
});

test('HR 이벤트는 스키마·종류·필수 식별자·시간을 엄격히 검사한다', () => {
  const base = { schemaVersion: 1, type: 'employee.upserted', occurredAt: now.toISOString(), employee: { employeeId: 'EMP-100', displayName: '홍길동' } };
  assert.equal(normalizeHrEvent(base).employee.employeeId, 'EMP-100');
  assert.throws(() => normalizeHrEvent({ ...base, type: 'payroll.exported' }), /HR_EVENT_TYPE_UNSUPPORTED/);
  assert.throws(() => normalizeHrEvent({ ...base, employee: {} }), /HR_EMPLOYEE_ID_REQUIRED/);
  assert.throws(() => normalizeHrEvent({ ...base, occurredAt: 'not-a-date' }), /HR_OCCURRED_AT_INVALID/);
  assert.throws(() => normalizeHrEvent({ ...base, employee: { employeeId: 'EMP-100' } }), /HR_DISPLAY_NAME_REQUIRED/);
});

test('ERP outbox 봉투는 원본 payload를 해시로 결박하고 Secret·개인정보를 확장하지 않는다', () => {
  const event = {
    id: '77', type: 'REQUEST_APPROVED', aggregateType: 'REQUEST', aggregateId: '10',
    idempotencyKey: 'request-10-approved', payload: { organizationId: '1', requestId: 10, amount: 120000 }
  };
  const envelope = buildErpOutboxEnvelope(event, { source: 'sqcm-i-inventory', occurredAt: '2026-09-04T00:00:00.000Z' });
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.eventId, '77');
  assert.equal(envelope.idempotencyKey, 'request-10-approved');
  assert.equal(envelope.payloadSha256, crypto.createHash('sha256').update(canonicalJson(event.payload)).digest('hex'));
  assert.deepEqual(envelope.payload, event.payload);
  assert.equal(JSON.stringify(envelope).includes('unit-test-secret'), false);
  assert.equal(
    buildErpOutboxEnvelope({ ...event, payload: { amount: 120000, requestId: 10, organizationId: '1' } }).payloadSha256,
    envelope.payloadSha256
  );
  assert.throws(() => buildErpOutboxEnvelope({ ...event, type: 'bad event' }), /ERP_EVENT_TYPE_INVALID/);
  assert.throws(() => buildErpOutboxEnvelope({ ...event, idempotencyKey: '' }), /ERP_IDEMPOTENCY_KEY_REQUIRED/);
  assert.throws(() => buildErpOutboxEnvelope({ ...event, payload: { apiToken: 'must-not-leave' } }), /ERP_PAYLOAD_PROHIBITED_FIELD/);
});
