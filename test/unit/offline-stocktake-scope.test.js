const test = require('node:test');
const assert = require('node:assert/strict');
const { forUser } = require('../../frontend/offline-stocktake');
const user = { id: 7, organizationId: 3, departmentId: 2, role: 'MANAGER' };

test('offline scope requires a valid authenticated manager and live identity getter', () => {
  for (const invalid of [null, {}, { ...user, id: 0 }, { ...user, organizationId: null },
    { ...user, role: 'USER' }, { ...user, passwordResetRequired: true }, { ...user, departmentId: 'x' }]) {
    assert.throws(() => forUser(invalid, () => invalid));
  }
  assert.throws(() => forUser(user));
});

test('bound storage rejects logout, account, organization, department and role changes before opening IndexedDB', async () => {
  let current = user;
  const store = forUser(user, () => current);
  store.assertActive();
  for (const next of [null, { ...user, id: 8 }, { ...user, organizationId: 4 },
    { ...user, departmentId: 9 }, { ...user, role: 'ADMIN' }, { ...user, passwordResetRequired: true }]) {
    current = next;
    assert.throws(store.assertActive);
    await assert.rejects(() => store.loadSnapshot(1));
    await assert.rejects(() => store.queueOperation(1, {}));
    await assert.rejects(() => store.removeOperations(['synthetic']));
  }
  current = { ...user };
  store.assertActive();
});
