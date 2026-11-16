// db.js - Offline-First IndexedDB Persistence & JSON Backup Engine for Steady Signal
const DB_NAME = "steady_signal_offline_db";
const DB_VERSION = 1;

const STORES = {
  KV: "kv",
  WATCHLIST: "watchlist",
  SIGNALS: "trade_signals",
  BTG: "btg_positions",
  MONITORS: "scheduled_monitors",
  CHAT: "chat_messages",
  QUEUE: "offline_queue",
};

let dbPromise = null;

export function openLocalDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.KV)) {
        db.createObjectStore(STORES.KV, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.WATCHLIST)) {
        db.createObjectStore(STORES.WATCHLIST, { keyPath: "symbol" });
      }
      if (!db.objectStoreNames.contains(STORES.SIGNALS)) {
        db.createObjectStore(STORES.SIGNALS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.BTG)) {
        db.createObjectStore(STORES.BTG, { keyPath: "symbol" });
      }
      if (!db.objectStoreNames.contains(STORES.MONITORS)) {
        db.createObjectStore(STORES.MONITORS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.CHAT)) {
        db.createObjectStore(STORES.CHAT, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        db.createObjectStore(STORES.QUEUE, { keyPath: "qid", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export async function idbSetKV(key, value) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.KV, "readwrite");
    tx.objectStore(STORES.KV).put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetKV(key, fallback = null) {
  const db = await openLocalDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.KV, "readonly");
    const req = tx.objectStore(STORES.KV).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => resolve(fallback);
  });
}

export async function idbReplaceAll(storeName, items = []) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      if (item) store.put(item);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPutItem(storeName, item) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDeleteItem(storeName, key) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAll(storeName) {
  const db = await openLocalDB();
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function enqueueOfflineAction(action) {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, "readwrite");
    tx.objectStore(STORES.QUEUE).add({ ...action, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushOfflineQueue(processorFn) {
  const queue = await idbGetAll(STORES.QUEUE);
  if (queue.length === 0) return 0;
  let processed = 0;
  for (const item of queue) {
    try {
      await processorFn(item);
      await idbDeleteItem(STORES.QUEUE, item.qid);
      processed++;
    } catch {
      // Keep in queue for next online retry
    }
  }
  return processed;
}

export async function exportDatabaseBackupJSON() {
  const [
    watchlist,
    trade_signals,
    btg_positions,
    scheduled_monitors,
    chat_messages,
    portfolioState,
    uiConfig,
    marketCatalog,
  ] = await Promise.all([
    idbGetAll(STORES.WATCHLIST),
    idbGetAll(STORES.SIGNALS),
    idbGetAll(STORES.BTG),
    idbGetAll(STORES.MONITORS),
    idbGetAll(STORES.CHAT),
    idbGetKV("portfolioState"),
    idbGetKV("uiConfig"),
    idbGetKV("marketCatalog"),
  ]);

  return {
    app: "Steady Signal",
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      watchlist,
      trade_signals,
      btg_positions,
      scheduled_monitors,
      chat_messages,
      portfolioState,
      uiConfig,
      marketCatalog,
    },
  };
}

export async function importDatabaseBackupJSON(backupObj) {
  if (!backupObj || !backupObj.data) {
    throw new Error("Archivo de respaldo JSON inválido.");
  }
  const d = backupObj.data;
  if (Array.isArray(d.watchlist)) await idbReplaceAll(STORES.WATCHLIST, d.watchlist);
  if (Array.isArray(d.trade_signals)) await idbReplaceAll(STORES.SIGNALS, d.trade_signals);
  if (Array.isArray(d.btg_positions)) await idbReplaceAll(STORES.BTG, d.btg_positions);
  if (Array.isArray(d.scheduled_monitors)) await idbReplaceAll(STORES.MONITORS, d.scheduled_monitors);
  if (Array.isArray(d.chat_messages)) await idbReplaceAll(STORES.CHAT, d.chat_messages);
  if (d.portfolioState) await idbSetKV("portfolioState", d.portfolioState);
  if (d.uiConfig) await idbSetKV("uiConfig", d.uiConfig);
  if (d.marketCatalog) await idbSetKV("marketCatalog", d.marketCatalog);
  await idbSetKV("lastSyncAt", new Date().toISOString());
  return true;
}

export { STORES };
