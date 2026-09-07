const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/app.js', 'utf8');
const detail = source.slice(source.indexOf('async function renderStocktakeDetail('), source.indexOf('async function renderRepairs('));
const requestSource = source.slice(source.indexOf('async function request('), source.indexOf('async function uploadBinary('));

function harness({ requestError, saveError } = {}) {
  const calls = { load: 0, save: 0, queued: 0 };
  const handlers = {};
  const button = { dataset: { asset: '1', version: '0' }, addEventListener: (_event, handler) => { handlers.save = handler; } };
  const data = { stocktake: { name: 'Synthetic audit' }, items: [] };
  const element = { innerHTML: '', addEventListener() {} };
  const context = vm.createContext({
    sessionBoundary: undefined, sessionChanges: new Set(),
    state: { user: { id: 1, role: 'MANAGER' } }, isManager: () => true,
    request: async () => { if (requestError) throw requestError; return data; },
    OfflineStocktake: {
      forUser(user, currentUser) {
        const id = user?.id;
        return { ...this, assertActive() { if (!id || currentUser()?.id !== id) throw new Error('scope changed'); } };
      },
      saveSnapshot: async () => { calls.save++; if (saveError) throw saveError; },
      loadSnapshot: async () => { calls.load++; return { data, savedAt: '2026-09-07' }; },
      listOperations: async () => [],
      queueOperation: async () => { calls.queued++; }
    },
    $: () => element, document: { querySelectorAll: selector => selector === '.stock-save' ? [button] : [], querySelector: () => ({ value: 'MATCH' }) },
    navigator: { onLine: false }, showMessage() {}, newIdempotencyKey: () => 'synthetic-operation',
    escapeHtml: String, date: String
  });
  vm.runInContext(detail, context);
  return { calls, context, handlers, run: () => context.renderStocktakeDetail('1') };
}

for (const code of ['UNAUTHORIZED', 'FORBIDDEN', 'PASSWORD_CHANGE_REQUIRED', 'SERVER_ERROR']) {
  test(`stocktake does not read cached data after ${code}`, async () => {
    const error = Object.assign(new Error(code), { code });
    const h = harness({ requestError: error });
    await assert.rejects(h.run, e => e === error);
    assert.equal(h.calls.load, 0);
  });
}
test('only classified network loss permits stocktake fallback', async () => {
  const h = harness({ requestError: Object.assign(new Error('network'), { code: 'NETWORK_UNAVAILABLE' }) });
  await h.run();
  assert.equal(h.calls.load, 1);
});
test('successful server read survives local snapshot storage failure', async () => {
  const h = harness({ saveError: new Error('quota exceeded') });
  await h.run();
  assert.equal(h.calls.load, 0);
});
test('logged-out session cannot read offline snapshot', async () => {
  const h = harness({ requestError: Object.assign(new Error('network'), { code: 'NETWORK_UNAVAILABLE' }) });
  h.context.state.user = null;
  await assert.rejects(h.run);
  assert.equal(h.calls.load, 0);
});
test('request classifies fetch rejection but not response parser failures', async () => {
  const context = vm.createContext({
    sessionBoundary: undefined, sessionChanges: new Set(),
    mutatingMethods: new Set(), inFlightWrites: new Map(), state: {},
    fetch: async () => { throw new TypeError('network failure'); },
    responseData: async () => { throw new TypeError('parser defect'); }
  });
  vm.runInContext(requestSource, context);
  await assert.rejects(() => context.request('/synthetic'), e => e.code === 'NETWORK_UNAVAILABLE');
  context.fetch = async () => ({ status: 200 });
  await assert.rejects(() => context.request('/synthetic'), e => e.code !== 'NETWORK_UNAVAILABLE');
});

test('offline navigator flag never queues a server-denied write', async () => {
  const h = harness();
  await h.run();
  h.context.request = async () => { throw Object.assign(new Error('denied'), { code: 'FORBIDDEN' }); };
  await h.handlers.save();
  assert.equal(h.calls.queued, 0);
});

test('classified transport loss queues a write even if navigator reports online', async () => {
  const h = harness();
  await h.run();
  h.context.navigator.onLine = true;
  h.context.request = async () => { throw Object.assign(new Error('network'), { code: 'NETWORK_UNAVAILABLE' }); };
  await h.handlers.save();
  assert.equal(h.calls.queued, 1);
});
