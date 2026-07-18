import type { SourceFile } from "../types";
import { normalizeSourceFileRole } from "../projectOrigin";
import { readStoredZip } from "./zip";

export type BrowserRawSourceFile = SourceFile & {
  bytesData: Uint8Array;
  originalRelativePath?: string;
  targetPlatform?: BrowserRawSourceTargetPlatform;
  captureConfidence?: BrowserRawSourceCaptureConfidence;
};

export type BrowserRawSourceTargetPlatform = "mac-classic" | "windows-realmz" | "unknown";
export type BrowserRawSourceCaptureConfidence = "captured" | "manifest" | "derived";

export type BrowserRawSourceSnapshot = {
  schemaVersion?: number;
  sourceKind?: "browser-scenario-import" | "providence-project-package" | "generated-scenario-baseline";
  capturedAt: string;
  rootName: string;
  targetPlatform?: BrowserRawSourceTargetPlatform;
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

export type BrowserProjectZipSource = {
  kind: "project-zip-file";
  name: string;
  file: File;
};

export type BrowserScenarioSource = BrowserDirectoryHandle | BrowserFileSelection;
export type BrowserProjectSource = BrowserScenarioSource | BrowserProjectZipSource;

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

export async function pickBrowserProjectSource(): Promise<BrowserProjectSource> {
  return pickProjectZipInput();
}

export function isBrowserPickerAbort(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  ) || (error instanceof Error && (
    error.message.toLowerCase().includes("aborted") ||
    error.message.toLowerCase().includes("no folder was selected") ||
    error.message.toLowerCase().includes("no project package was selected")
  ));
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

export async function readProjectJson(source: BrowserProjectSource) {
  if (source.kind === "project-zip-file") {
    return (await readProjectPackage(source)).projectJson;
  }
  if (source.kind === "file-selection") {
    const file = source.files.find((candidate) => fileBaseName(candidate) === "project.json");
    if (!file) throw new Error("No project.json found in selected folder.");
    return file.text();
  }
  const fileHandle = await source.getFileHandle("project.json");
  const file = await fileHandle.getFile();
  return file.text();
}

export async function readProjectPackage(source: BrowserProjectSource) {
  const packageFiles = source.kind === "file-selection"
    ? await readProjectPackageFileSelection(source)
    : source.kind === "project-zip-file"
      ? await readProjectPackageZipFile(source)
      : await readProjectPackageDirectory(source);
  const projectJson = selectProjectJsonFile(packageFiles);
  if (!projectJson) throw new Error("No project.json found in selected folder.");
  const projectRoot = packagePathParent(projectJson.relativePath);
  const rawSources = await readPackageRawSourceSnapshot(packageFiles, projectRoot, source.name);
  return {
    projectJson: new TextDecoder().decode(projectJson.bytes),
    rawSources,
    projectJsonPath: projectJson.relativePath
  };
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

function pickProjectZipInput(): Promise<BrowserProjectZipSource> {
  if (typeof document === "undefined") throw new Error("This browser does not expose project package file picking.");
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".providence.zip,.zip,application/zip";
    input.style.position = "fixed";
    input.style.left = "-10000px";
    input.style.top = "-10000px";
    let settled = false;
    const rejectCancelled = () => {
      if (settled) return;
      settled = true;
      input.remove();
      reject(new Error("No project package was selected."));
    };
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      if (settled) return;
      settled = true;
      input.remove();
      if (!file) {
        reject(new Error("No project package was selected."));
        return;
      }
      resolve({ kind: "project-zip-file", name: file.name, file });
    }, { once: true });
    input.addEventListener("cancel", rejectCancelled, { once: true });
    input.click();
  });
}

type ProjectPackageFile = {
  name: string;
  relativePath: string;
  bytes: Uint8Array;
};

type RawSourcesManifest = {
  capturedAt?: string | null;
  rootName?: string | null;
  targetPlatform?: BrowserRawSourceTargetPlatform | null;
  sourceKind?: string | null;
  files?: RawSourcesManifestFile[];
};

type RawSourcesManifestFile = {
  name?: string;
  relativePath?: string;
  originalRelativePath?: string;
  packagePath?: string;
  bytes?: number;
  sha256?: string;
  role?: string;
  editable?: boolean;
  targetPlatform?: BrowserRawSourceTargetPlatform;
  captureConfidence?: BrowserRawSourceCaptureConfidence;
};

