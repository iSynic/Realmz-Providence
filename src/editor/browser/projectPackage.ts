import { ManagedAsset, Project } from "../types";
import { BrowserRawSourceSnapshot } from "./fsAccess";
import { createStoredZip } from "./zip";

type PackageEntry = {
  path: string;
  bytes: Uint8Array;
  modifiedAt?: Date;
};

type PackageAssetFile = {
  assetId: string;
  assetLabel: string;
  field: "resourcePath" | "originalPath" | "previewPath";
  path: string;
  bytes: number;
  mimeType: string;
};

type PackageRawSourceFile = {
  name: string;
  relativePath: string;
  packagePath: string;
  bytes: number;
  sha256: string;
  role: string;
  editable: boolean;
};

export function browserProjectPackageFileName(project: Project) {
  return `${safePackageName(project.scenario.name || "Untitled Scenario")}.providence.zip`;
}

export function createBrowserProjectPackageZip(project: Project, rawSources?: BrowserRawSourceSnapshot | null) {
  const generatedAt = new Date();
  const rootName = `${safePackageName(project.scenario.name || "Untitled Scenario")}.providence`;
  const entries: PackageEntry[] = [];
  const usedPaths = new Set<string>();

  const addEntry = (path: string, bytes: Uint8Array) => {
    const uniquePath = uniqueEntryPath(normalizePackagePath(path), usedPaths);
    entries.push({ path: uniquePath, bytes, modifiedAt: generatedAt });
    return uniquePath;
  };

  const packageProject: Project = {
    ...project,
    source: {
      ...project.source,
      rawSourcesDir: "raw-sources"
    }
  };
  addEntry(`${rootName}/project.json`, jsonBytes(packageProject));

  const rawSourceFiles: PackageRawSourceFile[] = [];
  if (rawSources) {
    for (const source of rawSources.files) {
      const relativePath = normalizeSnapshotRelativePath(source.relativePath || source.name);
      const packagePath = addEntry(`${rootName}/raw-sources/${relativePath}`, source.bytesData);
      rawSourceFiles.push({
        name: source.name,
        relativePath,
        packagePath: packagePath.slice(rootName.length + 1),
        bytes: source.bytesData.byteLength,
        sha256: source.sha256,
        role: source.role,
        editable: source.editable
      });
    }
  }

  const assetFiles = addManagedAssetFiles(rootName, project.assets ?? [], addEntry);
  addEntry(`${rootName}/raw-sources-manifest.json`, jsonBytes({
    schemaVersion: 1,
    capturedAt: rawSources?.capturedAt ?? null,
    rootName: rawSources?.rootName ?? null,
    capturedFileCount: rawSourceFiles.length,
    capturedBytes: rawSourceFiles.reduce((sum, file) => sum + file.bytes, 0),
    files: rawSourceFiles
  }));
  addEntry(`${rootName}/assets/managed/manifest.json`, jsonBytes({
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    managedAssetCount: project.assets?.length ?? 0,
    includedFileCount: assetFiles.length,
    files: assetFiles
  }));
  addEntry(`${rootName}/package-manifest.json`, jsonBytes({
    schemaVersion: 1,
    artifact: "providence-project-package",
    generatedAt: generatedAt.toISOString(),
    appVersion: project.appVersion,
    projectSchemaVersion: project.schemaVersion,
    scenario: {
      name: project.scenario.name,
      projectPath: project.scenario.projectPath,
      importedAt: project.scenario.importedAt
    },
    source: {
      sourcePath: project.source.sourcePath,
      rawSourcesDir: "raw-sources",
      capturedAt: rawSources?.capturedAt ?? null,
      capturedFileCount: rawSourceFiles.length,
      capturedBytes: rawSourceFiles.reduce((sum, file) => sum + file.bytes, 0)
    },
    contents: {
      projectJson: "project.json",
      rawSourcesManifest: "raw-sources-manifest.json",
      managedAssetsManifest: "assets/managed/manifest.json",
      rawSourceFiles: rawSourceFiles.length,
      managedAssetFiles: assetFiles.length
    }
  }));

  return createStoredZip(entries);
}

function addManagedAssetFiles(
  rootName: string,
  assets: ManagedAsset[],
  addEntry: (path: string, bytes: Uint8Array) => string
) {
  const files: PackageAssetFile[] = [];
  for (const asset of assets) {
    const assetPath = safePathSegment(asset.id || `${asset.resourceType}-${asset.resourceId}`);
    const assetFileName = safePackageName(asset.fileName || `${asset.resourceType}-${asset.resourceId}`);
    const seenPayloads = new Set<string>();
    for (const field of ["resourcePath", "originalPath", "previewPath"] as const) {
      const value = asset[field];
      const payload = bytesFromDataUrl(value);
      if (!payload) continue;
      if (seenPayloads.has(value)) continue;
      seenPayloads.add(value);
      const extension = extensionForMime(payload.mimeType, assetFileName);
      const fileName = field === "resourcePath"
        ? assetFileName
        : withSuffix(assetFileName, field === "originalPath" ? "original" : "preview", extension);
      const path = addEntry(`${rootName}/assets/managed/${assetPath}/${field}/${fileName}`, payload.bytes);
      files.push({
        assetId: asset.id,
        assetLabel: asset.label,
        field,
        path: path.slice(rootName.length + 1),
        bytes: payload.bytes.byteLength,
        mimeType: payload.mimeType
      });
    }
  }
  return files;
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function bytesFromDataUrl(value: string) {
  if (!value.startsWith("data:")) return null;
  const separator = value.indexOf(",");
  if (separator < 0) return null;
  const metadata = value.slice(5, separator);
  const payload = value.slice(separator + 1);
  const mimeType = metadata.split(";")[0] || "application/octet-stream";
  if (metadata.toLowerCase().includes(";base64")) {
    return { mimeType, bytes: binaryStringToBytes(atob(payload)) };
  }
  return { mimeType, bytes: percentDecodedBytes(payload) };
}

function binaryStringToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function percentDecodedBytes(value: string) {
  const decoded = decodeURIComponent(value);
  return new TextEncoder().encode(decoded);
}

function normalizeSnapshotRelativePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "unnamed-source";
}

function normalizePackagePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/");
}

function uniqueEntryPath(path: string, usedPaths: Set<string>) {
  if (!usedPaths.has(path)) {
    usedPaths.add(path);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const directory = slash >= 0 ? `${path.slice(0, slash + 1)}` : "";
  const fileName = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : "";
  for (let index = 2; ; index += 1) {
    const candidate = `${directory}${stem}-${index}${extension}`;
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
  }
}

function withSuffix(fileName: string, suffix: string, fallbackExtension: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0) return `${fileName.slice(0, dot)}.${suffix}${fileName.slice(dot)}`;
  return `${fileName}.${suffix}${fallbackExtension}`;
}

function extensionForMime(mimeType: string, fileName: string) {
  if (fileName.includes(".")) return "";
  if (mimeType === "text/plain") return ".txt";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "audio/wav") return ".wav";
  return ".bin";
}

function safePackageName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled Scenario";
}

function safePathSegment(name: string) {
  return safePackageName(name).replace(/\s+/g, "-").slice(0, 96) || "asset";
}
