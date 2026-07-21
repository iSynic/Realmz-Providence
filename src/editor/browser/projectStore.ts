import { Project } from "../types";
import { browserSourceSnapshotForProject, hydrateBrowserScenarioMusicAssets, normalizeBrowserProject, registerBrowserSourceSnapshot } from "./project";
import { BrowserRawSourceSnapshot } from "./fsAccess";

const DB_NAME = "realmz-providence-browser-projects";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const ACTIVE_PROJECT_KEY = "realmz-providence.activeBrowserProject";
const ACTIVE_PROJECT_RESTORE_SUPPRESSED_KEY = "realmz-providence.activeBrowserProjectRestoreSuppressed";

export type BrowserProjectSnapshot = {
  key: string;
  name: string;
  savedAt: string;
  project: Project;
  rawSources?: BrowserRawSourceSnapshot;
};

export function browserProjectKey(project: Project) {
  if (project.scenario.projectPath?.startsWith("browser://")) return project.scenario.projectPath;
  return `browser://${safeBrowserProjectName(project.scenario.name || "Untitled Scenario")}.providence`;
}

export async function saveBrowserProject(project: Project, rawSources?: BrowserRawSourceSnapshot | null) {
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
  const db = await openProjectDb();
  const existing = await getSnapshot(db, key);
  const retainedRawSources =
    rawSources ??
    browserSourceSnapshotForProject(storedProject) ??
    existing?.rawSources;
  const snapshot: BrowserProjectSnapshot = {
    key,
    name: storedProject.scenario.name || "Untitled Scenario",
    savedAt: new Date().toISOString(),
    project: storedProject,
    rawSources: retainedRawSources
  };
  await putSnapshot(db, snapshot);
  rememberActiveProject(key);
  allowActiveBrowserProjectRestore();
  db.close();
  registerBrowserSourceSnapshot(snapshot.project, snapshot.rawSources);
  return snapshot;
}

export async function saveNewBrowserProject(project: Project, rawSources?: BrowserRawSourceSnapshot | null) {
  const baseKey = browserProjectKey(project);
  const db = await openProjectDb();
  let key = baseKey;
  for (let suffix = 2; await getSnapshot(db, key); suffix += 1) {
    key = browserProjectKey({
      ...project,
      scenario: { ...project.scenario, projectPath: browserProjectKeyWithSuffix(baseKey, suffix) }
    });
  }
  db.close();
  return saveBrowserProject({ ...project, scenario: { ...project.scenario, projectPath: key } }, rawSources);
}

export async function loadActiveBrowserProject(options: { includeSuppressed?: boolean } = {}) {
  if (!options.includeSuppressed && activeProjectRestoreSuppressed()) return null;
  const key = activeProjectKey();
  if (!key) return null;
  const db = await openProjectDb();
  const snapshot = await getSnapshot(db, key);
  db.close();
  if (!snapshot) return null;
  const project = await hydrateBrowserScenarioMusicAssets(normalizeBrowserProject(snapshot.project), snapshot.rawSources);
  registerBrowserSourceSnapshot(project, snapshot.rawSources);
  return {
    ...snapshot,
    project
  };
}

export function suppressActiveBrowserProjectRestore() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_PROJECT_RESTORE_SUPPRESSED_KEY, "1");
}

export function allowActiveBrowserProjectRestore() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(ACTIVE_PROJECT_RESTORE_SUPPRESSED_KEY);
}

export async function loadBrowserProjectRawSources(project: Project) {
  const cached = browserSourceSnapshotForProject(project);
  if (cached) return cached;
  const db = await openProjectDb();
  const snapshot = await getSnapshot(db, browserProjectKey(project));
  db.close();
  if (!snapshot?.rawSources) return null;
  registerBrowserSourceSnapshot(project, snapshot.rawSources);
  return snapshot.rawSources;
}

function activeProjectKey() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

function activeProjectRestoreSuppressed() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ACTIVE_PROJECT_RESTORE_SUPPRESSED_KEY) === "1";
}

function rememberActiveProject(key: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_PROJECT_KEY, key);
}

function safeBrowserProjectName(name: string) {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return safeName || "Untitled Scenario";
}

function browserProjectKeyWithSuffix(key: string, suffix: number) {
  return key.endsWith(".providence")
    ? `${key.slice(0, -".providence".length)} ${suffix}.providence`
    : `${key} ${suffix}`;
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
