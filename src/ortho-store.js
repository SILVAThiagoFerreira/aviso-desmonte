const DB_NAME = 'aviso-desmonte-ortomosaicos';
const STORE_NAME = 'overrides';

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOrthoOverride(id, blob, metadata = {}) {
  const db = await openStore();
  await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ id, blob, ...metadata, importedAt: new Date().toISOString() }); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  db.close();
}

export async function getOrthoOverride(id) {
  const db = await openStore();
  const value = await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); });
  db.close();
  return value;
}

export async function listOrthoOverrides() {
  const db = await openStore();
  const values = await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error); });
  db.close();
  return values.map(({ id, fileName, importedAt }) => ({ id, fileName, importedAt }));
}

export async function removeOrthoOverride(id) {
  const db = await openStore();
  await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  db.close();
}
