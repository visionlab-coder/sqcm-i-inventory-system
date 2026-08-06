const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DomainError,
  createItem,
  updateItem,
  deactivateItem,
  checkoutItem,
  returnItem
} = require('../../src/services/inventory-service');

function scriptedPool(handler) {
  const calls = [];
  const state = { released: false };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return handler(sql, params, calls);
    },
    release() { state.released = true; }
  };
  return { pool: { connect: async () => client }, calls, state };
}

const hasSql = (calls, pattern) => calls.some(call => pattern.test(call.sql));

test('createItem은 입력을 정규화하고 감사 로그와 함께 커밋한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/INSERT INTO items/.test(sql)) return { rows: [{ id: 7, code: 'EQ-900', name: '시험 장비', location: 'A 창고' }] };
    return { rows: [], rowCount: 0 };
  });

  const item = await createItem(fixture.pool, 3, {
    code: ' eq-900 ', name: ' 시험 장비 ', category: ' 측정 장비 ', location: ' A 창고 ', totalQuantity: '5', minQuantity: '1'
  });

  assert.equal(item.code, 'EQ-900');
  const insert = fixture.calls.find(call => /INSERT INTO items/.test(call.sql));
  assert.deepEqual(insert.params, ['EQ-900', '시험 장비', '측정 장비', 5, 1, 'A 창고']);
  assert.equal(hasSql(fixture.calls, /INSERT INTO audit_logs/), true);
  assert.equal(hasSql(fixture.calls, /^COMMIT$/), true);
  assert.equal(fixture.state.released, true);
});

test('createItem은 중복 코드 오류를 409 DomainError로 변환하고 롤백한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/INSERT INTO items/.test(sql)) throw Object.assign(new Error('duplicate'), { code: '23505' });
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(
    createItem(fixture.pool, 3, { code: 'EQ-900', name: '시험 장비', category: '측정 장비', totalQuantity: 5, minQuantity: 1 }),
    error => error instanceof DomainError && error.status === 409
  );
  assert.equal(hasSql(fixture.calls, /^ROLLBACK$/), true);
  assert.equal(fixture.state.released, true);
});

test('updateItem은 가용 제외 수량을 보존하고 수정 전후를 감사한다', async () => {
  const current = { id: 7, code: 'EQ-900', name: '기존 장비', category: '측정', total_quantity: 10, available_quantity: 6, min_quantity: 1, location: 'A' };
  const fixture = scriptedPool(async (sql, params) => {
    if (/SELECT \* FROM items/.test(sql)) return { rows: [current], rowCount: 1 };
    if (/UPDATE items SET name=/.test(sql)) return { rows: [{ ...current, name: params[0], total_quantity: params[2], available_quantity: params[3] }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const item = await updateItem(fixture.pool, 3, 7, { name: '변경 장비', category: '현장 장비', totalQuantity: 12, minQuantity: 2, location: 'B' });

  assert.equal(item.available_quantity, 8);
  const update = fixture.calls.find(call => /UPDATE items SET name=/.test(call.sql));
  assert.deepEqual(update.params, ['변경 장비', '현장 장비', 12, 8, 2, 'B', 7]);
  const audit = fixture.calls.find(call => /INSERT INTO audit_logs/.test(call.sql));
  const metadata = JSON.parse(audit.params[4]);
  assert.equal(metadata.before.name, '기존 장비');
  assert.equal(metadata.after.name, '변경 장비');
  assert.equal(hasSql(fixture.calls, /^COMMIT$/), true);
});

test('updateItem은 가용 제외 수량보다 작은 총수량을 409로 거부한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT \* FROM items/.test(sql)) return { rows: [{ id: 7, total_quantity: 10, available_quantity: 6 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(
    updateItem(fixture.pool, 3, 7, { name: '시험 장비', category: '측정 장비', totalQuantity: 3, minQuantity: 1 }),
    error => error instanceof DomainError && error.status === 409
  );
  assert.equal(hasSql(fixture.calls, /UPDATE items SET name=/), false);
  assert.equal(hasSql(fixture.calls, /^ROLLBACK$/), true);
});

test('deactivateItem은 활성 대여가 있으면 롤백한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT \* FROM items/.test(sql)) return { rows: [{ id: 7, code: 'EQ-900' }], rowCount: 1 };
    if (/SELECT count\(\*\)/.test(sql)) return { rows: [{ count: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(deactivateItem(fixture.pool, 3, 7), error => error instanceof DomainError && error.status === 409);
  assert.equal(hasSql(fixture.calls, /status='INACTIVE'/), false);
  assert.equal(hasSql(fixture.calls, /^ROLLBACK$/), true);
});

test('deactivateItem은 활성 대여가 없으면 비활성화하고 감사 로그를 남긴다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT \* FROM items/.test(sql)) return { rows: [{ id: 7, code: 'EQ-900' }], rowCount: 1 };
    if (/SELECT count\(\*\)/.test(sql)) return { rows: [{ count: 0 }], rowCount: 1 };
    if (/status='INACTIVE'/.test(sql)) return { rows: [{ id: 7, code: 'EQ-900', status: 'INACTIVE' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  const item = await deactivateItem(fixture.pool, 3, 7);
  assert.equal(item.status, 'INACTIVE');
  const audit = fixture.calls.find(call => /INSERT INTO audit_logs/.test(call.sql));
  assert.equal(audit.params[1], 'ITEM_DEACTIVATED');
  assert.equal(hasSql(fixture.calls, /^COMMIT$/), true);
});

test('checkoutItem은 가용 재고를 초과하면 대여를 생성하지 않고 롤백한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT id FROM users/.test(sql)) return { rows: [{ id: 9 }], rowCount: 1 };
    if (/SELECT \* FROM items/.test(sql)) return { rows: [{ id: 7, available_quantity: 2 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(
    checkoutItem(fixture.pool, 3, { itemId: 7, borrowerEmail: 'user@seowon.local', quantity: 3, dueAt: new Date(Date.now() + 60_000).toISOString() }),
    error => error instanceof DomainError && error.status === 409
  );
  assert.equal(hasSql(fixture.calls, /INSERT INTO loans/), false);
  assert.equal(hasSql(fixture.calls, /^ROLLBACK$/), true);
});

test('returnItem은 중복 반납을 409로 거부한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT \* FROM loans/.test(sql)) return { rows: [{ id: 12, returned_at: new Date(), quantity: 1, item_id: 7 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  await assert.rejects(returnItem(fixture.pool, 3, 12), error => error instanceof DomainError && error.status === 409);
  assert.equal(hasSql(fixture.calls, /UPDATE loans SET returned_at/), false);
  assert.equal(hasSql(fixture.calls, /^ROLLBACK$/), true);
});

test('returnItem은 분실 반납 시 재고를 복원하지 않고 감사 후 커밋한다', async () => {
  const fixture = scriptedPool(async sql => {
    if (/SELECT \* FROM loans/.test(sql)) return { rows: [{ id: 12, returned_at: null, quantity: 2, item_id: 7 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

  await returnItem(fixture.pool, 3, 12, { condition: 'LOST', note: '분실 확인' });
  assert.equal(hasSql(fixture.calls, /available_quantity = available_quantity \+/), false);
  const audit = fixture.calls.find(call => /INSERT INTO audit_logs/.test(call.sql));
  assert.deepEqual(JSON.parse(audit.params[4]), { condition: 'LOST', restored: 0 });
  assert.equal(hasSql(fixture.calls, /^COMMIT$/), true);
});
