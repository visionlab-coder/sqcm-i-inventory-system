const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('frontend/session-boundary.js', 'utf8');

test('session signals invalidate peers without publishing identity or causing loops', () => {
  const channels = [];
  class Channel {
    constructor() { channels.push(this); }
    postMessage(data) { assert.equal(data, 'changed'); for (const c of channels) if (c !== this) c.onmessage?.({ data }); }
    close() {}
  }
  const context = vm.createContext({ BroadcastChannel: Channel });
  vm.runInContext(source, context);
  let calls = 0;
  const a = context.SessionBoundary.create(() => { throw new Error('own signal'); });
  const b = context.SessionBoundary.create(() => calls++);
  a.publish();
  assert.equal(a.version(), 1); assert.equal(b.version(), 1); assert.equal(calls, 1);
});

test('storage fallback publishes opaque nonce and ignores unrelated changes', () => {
  let listener; let stored; let calls = 0;
  const context = vm.createContext({
    addEventListener: (_event, fn) => { listener = fn; }, removeEventListener() {},
    localStorage: { setItem: (key, value) => { stored = { key, value }; } },
    crypto: { randomUUID: () => 'synthetic-nonce' }
  });
  vm.runInContext(source, context);
  const boundary = context.SessionBoundary.create(() => calls++);
  boundary.publish();
  assert.equal(stored.value, 'synthetic-nonce');
  listener({ key: 'other', newValue: 'x' }); assert.equal(calls, 0);
  listener({ key: stored.key, newValue: 'next' }); assert.equal(calls, 1);
});

test('request rejects responses from a prior session revision', async () => {
  const app = fs.readFileSync('frontend/app.js', 'utf8');
  const requestSource = app.slice(app.indexOf('async function request('), app.indexOf('async function uploadBinary('));
  let version = 0;
  const context = vm.createContext({
    sessionBoundary: { version: () => version }, sessionChanges: new Set(),
    mutatingMethods: new Set(), inFlightWrites: new Map(), state: {},
    fetch: async () => { version++; return { status: 200 }; },
    responseData: () => { throw new Error('stale response consumed'); }
  });
  vm.runInContext(requestSource, context);
  await assert.rejects(() => context.request('/synthetic'), e => e.code === 'SESSION_CHANGED');
});
