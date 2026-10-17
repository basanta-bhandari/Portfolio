const DB_NAME = 'roomquest-local';
const DB_VERSION = 1;

let dbPromise;
function openRoomDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('journals')) db.createObjectStore('journals', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('coffee')) {
        const store = db.createObjectStore('coffee', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('problems')) db.createObjectStore('problems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('problemSessions')) {
        const store = db.createObjectStore('problemSessions', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function roomStore(name, mode, action) {
  const db = await openRoomDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let request;
    try { request = action(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(request && request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const roomDB = {
  put: (store, value) => roomStore(store, 'readwrite', objectStore => objectStore.put(value)),
  get: (store, key) => roomStore(store, 'readonly', objectStore => objectStore.get(key)),
  getAll: store => roomStore(store, 'readonly', objectStore => objectStore.getAll()),
  delete: (store, key) => roomStore(store, 'readwrite', objectStore => objectStore.delete(key)),
  clear: store => roomStore(store, 'readwrite', objectStore => objectStore.clear()),
  async replaceAll(store, values) {
    const db = await openRoomDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      values.forEach(value => objectStore.put(value));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  async setting(key, fallback = null) {
    const row = await this.get('settings', key);
    return row ? row.value : fallback;
  },
  setSetting: (key, value) => roomDB.put('settings', { key, value })
};

window.roomDB = roomDB;
