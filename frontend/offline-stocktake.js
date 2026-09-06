(function attachOfflineStocktake(global) {
  function scopeKey(user) {
    if (!user || user.passwordResetRequired || !['ADMIN', 'MANAGER'].includes(user.role)
        || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0
        || !Number.isSafeInteger(Number(user.organizationId)) || Number(user.organizationId) <= 0) {
      throw new Error('오프라인 조사에는 인증된 조직 담당자가 필요합니다.');
    }
    const department = user.departmentId == null ? 0 : Number(user.departmentId);
    if (!Number.isSafeInteger(department) || department < 0) throw new Error('부서 범위를 확인할 수 없습니다.');
    return `${Number(user.organizationId)}-${Number(user.id)}-${department}-${user.role}`;
  }

  function forUser(user, currentUser) {
  const key = scopeKey(user);
  if (typeof currentUser !== 'function') throw new Error('현재 계정 확인 함수가 필요합니다.');
  // Never adopt the legacy unowned database: retain it untouched for supervised recovery.
  const DB_NAME = `sqcm-i-offline-stocktake-scoped-${key}`;
  function assertActive() {
    if (scopeKey(currentUser()) !== key) throw new Error('계정 또는 권한 범위가 변경되었습니다. 다시 열어 주세요.');
  }
  const DB_VERSION = 1;
  const SNAPSHOTS = 'snapshots';
  const OPERATIONS = 'operations';

  function openDatabase() {
    assertActive();
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

  const methods = { saveSnapshot, loadSnapshot, listOperations, queueOperation, removeOperations, markConflict };
  return Object.freeze({ assertActive, ...Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async (...args) => {
    assertActive();
    const value = await method(...args);
    assertActive();
    return value;
  }])) });
  }

  const api = Object.freeze({ forUser });
  global.OfflineStocktake = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