async function readProjectPackageDirectory(handle: BrowserDirectoryHandle) {
  const files: ProjectPackageFile[] = [];
  for await (const candidate of walkScenarioDirectory(handle)) {
    const { name, relativePath, handle: fileHandle } = candidate;
    if (isIgnoredOsMetadataFile(name)) continue;
    const file = await fileHandle.getFile();
    files.push({
      name,
      relativePath,
      bytes: new Uint8Array(await file.arrayBuffer())
    });
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function readProjectPackageFileSelection(selection: BrowserFileSelection) {
  const markerName = selectionRootName(selection.files) || selection.name;
  const files: ProjectPackageFile[] = [];
  for (const file of selection.files) {
    const name = fileBaseName(file);
    const relativePath = relativeSelectionPath(file, markerName);
    if (!name || isIgnoredOsMetadataFile(name)) continue;
    files.push({
      name,
      relativePath,
      bytes: new Uint8Array(await file.arrayBuffer())
    });
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function readProjectPackageZipFile(source: BrowserProjectZipSource) {
  const bytes = new Uint8Array(await source.file.arrayBuffer());
  return readStoredZip(bytes)
    .map((entry) => ({
      name: packagePathBaseName(entry.path),
      relativePath: entry.path,
      bytes: entry.bytes
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function selectProjectJsonFile(files: ProjectPackageFile[]) {
  const candidates = files.filter((file) => file.name === "project.json");
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => projectJsonRank(left) - projectJsonRank(right) || left.relativePath.localeCompare(right.relativePath))[0];
}

function projectJsonRank(file: ProjectPackageFile) {
  const parent = packagePathParent(file.relativePath);
  if (!parent) return 0;
  if (parent.endsWith(".providence")) return 1;
  return 2 + parent.split("/").length;
}

async function readPackageRawSourceSnapshot(
  files: ProjectPackageFile[],
  projectRoot: string,
  fallbackRootName: string
): Promise<BrowserRawSourceSnapshot | null> {
  const fileIndex = new Map(files.map((file) => [normalizeProjectPackagePath(file.relativePath), file]));
  const manifestFile = fileIndex.get(packagePathJoin(projectRoot, "raw-sources-manifest.json"));
  const manifest = parseRawSourcesManifest(manifestFile);
  const packageRoot = packageFallbackRootName(projectRoot, fallbackRootName);
  if (manifest?.files?.length) {
    return rawSourcesFromManifest(fileIndex, manifest, projectRoot, packageRoot);
  }
  const rawSourcePrefix = packagePathJoin(projectRoot, "raw-sources");
  const rawFiles = files
    .filter((file) => pathIsWithinPackageDirectory(file.relativePath, rawSourcePrefix))
    .map((file) => rawSourceRelativeFromPackageFile(file, rawSourcePrefix));
  if (rawFiles.length === 0 && !manifestFile) return null;
  const sourceFiles: BrowserRawSourceFile[] = [];
  for (const { file, relativePath } of rawFiles) {
    const name = packagePathBaseName(relativePath);
    const sha256 = await sha256Hex(file.bytes);
    sourceFiles.push({
      name,
      relativePath,
      originalRelativePath: relativePath,
      bytes: file.bytes.byteLength,
      sha256,
      role: roleForFile(name, new Set()),
      editable: false,
      bytesData: file.bytes,
      targetPlatform: "unknown",
      captureConfidence: "derived"
    });
  }
  return createRawSourceSnapshot(
    manifest?.rootName || packageRoot,
    sourceFiles,
    "providence-project-package",
    manifest?.capturedAt || undefined,
    manifest?.targetPlatform || undefined
  );
}

async function rawSourcesFromManifest(
  fileIndex: Map<string, ProjectPackageFile>,
  manifest: RawSourcesManifest,
  projectRoot: string,
  fallbackRootName: string
): Promise<BrowserRawSourceSnapshot> {
  const sourceFiles: BrowserRawSourceFile[] = [];
  for (const manifestFile of manifest.files ?? []) {
    const relativePath = normalizeSnapshotRelativePath(manifestFile.relativePath || manifestFile.name || "");
    const packagePath = packagePathJoin(projectRoot, manifestFile.packagePath || `raw-sources/${relativePath}`);
    const file = fileIndex.get(packagePath);
    if (!file) {
      throw new Error(`Project package raw source '${manifestFile.packagePath || relativePath}' is listed in raw-sources-manifest.json but is missing from the selected folder.`);
    }
    const sha256 = manifestFile.sha256 || await sha256Hex(file.bytes);
    if (manifestFile.sha256) {
      const actualSha256 = await sha256Hex(file.bytes);
      if (actualSha256 !== manifestFile.sha256) {
        throw new Error(`Project package raw source '${manifestFile.packagePath || relativePath}' does not match its raw-sources-manifest.json SHA-256.`);
      }
    }
    const name = manifestFile.name || packagePathBaseName(relativePath);
    sourceFiles.push({
      name,
      relativePath,
      originalRelativePath: manifestFile.originalRelativePath || relativePath,
      bytes: file.bytes.byteLength,
      sha256,
      role: normalizeSourceFileRole(manifestFile.role, roleForFile(name, new Set())),
      editable: manifestFile.editable ?? false,
      bytesData: file.bytes,
      targetPlatform: manifestFile.targetPlatform || manifest.targetPlatform || "unknown",
      captureConfidence: manifestFile.captureConfidence || "manifest"
    });
  }
  return createRawSourceSnapshot(
    manifest.rootName || packageRootName(fallbackRootName),
    sourceFiles,
    "providence-project-package",
    manifest.capturedAt || undefined,
    manifest.targetPlatform || undefined
  );
}

function parseRawSourcesManifest(file: ProjectPackageFile | undefined): RawSourcesManifest | null {
  if (!file) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(file.bytes)) as RawSourcesManifest;
    return value && typeof value === "object" ? value : null;
  } catch {
    throw new Error("raw-sources-manifest.json is not valid JSON.");
  }
}

export async function sha256Hex(bytes: Uint8Array) {
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

function roleForFile(name: string, tracked: Set<string>): SourceFile["role"] {
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

function createRawSourceSnapshot(
  rootName: string,
  files: BrowserRawSourceFile[],
  sourceKind: BrowserRawSourceSnapshot["sourceKind"] = "browser-scenario-import",
  capturedAt = new Date().toISOString(),
  targetPlatform?: BrowserRawSourceTargetPlatform
): BrowserRawSourceSnapshot {
  const inferredTargetPlatform = targetPlatform ?? inferRawSourceTargetPlatform(files);
  return {
    schemaVersion: 1,
    sourceKind,
    capturedAt,
    rootName,
    targetPlatform: inferredTargetPlatform,
    totalBytes: files.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
    files: files.map((file) => ({
      ...file,
      originalRelativePath: file.originalRelativePath ?? file.relativePath,
      targetPlatform: file.targetPlatform ?? inferredTargetPlatform,
      captureConfidence: file.captureConfidence ?? "captured"
    }))
  };
}

function inferRawSourceTargetPlatform(files: Array<Pick<BrowserRawSourceFile, "name" | "relativePath">>): BrowserRawSourceTargetPlatform {
  const paths = files.map((file) => normalizeProjectPackagePath(file.relativePath || file.name).toLowerCase());
  if (paths.some((path) => path.includes("/.rsrc/") || packagePathBaseName(path).startsWith("._"))) return "mac-classic";
  if (paths.some((path) => path.endsWith(".rsrc") || path.endsWith(".rsf"))) return "windows-realmz";
  return "unknown";
}

function rawSourceRelativeFromPackageFile(file: ProjectPackageFile, rawSourcePrefix: string) {
  const normalized = normalizeProjectPackagePath(file.relativePath);
  const prefix = normalizeProjectPackagePath(rawSourcePrefix);
  const relativePath = normalized.slice(prefix.length).replace(/^\/+/, "");
  return { file, relativePath: relativePath || file.name };
}

function pathIsWithinPackageDirectory(path: string, directory: string) {
  const normalizedPath = normalizeProjectPackagePath(path);
  const normalizedDirectory = normalizeProjectPackagePath(directory);
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`);
}

function packagePathParent(path: string) {
  const normalized = normalizeProjectPackagePath(path);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

function packagePathBaseName(path: string) {
  return normalizeProjectPackagePath(path).split("/").filter(Boolean).pop() || "unnamed-source";
}

function packagePathJoin(...parts: string[]) {
  return normalizeProjectPackagePath(parts.filter(Boolean).join("/"));
}

function normalizeProjectPackagePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/");
}

function normalizeSnapshotRelativePath(path: string) {
  return normalizeProjectPackagePath(path) || "unnamed-source";
}

function packageRootName(name: string) {
  return name.replace(/\.providence$/i, "") || "Browser Scenario";
}

function packageFallbackRootName(projectRoot: string, selectedRootName: string) {
  const rootSegment = projectRoot ? packagePathBaseName(projectRoot) : selectedRootName;
  return packageRootName(rootSegment);
}

export const SUPPORTED_WRITE_FILES = new Set([
  "Global",
  "Data LD",
  "Data DL",
  "Data DD",
  "Data DDD",
  "Data RD",
  "Data RDD",
  "Layout",
  "Data ED",
  "Data ED2",
  "Data ED3",
  "Data EDCD",
  "Data MD",
  "Data MD1",
  "Data MD-1",
  "Data DES",
  "Data BD",
  "Data SD",
  "Data SD2",
  "Data OD",
  "Data MD2",
  "Data TD",
  "Data TD2",
  "Data TD3",
  "Data CS",
  "Data CI",
  "Data RI",
  "Data NI",
  "Data Spell",
  "Data Race",
  "Data Caste",
  "Data Custom 1 BD",
  "Data Custom 2 BD",
  "Data Custom 3 BD"
]);
