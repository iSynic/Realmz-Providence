import { SourceFile } from "../types";

export type BrowserFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};

export type BrowserDirectoryHandle = {
  kind: "directory";
  name: string;
  getFileHandle: (name: string) => Promise<BrowserFileHandle>;
  entries: () => AsyncIterableIterator<[string, BrowserFileHandle | BrowserDirectoryHandle]>;
};

export type BrowserFileSelection = {
  kind: "file-selection";
  name: string;
  files: File[];
};

export type BrowserScenarioSource = BrowserDirectoryHandle | BrowserFileSelection;

type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<BrowserDirectoryHandle>;
};

export function canUseBrowserFileSystem() {
  return canUseDirectoryPicker() || canUseDirectoryInput();
}

export function canUseDirectoryPicker() {
  return typeof window !== "undefined" && typeof (window as FilePickerWindow).showDirectoryPicker === "function";
}

export function canUseDirectoryInput() {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input") as HTMLInputElement & { webkitdirectory?: boolean };
  return "webkitdirectory" in input;
}

export async function pickBrowserDirectory() {
  const picker = (window as FilePickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("This browser does not expose directory picking. Use Chrome or Edge for browser imports.");
  return picker({ id: "realmz-scenario", mode: "read" });
}

export async function pickBrowserScenarioSource(): Promise<BrowserScenarioSource> {
  try {
    return await pickDirectoryInput();
  } catch (error) {
    if (canUseDirectoryInput() || !canUseDirectoryPicker()) throw error;
  }
  if (canUseDirectoryPicker()) return pickBrowserDirectory();
  return pickDirectoryInput();
}

export async function pickBrowserProjectSource(): Promise<BrowserScenarioSource> {
  if (canUseDirectoryPicker()) return pickBrowserDirectory();
  return pickDirectoryInput();
}

export function isBrowserPickerAbort(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  ) || (error instanceof Error && error.message.toLowerCase().includes("aborted"));
}

export async function readScenarioSource(source: BrowserScenarioSource, trackedFiles: readonly string[]) {
  return source.kind === "file-selection"
    ? readScenarioFileSelection(source, trackedFiles)
    : readScenarioDirectory(source, trackedFiles);
}

export async function readScenarioDirectory(handle: BrowserDirectoryHandle, trackedFiles: readonly string[]) {
  const files = new Map<string, Uint8Array>();
  const sourceFiles: SourceFile[] = [];
  const tracked = new Set(trackedFiles);
  const markerName = handle.name;

  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file") continue;
    const file = await entry.getFile();
    const role = roleForFile(name, tracked);
    const shouldRead = shouldReadScenarioFile(name, role, markerName, file.size);
    const bytes = shouldRead ? new Uint8Array(await file.arrayBuffer()) : null;
    sourceFiles.push({
      name,
      relativePath: name,
      bytes: file.size,
      sha256: bytes ? await sha256Hex(bytes) : "browser-preview-unread",
      role,
      editable: role === "supported-binary"
    });
    if (bytes && (tracked.has(name) || isResourceFileName(name) || name === markerName || isScenarioMarkerCandidate(name, bytes, tracked))) {
      files.set(name, bytes);
    }
  }

  sourceFiles.sort((a, b) => a.name.localeCompare(b.name));
  return { files, sourceFiles };
}

export async function readProjectJson(source: BrowserScenarioSource) {
  if (source.kind === "file-selection") {
    const file = source.files.find((candidate) => fileBaseName(candidate) === "project.json");
    if (!file) throw new Error("No project.json found in selected folder.");
    return file.text();
  }
  const fileHandle = await source.getFileHandle("project.json");
  const file = await fileHandle.getFile();
  return file.text();
}

function pickDirectoryInput(): Promise<BrowserFileSelection> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input") as HTMLInputElement & { webkitdirectory?: boolean };
    input.type = "file";
    input.multiple = true;
    input.webkitdirectory = true;
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "-10000px";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length === 0) {
        reject(new Error("No folder was selected."));
        return;
      }
      resolve({ kind: "file-selection", name: selectionRootName(files), files });
    }, { once: true });
    input.click();
  });
}

async function readScenarioFileSelection(selection: BrowserFileSelection, trackedFiles: readonly string[]) {
  const files = new Map<string, Uint8Array>();
  const sourceFiles: SourceFile[] = [];
  const tracked = new Set(trackedFiles);
  const markerName = selection.name;
  for (const file of selection.files) {
    const name = fileBaseName(file);
    const relativePath = relativeSelectionPath(file);
    if (!name) continue;
    const role = roleForFile(name, tracked);
    const shouldRead = shouldReadScenarioFile(name, role, markerName, file.size);
    const bytes = shouldRead ? new Uint8Array(await file.arrayBuffer()) : null;
    sourceFiles.push({
      name,
      relativePath,
      bytes: file.size,
      sha256: bytes ? await sha256Hex(bytes) : "browser-preview-unread",
      role,
      editable: role === "supported-binary"
    });
    if (bytes && (tracked.has(name) || isResourceFileName(name) || name === markerName || isScenarioMarkerCandidate(name, bytes, tracked))) {
      files.set(name, bytes);
    }
  }
  sourceFiles.sort((a, b) => a.name.localeCompare(b.name));
  return { files, sourceFiles };
}

async function sha256Hex(bytes: Uint8Array) {
  if (crypto.subtle) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function roleForFile(name: string, tracked: Set<string>) {
  if (SUPPORTED_WRITE_FILES.has(name)) return "supported-binary";
  if (isResourceFileName(name)) return "resource-fork";
  if (tracked.has(name)) return "pass-through";
  return "unknown";
}

function shouldReadScenarioFile(name: string, role: string, markerName: string, size: number) {
  return role === "supported-binary" ||
    role === "pass-through" ||
    role === "resource-fork" ||
    name === markerName ||
    size <= 1024;
}

function selectionRootName(files: File[]) {
  const relative = relativeSelectionPath(files[0]);
  return relative.split(/[\\/]/).filter(Boolean)[0] || "Browser Scenario";
}

function fileBaseName(file: File) {
  return relativeSelectionPath(file).split(/[\\/]/).filter(Boolean).pop() ?? file.name;
}

function relativeSelectionPath(file: File) {
  return file.webkitRelativePath || file.name;
}

function isResourceFileName(name: string) {
  return name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function isScenarioMarkerCandidate(name: string, bytes: Uint8Array, tracked: Set<string>) {
  return bytes.byteLength >= 316
    && !tracked.has(name)
    && !isResourceFileName(name)
    && !name.startsWith("Data ")
    && name !== "Global"
    && name !== "Layout";
}

const SUPPORTED_WRITE_FILES = new Set([
  "Data LD",
  "Data DL",
  "Data DD",
  "Data DDD",
  "Data RD",
  "Data RDD",
  "Layout",
  "Data ED3",
  "Data EDCD",
  "Data MD1",
  "Data MD-1",
  "Data CS",
  "Data CI",
  "Data RI",
  "Data Solids",
  "Data OD",
  "Data DES"
]);
