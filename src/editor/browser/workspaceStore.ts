import { ManagedAsset } from "../types";

const DB_NAME = "realmz-providence-browser-workspace";
const DB_VERSION = 1;
const WORKSPACE_STORE = "workspace";
const CUSTOM_ASSETS_KEY = "customAssets";

export async function loadBrowserCustomAssets(): Promise<ManagedAsset[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openWorkspaceDb();
  const assets = await getValue<ManagedAsset[]>(db, CUSTOM_ASSETS_KEY);
  db.close();
  return Array.isArray(assets) ? assets : [];
}

export async function saveBrowserCustomAssets(assets: ManagedAsset[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openWorkspaceDb();
  await putValue(db, CUSTOM_ASSETS_KEY, assets);
  db.close();
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser workspace storage."));
    request.onblocked = () => reject(new Error("Browser workspace storage is blocked by another Providence tab."));
  });
}

function getValue<T>(db: IDBDatabase, key: string) {
  return requestPromise<T | undefined>(
    db.transaction(WORKSPACE_STORE, "readonly").objectStore(WORKSPACE_STORE).get(key)
  );
}

function putValue<T>(db: IDBDatabase, key: string, value: T) {
  return requestPromise<void>(
    db.transaction(WORKSPACE_STORE, "readwrite").objectStore(WORKSPACE_STORE).put(value, key)
  );
}

function requestPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("Browser workspace storage request failed."));
  });
}
