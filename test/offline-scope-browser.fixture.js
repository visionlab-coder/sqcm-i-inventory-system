(async () => {
  const checks = [];
  const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name); };
  const rejects = async fn => { try { await fn(); return false; } catch { return true; } };
  const a = { id: 1, organizationId: 1, departmentId: 1, role: 'MANAGER' };
  const b = { ...a, id: 2 };
  const c = { ...a, organizationId: 2 };
  let current = a;
  try {
    const legacy = await new Promise((resolve, reject) => {
      const r = indexedDB.open('sqcm-i-offline-stocktake', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'stocktakeId' });
      r.onsuccess = () => resolve(r.result); r.onerror = reject;
    });
    await new Promise((resolve, reject) => {
      const t = legacy.transaction('snapshots', 'readwrite');
      t.objectStore('snapshots').put({ stocktakeId: '1', data: 'legacy-unowned' });
      t.oncomplete = resolve; t.onerror = reject;
    });
    legacy.close();
    const sa = OfflineStocktake.forUser(a, () => current);
    check('legacy not adopted', !(await sa.loadSnapshot(1)));
    await sa.saveSnapshot(1, { marker: 'synthetic-A' });
    await sa.queueOperation(1, { operationId: 'same-id', assetId: 1, result: 'MATCH' });
    current = b;
    check('old handle rejected', await rejects(() => sa.loadSnapshot(1)));
    const sb = OfflineStocktake.forUser(b, () => current);
    check('other user snapshot hidden', !(await sb.loadSnapshot(1)));
    check('other user queue hidden', (await sb.listOperations(1)).length === 0);
    await sb.saveSnapshot(1, { marker: 'synthetic-B' });
    await sb.queueOperation(1, { operationId: 'same-id', assetId: 1, result: 'DAMAGED' });
    await sb.removeOperations(['same-id']);
    current = c;
    const sc = OfflineStocktake.forUser(c, () => current);
    check('other organization hidden', !(await sc.loadSnapshot(1)) && (await sc.listOperations(1)).length === 0);
    current = a;
    check('owner snapshot preserved', (await sa.loadSnapshot(1)).data.marker === 'synthetic-A');
    check('owner pending write preserved', (await sa.listOperations(1))[0].result === 'MATCH');
    await sa.markConflict('same-id', { code: 'VERSION_CONFLICT' });
    check('owner conflict works', (await sa.listOperations(1))[0].syncStatus === 'CONFLICT');
    current = null;
    check('logout blocks read', await rejects(() => sa.loadSnapshot(1)));
    check('logout blocks write', await rejects(() => sa.queueOperation(1, { operationId: 'x' })));
    current = { ...a, role: 'USER' };
    check('role downgrade blocks access', await rejects(() => sa.listOperations(1)));
    current = a;
    const pending = sa.loadSnapshot(1);
    current = b;
    check('account switch during read rejected', await rejects(() => pending));
    const legacyCheck = await new Promise((resolve, reject) => {
      const r = indexedDB.open('sqcm-i-offline-stocktake', 1);
      r.onsuccess = () => {
        const db = r.result;
        const get = db.transaction('snapshots').objectStore('snapshots').get('1');
        get.onsuccess = () => { resolve(get.result.data); db.close(); }; get.onerror = reject;
      }; r.onerror = reject;
    });
    check('legacy data preserved', legacyCheck === 'legacy-unowned');
    document.querySelector('#result').textContent = JSON.stringify({ status: 'PASS', checks });
  } catch (error) {
    document.querySelector('#result').textContent = JSON.stringify({ status: 'FAIL', checks, error: error.message });
  }
})();
