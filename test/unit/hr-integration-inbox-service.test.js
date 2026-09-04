const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HrInboxError,
  claimNextHrInboxEvent,
  completeHrInboxEvent,
  recordHrInboxEvent,
  retryDelaySeconds
} = require('../../src/services/hr-integration-inbox-service');

function event() {
  return {
    providerId: 'approved-hr', eventId: 'hr-event-0001', schemaVersion: 1,
    type: 'employee.transferred', occurredAt: '2026-09-04T00:00:00.000Z',
    employee: { employeeId: 'EMP-100', email: 'worker@example.com', displayName: '홍길동', organizationCode: 'SEOWON', departmentCode: 'SITE-01' }
  };
}

function recordingPool(handler) {
  const calls = [];
  const client = {
    async query(sql, params = []) { calls.push({ sql, params }); return handler(sql, params, calls); },
    release() { calls.push({ sql: 'RELEASE', params: [] }); }
  };
  return { calls, async connect() { return client; }, async query(sql, params = []) { calls.push({ sql, params }); return handler(sql, params, calls); } };
}

test('검증된 HR 이벤트는 최소 payload와 감사 로그를 한 트랜잭션으로 기록한다', async () => {
  const pool = recordingPool(async sql => {
    if (sql.includes('INSERT INTO hr_integration_inbox')) return { rowCount: 1, rows: [{ id: 41, status: 'RECEIVED', payload_sha256: 'a'.repeat(64) }] };
    return { rowCount: 1, rows: [] };
  });
  const result = await recordHrInboxEvent(pool, { organizationId: 1, event: event(), trace: { requestId: 'req-1', ip: '127.0.0.1' } });
  assert.equal(result.status, 'recorded');
  const insert = pool.calls.find(call => call.sql.includes('INSERT INTO hr_integration_inbox'));
  const payload = JSON.parse(insert.params[6]);
  assert.deepEqual(Object.keys(payload).sort(), ['employee', 'occurredAt', 'schemaVersion', 'type']);
  assert.equal('providerId' in payload, false);
  assert.equal(pool.calls.some(call => call.sql === 'BEGIN'), true);
  assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO audit_logs') && call.params[0] === 'HR_EVENT_RECEIVED'), true);
  assert.equal(pool.calls.some(call => call.sql === 'COMMIT'), true);
});

test('같은 event ID와 같은 hash는 duplicate, 다른 hash는 감사 후 conflict다', async () => {
  let existingHash;
  const pool = recordingPool(async (sql, params) => {
    if (sql.includes('INSERT INTO hr_integration_inbox')) { existingHash = params[7]; return { rowCount: 0, rows: [] }; }
    if (sql.includes('SELECT id,status,payload_sha256')) return { rowCount: 1, rows: [{ id: 41, status: 'RECEIVED', payload_sha256: existingHash }] };
    return { rowCount: 1, rows: [] };
  });
  assert.equal((await recordHrInboxEvent(pool, { organizationId: 1, event: event() })).status, 'duplicate');

  const conflictPool = recordingPool(async (sql) => {
    if (sql.includes('INSERT INTO hr_integration_inbox')) return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT id,status,payload_sha256')) return { rowCount: 1, rows: [{ id: 41, status: 'RECEIVED', payload_sha256: 'f'.repeat(64) }] };
    return { rowCount: 1, rows: [] };
  });
  await assert.rejects(
    recordHrInboxEvent(conflictPool, { organizationId: 1, event: event() }),
    error => error instanceof HrInboxError && error.code === 'HR_EVENT_ID_CONFLICT'
  );
  assert.equal(conflictPool.calls.some(call => call.sql.includes('INSERT INTO audit_logs') && call.params[0] === 'HR_EVENT_CONFLICT'), true);
  assert.equal(conflictPool.calls.some(call => call.sql === 'COMMIT'), true);
});

test('claim은 SKIP LOCKED로 한 건만 PROCESSING 처리한다', async () => {
  const pool = recordingPool(async sql => {
    if (sql.includes('FOR UPDATE SKIP LOCKED')) return { rowCount: 1, rows: [{ id: 41, status: 'RECEIVED', attempt_count: 0 }] };
    if (sql.includes("SET status='PROCESSING'")) return { rowCount: 1, rows: [{ id: 41, status: 'PROCESSING', attempt_count: 1 }] };
    return { rowCount: 1, rows: [] };
  });
  const claimed = await claimNextHrInboxEvent(pool, 'worker-1');
  assert.equal(claimed.status, 'PROCESSING');
  assert.equal(claimed.attempt_count, 1);
  assert.equal(pool.calls.some(call => call.sql.includes('FOR UPDATE SKIP LOCKED')), true);
  assert.equal(pool.calls.some(call => call.sql.includes("status='PROCESSING'") && call.sql.includes("interval '5 minutes'")), true);
});

test('완료·거부·실패 상태는 lock 소유자와 허용 전이만 반영한다', async () => {
  for (const outcome of ['APPLIED', 'REJECTED', 'RETRY']) {
    const pool = recordingPool(async sql => {
      if (sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [{ id: 41, organization_id: 1, status: 'PROCESSING', attempt_count: outcome === 'RETRY' ? 2 : 1 }] };
      if (sql.includes('UPDATE hr_integration_inbox')) return { rowCount: 1, rows: [{ id: 41, status: outcome === 'RETRY' ? 'RETRY_PENDING' : outcome }] };
      return { rowCount: 1, rows: [] };
    });
    const result = await completeHrInboxEvent(pool, { id: 41, workerId: 'worker-1', outcome, error: outcome === 'APPLIED' ? null : new Error('provider-safe-error') });
    assert.equal(result.status, outcome === 'RETRY' ? 'RETRY_PENDING' : outcome);
    assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO audit_logs')), true);
  }
  assert.equal(retryDelaySeconds(1), 2);
  assert.equal(retryDelaySeconds(20), 3600);
  await assert.rejects(completeHrInboxEvent(recordingPool(async () => ({ rowCount: 0, rows: [] })), { id: 41, workerId: 'worker-1', outcome: 'APPLIED' }), /HR_EVENT_LOCK_NOT_OWNED/);
});

test('열 번째 실패는 재시도하지 않고 DEAD_LETTER로 격리한다', async () => {
  const pool = recordingPool(async sql => {
    if (sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [{ id: 41, organization_id: 1, status: 'PROCESSING', attempt_count: 10 }] };
    if (sql.includes('UPDATE hr_integration_inbox')) return { rowCount: 1, rows: [{ id: 41, status: 'DEAD_LETTER', attempt_count: 10 }] };
    return { rowCount: 1, rows: [] };
  });
  const result = await completeHrInboxEvent(pool, { id: 41, workerId: 'worker-1', outcome: 'RETRY', error: { code: 'HR_MAPPING_NOT_FOUND' } });
  assert.equal(result.status, 'DEAD_LETTER');
  assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO audit_logs') && call.params[0] === 'HR_EVENT_DEAD_LETTERED'), true);
});
