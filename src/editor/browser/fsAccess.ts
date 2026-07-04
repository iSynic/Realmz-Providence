import { SourceFile } from "../types";

export type BrowserRawSourceFile = SourceFile & {
  bytesData: Uint8Array;
};

export type BrowserRawSourceSnapshot = {
  capturedAt: string;
  rootName: string;
  totalBytes: number;
  files: BrowserRawSourceFile[];
};

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
  const rawSourceFiles: BrowserRawSourceFile[] = [];
  const tracked = new Set(trackedFiles);
  const markerName = handle.name;

  for await (const candidate of walkScenarioDirectory(handle)) {
    const { name, relativePath, handle: fileHandle } = candidate;
    if (isIgnoredOsMetadataFile(name)) continue;
    const file = await fileHandle.getFile();
    const role = roleForFile(name, tracked);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    const sourceFile = {
      name,
      relativePath,
      bytes: file.size,
      sha256,
      role,
      editable: role === "supported-binary"
    };
    sourceFiles.push(sourceFile);
    rawSourceFiles.push({ ...sourceFile, bytesData: bytes });
    if (tracked.has(name) || isResourceFileName(name) || name === markerName || isScenarioMarkerCandidate(name, bytes, tracked)) {
      storeScenarioBuffer(files, name, relativePath, bytes);
    }
  }

  sourceFiles.sort((a, b) => a.name.localeCompare(b.name));
  rawSourceFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files, sourceFiles, rawSources: createRawSourceSnapshot(markerName, rawSourceFiles) };
}

async function* walkScenarioDirectory(
  handle: BrowserDirectoryHandle,
  prefix = ""
): AsyncIterableIterator<{ name: string; relativePath: string; handle: BrowserFileHandle }> {
  for await (const [name, entry] of handle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "file") {
      yield { name, relativePath, handle: entry };
    } else {
      yield* walkScenarioDirectory(entry, relativePath);
    }
  }
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
  const rawSourceFiles: BrowserRawSourceFile[] = [];
  const tracked = new Set(trackedFiles);
  const markerName = selectionRootName(selection.files) || selection.name;
  for (const file of selection.files) {
    const name = fileBaseName(file);
    const relativePath = relativeSelectionPath(file, markerName);
    if (!name) continue;
    if (isIgnoredOsMetadataFile(name)) continue;
    const role = roleForFile(name, tracked);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    const sourceFile = {
      name,
      relativePath,
      bytes: file.size,
      sha256,
      role,
      editable: role === "supported-binary"
    };
    sourceFiles.push(sourceFile);
    rawSourceFiles.push({ ...sourceFile, bytesData: bytes });
    if (tracked.has(name) || isResourceFileName(name) || name === markerName || isScenarioMarkerCandidate(name, bytes, tracked)) {
      storeScenarioBuffer(files, name, relativePath, bytes);
    }
  }
  sourceFiles.sort((a, b) => a.name.localeCompare(b.name));
  rawSourceFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files, sourceFiles, rawSources: createRawSourceSnapshot(markerName, rawSourceFiles) };
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

function selectionRootName(files: File[]) {
  const relative = relativeSelectionPath(files[0]);
  return relative.split(/[\\/]/).filter(Boolean)[0] || "Browser Scenario";
}

function fileBaseName(file: File) {
  return relativeSelectionPath(file).split(/[\\/]/).filter(Boolean).pop() ?? file.name;
}

function relativeSelectionPath(file: File, rootName?: string) {
  const relativePath = file.webkitRelativePath || file.name;
  if (!rootName) return relativePath;
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts[0] === rootName) return parts.slice(1).join("/") || file.name;
  return relativePath;
}

function isResourceFileName(name: string) {
  return name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function isIgnoredOsMetadataFile(name: string) {
  return name === ".DS_Store";
}

function storeScenarioBuffer(files: Map<string, Uint8Array>, name: string, relativePath: string, bytes: Uint8Array) {
  const sidecarKey = resourceSidecarKey(name, relativePath);
  if (sidecarKey && sidecarKey.toLowerCase().includes("/.rsrc/")) {
    files.set(sidecarKey, bytes);
    return;
  }
  files.set(name, bytes);
  if (sidecarKey && sidecarKey !== name) files.set(sidecarKey, bytes);
}

function resourceSidecarKey(name: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  if (lower.includes("/.rsrc/") || lower.includes("/._") || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) {
    return normalized;
  }
  return null;
}

function isScenarioMarkerCandidate(name: string, bytes: Uint8Array, tracked: Set<string>) {
  return bytes.byteLength >= 316
    && !tracked.has(name)
    && !isResourceFileName(name)
    && !name.startsWith("Data ")
    && name !== "Global"
    && name !== "Layout";
}

function createRawSourceSnapshot(rootName: string, files: BrowserRawSourceFile[]): BrowserRawSourceSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    rootName,
    totalBytes: files.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
    files
  };
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
