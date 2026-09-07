(function attachSessionBoundary(global) {
  // Signals contain no identity, credential, session ID, or application data.
  const KEY = 'sqcm-inventory-session-change';
  function create(onInvalidated) {
    let revision = 0;
    const invalidate = () => { revision++; onInvalidated(); };
    const channel = typeof global.BroadcastChannel === 'function' ? new global.BroadcastChannel(KEY) : null;
    if (channel) channel.onmessage = event => { if (event.data === 'changed') invalidate(); };
    const storageHandler = event => { if (event.key === KEY && event.newValue) invalidate(); };
    global.addEventListener?.('storage', storageHandler);
    return Object.freeze({
      version: () => revision,
      publish() {
        revision++;
        if (channel) channel.postMessage('changed');
        else { try { global.localStorage.setItem(KEY, global.crypto.randomUUID()); } catch { /* no credentials persisted */ } }
      },
      close() { channel?.close(); global.removeEventListener?.('storage', storageHandler); }
    });
  }
  global.SessionBoundary = Object.freeze({ create });
  if (typeof module !== 'undefined') module.exports = global.SessionBoundary;
})(globalThis);
