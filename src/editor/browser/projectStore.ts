import { Project } from "../types";
import { normalizeBrowserProject } from "./project";

const DB_NAME = "realmz-providence-browser-projects";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const ACTIVE_PROJECT_KEY = "realmz-providence.activeBrowserProject";

export type BrowserProjectSnapshot = {
  key: string;
  name: string;
  savedAt: string;
  project: Project;
};

export function browserProjectKey(project: Project) {
  if (project.scenario.projectPath?.startsWith("browser://")) return project.scenario.projectPath;
  return `browser://${safeBrowserProjectName(project.scenario.name || "Untitled Scenario")}.providence`;
}

export async function saveBrowserProject(project: Project) {
  const key = browserProjectKey(project);
  const storedProject =
    project.scenario.projectPath === key
      ? project
      : {
          ...project,
          scenario: {
            ...project.scenario,
            projectPath: key
          }
        };
  const snapshot: BrowserProjectSnapshot = {
    key,
    name: storedProject.scenario.name || "Untitled Scenario",
    savedAt: new Date().toISOString(),
    project: storedProject
  };
  const db = await openProjectDb();
  await putSnapshot(db, snapshot);
  rememberActiveProject(key);
  db.close();
  return snapshot;
}

export async function loadActiveBrowserProject() {
  const key = activeProjectKey();
  if (!key) return null;
  const db = await openProjectDb();
  const snapshot = await getSnapshot(db, key);
  db.close();
  return snapshot
    ? {
        ...snapshot,
        project: normalizeBrowserProject(snapshot.project)
      }
    : null;
}

function activeProjectKey() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

function rememberActiveProject(key: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_PROJECT_KEY, key);
}

function safeBrowserProjectName(name: string) {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return safeName || "Untitled Scenario";
}

function openProjectDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("This browser does not expose IndexedDB project storage.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser project storage."));
    request.onblocked = () => reject(new Error("Browser project storage is blocked by another Providence tab."));
  });
}

function putSnapshot(db: IDBDatabase, snapshot: BrowserProjectSnapshot) {
  return requestPromise<void>(
    db.transaction(PROJECT_STORE, "readwrite").objectStore(PROJECT_STORE).put(snapshot)
  );
}

function getSnapshot(db: IDBDatabase, key: string) {
  return requestPromise<BrowserProjectSnapshot | undefined>(
    db.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).get(key)
  );
}

function requestPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("Browser project storage request failed."));
  });
}
