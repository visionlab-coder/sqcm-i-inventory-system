(function attachOfflineStocktake(global) {
  const DB_NAME = 'sqcm-i-offline-stocktake';
  const DB_VERSION = 1;
  const SNAPSHOTS = 'snapshots';
  const OPERATIONS = 'operations';

  function openDatabase() {
    if (!global.indexedDB) return Promise.reject(new Error('이 브라우저는 오프라인 저장소를 지원하지 않습니다.'));
    return new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'stocktakeId' });
        if (!db.objectStoreNames.contains(OPERATIONS)) {
          const store = db.createObjectStore(OPERATIONS, { keyPath: 'operationId' });
          store.createIndex('stocktakeId', 'stocktakeId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('오프라인 저장소를 열지 못했습니다.'));
    });
  }

  async function transact(storeName, mode, operation) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let value;
        try { value = operation(store); } catch (error) { reject(error); return; }
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error || new Error('오프라인 저장 작업이 실패했습니다.'));
        transaction.onabort = () => reject(transaction.error || new Error('오프라인 저장 작업이 취소되었습니다.'));
      });
    } finally { db.close(); }
  }

  const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function saveSnapshot(stocktakeId, data) {
    const record = { stocktakeId: String(stocktakeId), data, savedAt: new Date().toISOString() };
    await transact(SNAPSHOTS, 'readwrite', store => store.put(record));
    return record;
  }

  async function loadSnapshot(stocktakeId) {
    const db = await openDatabase();
    try {
      return await requestValue(db.transaction(SNAPSHOTS, 'readonly').objectStore(SNAPSHOTS).get(String(stocktakeId)));
    } finally { db.close(); }
  }

  async function listOperations(stocktakeId) {
    const db = await openDatabase();
    try {
      const store = db.transaction(OPERATIONS, 'readonly').objectStore(OPERATIONS);
      return await requestValue(store.index('stocktakeId').getAll(String(stocktakeId)));
    } finally { db.close(); }
  }

  async function queueOperation(stocktakeId, operation) {
    const existing = await listOperations(stocktakeId);
    await transact(OPERATIONS, 'readwrite', store => {
      existing.filter(item => Number(item.assetId) === Number(operation.assetId)).forEach(item => store.delete(item.operationId));
      store.put({ ...operation, stocktakeId: String(stocktakeId), queuedAt: new Date().toISOString(), syncStatus: 'QUEUED' });
    });
  }

  async function removeOperations(operationIds) {
    if (!operationIds.length) return;
    await transact(OPERATIONS, 'readwrite', store => operationIds.forEach(id => store.delete(id)));
  }

  async function markConflict(operationId, conflict) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(OPERATIONS, 'readwrite');
        const store = transaction.objectStore(OPERATIONS);
        const request = store.get(operationId);
        request.onsuccess = () => { if (request.result) store.put({ ...request.result, syncStatus: 'CONFLICT', conflict }); };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }

  const api = { saveSnapshot, loadSnapshot, listOperations, queueOperation, removeOperations, markConflict };
  global.OfflineStocktake = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
