import { DecodedResourcePreview, LibraryCatalog, LibraryEntity, LibraryRecord, LibrarySource, ManagedAsset, ProvidenceWorkspace } from "../types";
import { BrowserDirectoryHandle, BrowserFileSelection, BrowserScenarioSource } from "./fsAccess";
import { parseResourceFork, parseStringListResource, type ResourceEntry } from "./resourceFork";
import { inspectResourcePreview, inspectResourcePreviewAsync } from "./resourcePreview";
import { mergeBrowserIconLibraryEntries } from "../iconLibrary";
import { mergeBrowserMonsterLibraryEntries } from "../monsterLibrary";
import { isOutdoorMusicReplacement, OUTDOOR_MUSIC_REPLACEMENT_PATH } from "../musicCompatibility";
import { inspectStandardMod } from "../standardMod";

export { parseResourceFork, parseStringListResource } from "./resourceFork";
export type { ResourceEntry } from "./resourceFork";

export const BROWSER_WORKSPACE_PATH = "browser://workspace";
const LIBRARY_SCHEMA_VERSION = 4;
const bundledResourceCache = new Map<string, Promise<ResourceEntry[]>>();
const bundledFileCache = new Map<string, Promise<Uint8Array>>();
const bundledResourcePreviewCache = new Map<string, Promise<DecodedResourcePreview>>();
type BrowserLibraryFile = { name: string; relativePath: string; bytes: Uint8Array };
type BrowserLibrarySourceKind = "divinity-import" | "realmz-reference" | "providence-library";

export function createBrowserWorkspace(catalog: LibraryCatalog | null = null, customAssets: ManagedAsset[] = []): ProvidenceWorkspace {
  return {
    schemaVersion: 2,
    appVersion: "browser-preview",
    workspacePath: BROWSER_WORKSPACE_PATH,
    managedLibraryPath: "browser://workspace/library",
    referenceRoots: {
      divinity: "bundled://divinity",
      realmzData: "bundled://realmz-reference",
      newScenario: "browser://new-scenario-template"
    },
    recentProjects: [],
    activeLibraryCatalog: catalog,
    customAssets,
    remakePreview: {
      godotExecutable: "",
      remakePath: ""
    },
    diagnostics: []
  };
}

export async function loadBundledLibraryCatalog() {
  const manifestResponse = await fetch("/bundled-libraries/manifest.json", { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("Bundled library manifest was not found.");
  const manifest = await manifestResponse.json() as {
    schemaVersion: number;
    sources: Array<{ sourceKind: BrowserLibrarySourceKind; path: string; bytes: number; sha256: string }>;
  };
  const catalogs: LibraryCatalog[] = [];
  for (const sourceKind of ["divinity-import", "realmz-reference", "providence-library"] as const) {
    const folder = sourceKind === "divinity-import" ? "divinity" : sourceKind === "realmz-reference" ? "realmz-reference" : "providence";
    const files: BrowserLibraryFile[] = [];
    for (const entry of manifest.sources.filter((source) => source.sourceKind === sourceKind)) {
      const response = await fetch(`/bundled-libraries/${folder}/${encodePath(entry.path)}`);
      if (!response.ok) throw new Error(`Bundled library file missing: ${entry.path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      files.push({
        name: entry.path.split("/").filter(Boolean).pop() ?? entry.path,
        relativePath: entry.path.replace(/\//g, "\\"),
        bytes
      });
    }
    catalogs.push(await buildLibraryCatalogFromFiles(`bundled://${folder}`, files, sourceKind, "browser-bundled://library", "source-backed"));
  }
  return mergeBrowserIconLibraryEntries(mergeBrowserMonsterLibraryEntries(mergeCatalogs(catalogs)));
}

export async function importBrowserLibrary(source: BrowserScenarioSource, sourceKind: BrowserLibrarySourceKind) {
  const files = await readAllFiles(source);
  return mergeBrowserIconLibraryEntries(mergeBrowserMonsterLibraryEntries(await buildLibraryCatalogFromFiles(source.name, files, sourceKind, "browser-memory://library", "browser-fallback")));
}

export async function loadBrowserBundledLibraryAssetPreview(asset: LibraryCatalog["assets"][number]) {
  return (await inspectBrowserBundledLibraryAssetPreview(asset)).dataUrl;
}

export async function loadBrowserBundledLibraryResourceData(asset: LibraryCatalog["assets"][number]) {
  const folder = bundledFolderForSource(asset.source);
  if (!folder) return null;
  const [filePath, fragment] = splitResourceFragment(asset.relativePath);
  const url = `/bundled-libraries/${folder}/${encodePath(filePath.replace(/\\/g, "/"))}`;
  if (!fragment) {
    if (asset.type !== "music" || asset.resourceType?.trim() !== "MOD") return null;
    return loadBundledFile(url, filePath);
  }
  if (!bundledResourceCache.has(url)) {
    bundledResourceCache.set(url, loadBundledFile(url, filePath).then(parseResourceFork));
  }
  const resources = await bundledResourceCache.get(url);
  return resources?.find((entry) => entry.resourceType === fragment.resourceType && entry.id === fragment.resourceId)?.data ?? null;
}

export async function inspectBrowserBundledLibraryAssetPreview(asset: LibraryCatalog["assets"][number]): Promise<DecodedResourcePreview> {
  if (asset.previewPath) {
    return {
      status: asset.type === "sound" || asset.type === "music" ? "playable" : asset.type === "text" ? "text-ready" : "preview-ready",
      mimeType: asset.mimeType ?? resourceMimeType(asset.resourceType ?? ""),
      dataUrl: asset.previewPath,
      summary: { bytes: String(asset.bytes), source: asset.source },
      diagnostics: []
    };
  }
  const folder = bundledFolderForSource(asset.source);
  if (!folder) return missingFallbackPreview(asset, "Bundled library source could not be mapped to a preview folder.");
  const [filePath, fragment] = splitResourceFragment(asset.relativePath);
  if (!fragment) {
    return {
      status: "metadata-only",
      mimeType: asset.mimeType ?? resourceMimeType(asset.resourceType ?? ""),
      dataUrl: asset.previewPath ?? null,
      summary: { bytes: String(asset.bytes), source: asset.source },
      diagnostics: [{
        severity: "info",
        code: "browser.resource.no_fragment",
        message: "This library asset is a whole file, not a resource-fork member.",
        decoder: "browser-library"
      }]
    };
  }
  return loadBrowserBundledResourcePreview(folder, filePath, fragment);
}

function missingFallbackPreview(asset: LibraryCatalog["assets"][number], message: string): DecodedResourcePreview {
  return {
    status: "missing-fallback",
    mimeType: asset.mimeType ?? resourceMimeType(asset.resourceType ?? ""),
    dataUrl: null,
    summary: { bytes: String(asset.bytes), source: asset.source },
    diagnostics: [{
      severity: "error",
      code: "browser.resource.missing_fallback",
      message,
      decoder: "browser-library",
      variant: asset.type
    }]
  };
}

async function loadBrowserBundledResourcePreview(folder: string, filePath: string, fragment: { resourceType: string; resourceId: number }): Promise<DecodedResourcePreview> {
  const url = `/bundled-libraries/${folder}/${encodePath(filePath.replace(/\\/g, "/"))}`;
  const previewKey = `${url}\n${fragment.resourceType}\n${fragment.resourceId}`;
  const cachedPreview = bundledResourcePreviewCache.get(previewKey);
  if (cachedPreview) return cachedPreview;
  const request = loadBrowserBundledResourcePreviewUncached(url, filePath, fragment);
  bundledResourcePreviewCache.set(previewKey, request);
  return request;
}

async function loadBrowserBundledResourcePreviewUncached(url: string, filePath: string, fragment: { resourceType: string; resourceId: number }): Promise<DecodedResourcePreview> {
  if (!bundledResourceCache.has(url)) {
    bundledResourceCache.set(url, fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Bundled library file missing: ${filePath}`);
        return response.arrayBuffer();
      })
      .then((buffer) => parseResourceFork(new Uint8Array(buffer))));
  }
  const resources = await bundledResourceCache.get(url);
  const resource = resources?.find((entry) => entry.resourceType === fragment.resourceType && entry.id === fragment.resourceId);
  return resource ? inspectResourcePreviewAsync(fragment.resourceType, resource.data) : {
    status: "missing-fallback",
    mimeType: "application/octet-stream",
    dataUrl: null,
    summary: { resourceType: fragment.resourceType.trim(), resourceId: String(fragment.resourceId) },
    diagnostics: [{
      severity: "error",
      code: "browser.resource.not_found",
      message: `${fragment.resourceType} ${fragment.resourceId} was not found in ${filePath}.`,
      decoder: "browser-library",
      variant: "resource-fork-fragment"
    }]
  };
}

async function buildLibraryCatalogFromFiles(
  sourceName: string,
  files: BrowserLibraryFile[],
  sourceKind: BrowserLibrarySourceKind,
  managedPath: string,
  confidence: string
) {
  const sources: LibrarySource[] = [];
  const records: LibraryRecord[] = [];
  const entities: LibraryEntity[] = [];
  const assets: LibraryCatalog["assets"] = [];
  const diagnostics: LibraryCatalog["diagnostics"] = [];
  for (const file of files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
    const sourceToken = sourceKind === "divinity-import" ? "divinity" : sourceKind === "realmz-reference" ? "realmz" : "providence";
    const id = `library-source:${sourceToken}:${stableToken(file.relativePath)}`;
    sources.push({
      id,
      name: file.name,
      relativePath: file.relativePath,
      originalPath: `${sourceName}/${file.relativePath}`,
      sourceKind,
      role: roleForFile(file.name),
      bytes: file.bytes.byteLength,
      sha256: await sha256Hex(file.bytes),
      copiedTo: `${managedPath}/${sourceKind}/${file.relativePath}`,
      confidence
    });
    const family = familyFor(file.relativePath, file.name);
    const recordId = `library-record:${sourceKind}:${stableToken(file.relativePath)}`;
    records.push({
      id: recordId,
      source: id,
      type: "library-source",
      label: file.relativePath,
      editState: "inspect-only",
      byteRange: { start: 0, length: file.bytes.byteLength, endExclusive: file.bytes.byteLength },
      confidence,
      summary: {
        family: family.name,
        role: roleForFile(file.name),
        preview: hexPreview(file.bytes, 20)
      }
    });
    entities.push({
      id: `library-entity:${sourceKind}:${stableToken(file.relativePath)}`,
      type: family.entityType,
      label: family.label,
      source: id,
      recordRef: recordId,
      editState: "inspect-only",
      confidence,
      summary: {
        family: family.name,
        relativePath: file.relativePath,
        note: family.note
      }
    });
    addRecordSlots(sourceKind, id, file, records, entities, diagnostics, confidence);
    await addWholeFileAsset(sourceKind, id, file, assets);
    await addResourceEntries(sourceKind, id, file, records, entities, assets, diagnostics, confidence);
  }
  const catalog: LibraryCatalog = {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    importedAt: new Date().toISOString(),
    managedPath,
    sources,
    records,
    entities,
    assets,
    diagnostics,
    summary: {
      sourceCount: sources.length,
      recordCount: records.length,
      entityCount: entities.length,
      assetCount: assets.length,
      diagnosticCount: diagnostics.length
    }
  };
  decorateRuleCatalog(catalog);
  return catalog;
}

async function addWholeFileAsset(
  sourceKind: BrowserLibrarySourceKind,
  sourceId: string,
  file: BrowserLibraryFile,
  assets: LibraryCatalog["assets"]
) {
  if (sourceKind !== "providence-library" || !file.name.toLowerCase().endsWith(".mod")) return;
  const sha256 = await sha256Hex(file.bytes);
  if (!await isOutdoorMusicReplacement(file.bytes)) inspectStandardMod(file.bytes);
  assets.push({
    id: `library-asset:${sourceKind}:file:${stableToken(file.relativePath)}`,
    type: "music",
    label: file.name.replace(/\.mod$/i, ""),
    source: sourceId,
    relativePath: file.relativePath,
    bytes: file.bytes.byteLength,
    sha256,
    resourceType: "MOD ",
    resourceId: null,
    previewPath: file.name.toLowerCase() === "outdoor music.mod"
      ? OUTDOOR_MUSIC_REPLACEMENT_PATH
      : `/bundled-libraries/providence/${encodePath(file.relativePath.replace(/\\/g, "/"))}`,
    mimeType: "audio/x-mod"
  });
}

function mergeCatalogs(catalogs: LibraryCatalog[]): LibraryCatalog {
  const catalog: LibraryCatalog = {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    importedAt: new Date().toISOString(),
    managedPath: "browser-bundled://library",
    sources: catalogs.flatMap((entry) => entry.sources),
    records: catalogs.flatMap((entry) => entry.records),
    entities: catalogs.flatMap((entry) => entry.entities),
    assets: catalogs.flatMap((entry) => entry.assets),
    diagnostics: catalogs.flatMap((entry) => entry.diagnostics),
    summary: {
      sourceCount: 0,
      recordCount: 0,
      entityCount: 0,
      assetCount: 0,
      diagnosticCount: 0
    }
  };
  catalog.summary = {
    sourceCount: catalog.sources.length,
    recordCount: catalog.records.length,
    entityCount: catalog.entities.length,
    assetCount: catalog.assets.length,
    diagnosticCount: catalog.diagnostics.length
  };
  decorateRuleCatalog(catalog);
  return catalog;
}

async function readAllFiles(source: BrowserScenarioSource) {
  if (source.kind === "file-selection") return readFileSelection(source);
  return readDirectory(source);
}

async function readFileSelection(selection: BrowserFileSelection) {
  const files = [];
  for (const file of selection.files) {
    const relativePath = file.webkitRelativePath || file.name;
    files.push({
      name: relativePath.split(/[\\/]/).filter(Boolean).pop() ?? file.name,
      relativePath,
      bytes: new Uint8Array(await file.arrayBuffer())
    });
  }
  return files;
}

async function readDirectory(handle: BrowserDirectoryHandle, prefix = ""): Promise<Array<{ name: string; relativePath: string; bytes: Uint8Array }>> {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    const relativePath = prefix ? `${prefix}\\${name}` : name;
    if (entry.kind === "directory") {
      files.push(...await readDirectory(entry, relativePath));
    } else {
      const file = await entry.getFile();
      files.push({ name, relativePath, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
  }
  return files;
}

function addRecordSlots(
  sourceKind: BrowserLibrarySourceKind,
  sourceId: string,
  file: { name: string; relativePath: string; bytes: Uint8Array },
  records: LibraryRecord[],
  entities: LibraryEntity[],
  diagnostics: LibraryCatalog["diagnostics"],
  confidence: string
) {
  const layout = recordLayout(file.name);
  if (!layout) return;
  const [type, recordBytes] = layout;
  const full = Math.floor(file.bytes.byteLength / recordBytes);
  const trailing = file.bytes.byteLength % recordBytes;
  if (trailing > 0) {
    diagnostics.push({
      id: `library-diagnostic:${sourceKind}:trailing:${stableToken(file.relativePath)}`,
      type: "library-record-trailing-bytes",
      severity: "warning",
      message: `${file.relativePath} has ${trailing} trailing bytes after ${recordBytes}-byte ${type} records.`,
      source: sourceId,
      data: { recordBytes, trailingBytes: trailing }
    });
  }
  const limit = type === "item" ? Math.min(full, 1000) : Math.min(full, 512);
  for (let index = 0; index < limit; index += 1) {
    const start = index * recordBytes;
    const record = file.bytes.slice(start, start + recordBytes);
    const recordId = `library-record:${sourceKind}:${type}:${index}`;
    const summary = recordSummary(type, index, recordBytes, record, file.name);
    const label = recordLabel(type, index, summary);
    records.push({
      id: recordId,
      source: sourceId,
      type,
      label,
      editState: "inspect-only",
      byteRange: { start, length: recordBytes, endExclusive: start + recordBytes },
      confidence,
      summary
    });
    entities.push({
      id: `library-entity:${sourceKind}:${type}:${index}`,
      type,
      label,
      source: sourceId,
      recordRef: recordId,
      editState: "inspect-only",
      confidence,
      summary: { ...summary, sourceFile: file.relativePath }
    });
  }
}

async function addResourceEntries(
  sourceKind: BrowserLibrarySourceKind,
  sourceId: string,
  file: BrowserLibraryFile,
  records: LibraryRecord[],
  entities: LibraryEntity[],
  assets: LibraryCatalog["assets"],
  diagnostics: LibraryCatalog["diagnostics"],
  confidence: string
) {
  if (!isResourceFile(file.name)) return;
  const resources = parseResourceFork(file.bytes);
  if (resources.length === 0) {
    if (file.bytes.byteLength > 32) {
      diagnostics.push({
        id: `library-diagnostic:${sourceKind}:resource-empty:${stableToken(file.relativePath)}`,
        type: "resource-fork-empty",
        severity: "warning",
        message: `${file.relativePath} did not expose a readable Mac resource map.`,
        source: sourceId,
        data: { bytes: file.bytes.byteLength }
      });
    }
    return;
  }

  const typeCounts = new Map<string, { count: number; bytes: number; ids: number[] }>();
  for (const resource of resources) {
    const current = typeCounts.get(resource.resourceType) ?? { count: 0, bytes: 0, ids: [] };
    current.count += 1;
    current.bytes += resource.length;
    if (current.ids.length < 24) current.ids.push(resource.id);
    typeCounts.set(resource.resourceType, current);

    const resourceType = printableToken(resource.resourceType);
    const token = stableToken(`${file.relativePath}:${resourceType}:${resource.id}:${resource.name}`);
    const recordId = `library-record:${sourceKind}:resource:${token}`;
    const entityType = resourceEntityFamily(file, resource.resourceType);
    const label = resourceLabel(file, resource, entityType);
    const sha256 = await sha256Hex(resource.data);
    const summary = {
      ...resourcePayloadSummary(resource),
      type: resourceType,
      resourceId: resource.id,
      name: resource.name,
      attributes: resource.attributes,
      bytes: resource.length,
      offset: resource.offset,
      sha256,
      preview: hexPreview(resource.data, 20)
    };
    records.push({
      id: recordId,
      source: sourceId,
      type: "resource",
      label,
      editState: "inspect-only",
      byteRange: { start: resource.offset, length: resource.length, endExclusive: resource.offset + resource.length },
      confidence,
      summary
    });
    entities.push({
      id: `library-entity:${sourceKind}:resource:${token}`,
      type: entityType,
      label,
      source: sourceId,
      recordRef: recordId,
      editState: "inspect-only",
      confidence,
      summary
    });
    const assetType = resourceAssetType(resource.resourceType, entityType);
    if (assetType) {
      assets.push({
        id: `library-asset:${sourceKind}:resource:${token}`,
        type: assetType,
        label,
        source: sourceId,
        relativePath: `${file.relativePath}#${resourceType}:${resource.id}`,
        bytes: resource.length,
        sha256,
        resourceType,
        resourceId: resource.id,
        previewPath: null,
        mimeType: resourceMimeType(resource.resourceType)
      });
    }
  }

  for (const [resourceType, count] of typeCounts) {
    const token = stableToken(`${file.relativePath}:${resourceType}`);
    entities.push({
      id: `library-entity:${sourceKind}:resource-type:${token}`,
      type: "resource type",
      label: `${printableToken(resourceType)} resources`,
      source: sourceId,
      recordRef: null,
      editState: "inspect-only",
      confidence,
      summary: {
        type: printableToken(resourceType),
        count: count.count,
        totalBytes: count.bytes,
        ids: count.ids
      }
    });
  }
}

function resourceEntityFamily(file: BrowserLibraryFile, resourceType: string) {
  const family = familyFor(file.relativePath, file.name).name;
  if (family === "monster-mash" && resourceType === "cicn") return "monster-mash-icon";
  if (family === "vault-of-arcana" && resourceType === "cicn") return "vault-icon";
  if (family === "bag-of-holding" && resourceType === "cicn") return "bag-item";
  if (family === "special-land-tiles" && (resourceType === "PICT" || resourceType === "cicn")) return "special-land-tile";
  if (resourceType === "PICT") return "picture";
  if (resourceType === "cicn") return "icon-resource";
  if (resourceType === "snd ") return "sound";
  if (resourceType === "TEXT") return "text-resource";
  if (resourceType === "styl") return "style-resource";
  if (resourceType === "STR#") return "string-list-resource";
  if (resourceType === "RLMZ") return "realmz-metadata-resource";
  if (resourceType === "vers") return "version-resource";
  return "resource";
}

function resourceLabel(file: BrowserLibraryFile, resource: ResourceEntry, entityType: string) {
  const label = ENTITY_LABELS[entityType] ?? printableToken(resource.resourceType);
  const name = resource.name ? `: ${resource.name}` : "";
  if (entityType !== "resource") return `${label} ${resource.id}${name}`;
  return `${printableToken(resource.resourceType)} ${resource.id}${name || ` (${file.name})`}`;
}

function resourceAssetType(resourceType: string, entityType: string) {
  if (resourceType === "cicn" && entityType === "special-land-tile") return "icon";
  if (resourceType === "PICT" || entityType === "picture" || entityType === "special-land-tile") return "picture";
  if (resourceType === "cicn" || entityType.endsWith("-icon") || entityType === "icon-resource") return "icon";
  if (resourceType === "snd " || entityType === "sound") return "sound";
  if (resourceType === "TEXT" || entityType === "text-resource") return "text";
  return null;
}

function resourceMimeType(resourceType: string) {
  if (resourceType === "PICT" || resourceType === "cicn") return "image/png";
  if (resourceType === "snd ") return "audio/wav";
  if (resourceType === "TEXT" || resourceType === "STR#") return "text/plain";
  return "application/octet-stream";
}

function resourcePayloadSummary(resource: ResourceEntry) {
  if (resource.resourceType === "STR#") {
    const strings = parseStringListResource(resource.data);
    return { family: "string-list", stringCount: strings.length, strings };
  }
  if (resource.resourceType === "TEXT") {
    const text = decodeClassicTextBody(resource.data);
    const textOffsetBody = decodeClassicTextOffsetBody(resource.data);
    return {
      family: "text",
      text,
      textPreview: decodeClassicTextBody(resource.data.slice(0, 240)),
      textOffsetBody,
      textOffsetLength: textOffsetBody.length,
      textBytes: resource.length,
      textResourceBase64: bytesToBase64(resource.data)
    };
  }
  if (resource.resourceType === "styl") {
    return {
      family: "text-style",
      styleRunCountCandidate: u16At(resource.data, 0) ?? 0,
      styleBytes: resource.length,
      styleResourceBase64: bytesToBase64(resource.data)
    };
  }
  if (resource.resourceType === "snd ") {
    return { family: "sound", formatCandidate: i16At(resource.data, 0), commandCountCandidate: i16At(resource.data, 4) };
  }
  if (resource.resourceType === "RLMZ") {
    return { family: "realmz-metadata", shortPreview: shortPreview(resource.data), nonzeroBytes: nonzeroBytes(resource.data) };
  }
  if (resource.resourceType === "vers") {
    return {
      family: "version",
      majorMinor: resource.data[0] ?? null,
      stageAndRevision: resource.data[1] ?? null,
      region: i16At(resource.data, 2),
      versionText: decodeClassicText(resource.data.slice(Math.min(6, resource.data.length)))
    };
  }
  if (resource.resourceType === "PICT") {
    return {
      family: "picture",
      pictSizeWord: i16At(resource.data, 0),
      frame: resource.data.byteLength >= 10 ? {
        top: i16At(resource.data, 2),
        left: i16At(resource.data, 4),
        bottom: i16At(resource.data, 6),
        right: i16At(resource.data, 8)
      } : null
    };
  }
  if (resource.resourceType === "cicn") {
    return { family: "color-icon", iconBytes: resource.length };
  }
  return { family: "unknown-resource-family", nonzeroBytes: nonzeroBytes(resource.data) };
}

const ENTITY_LABELS: Record<string, string> = {
  "monster-mash-icon": "Monster Mash Icon",
  "vault-icon": "Vault Icon",
  "bag-item": "Bag Item",
  "special-land-tile": "Special Land Tile",
  picture: "Picture",
  "icon-resource": "Icon",
  sound: "Sound",
  "text-resource": "Text",
  "style-resource": "Style",
  "string-list-resource": "String List",
  "realmz-metadata-resource": "Realmz Metadata",
  "version-resource": "Version"
};

function bundledFolderForSource(source: string) {
  if (source.includes(":divinity:") || source.includes("divinity-import")) return "divinity";
  if (source.includes(":realmz:") || source.includes("realmz-reference")) return "realmz-reference";
  if (source.includes(":providence:") || source.includes("providence-library")) return "providence";
  return null;
}

function loadBundledFile(url: string, filePath: string) {
  if (!bundledFileCache.has(url)) {
    bundledFileCache.set(url, fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Bundled library file missing: ${filePath}`);
        return response.arrayBuffer();
      })
      .then((buffer) => new Uint8Array(buffer)));
  }
  return bundledFileCache.get(url)!;
}

function splitResourceFragment(relativePath: string) {
  const [filePath, fragment] = relativePath.split("#");
  if (!fragment) return [relativePath, null] as const;
  const separator = fragment.lastIndexOf(":");
  if (separator < 0) return [filePath, null] as const;
  const resourceId = Number(fragment.slice(separator + 1));
  if (!Number.isInteger(resourceId)) return [filePath, null] as const;
  return [filePath, { resourceType: fragment.slice(0, separator), resourceId }] as const;
}

function encodePath(path: string) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function familyFor(relativePath: string, name: string) {
  if (relativePath.includes("Monster Scrap Book")) return family("monster-scrapbook", "library-file", "Monster Scrapbook");
  if (relativePath.includes("Monster Mash")) return family("monster-mash", "library-file", "Monster Mash");
  if (relativePath.includes("Vault of Arcana")) return family("vault-of-arcana", "library-file", "Vault of Arcana");
  if (relativePath.includes("Bag of Holding")) return family("bag-of-holding", "library-file", "Bag of Holding");
  if (name === "Data ID") return family("items", "library-file", "Shared item catalog");
  if (name === "Data NI") return family("items", "library-file", "Supply and special item catalog");
  if (name === "Data Spell" || name === "Data S") return family("spells", "library-file", "Shared/custom spell catalog");
  if (name === "Data Race") return family("races", "library-file", "Shared/custom race catalog");
  if (name === "Data Caste") return family("castes", "library-file", "Shared/custom caste catalog");
  if (relativePath.includes("Land Archive") || name === "Data DES") return family("special-land-tiles", "library-file", "Special land tile library");
  if (isResourceFile(name)) return family("resource-fork", "library-file", relativePath);
  return family("library-file", "library-file", relativePath);
}

function family(name: string, entityType: string, label: string) {
  return {
    name,
    entityType,
    label,
    note: "Browser catalog inventory is inspect-only; desktop import preserves managed raw bytes."
  };
}

function recordLayout(name: string): [string, number] | null {
  if (name === "Monster Scrap Book") return ["monster-scrapbook-entry", 466];
  if (name === "Data ID" || name === "Data NI") return ["item", 100];
  if (name === "Data Race") return ["race", 408];
  if (name === "Data Caste") return ["caste", 576];
  if (name === "Data Spell") return ["spell", 30];
  if (name === "Data S") return ["spell", 30];
  return null;
}

function recordSummary(type: string, index: number, recordBytes: number, record: Uint8Array, sourceName: string) {
  const summary: Record<string, unknown> = {
    index,
    recordBytes,
    rawBytes: Array.from(record),
    preview: hexPreview(record, 20),
    note: "Built-in Realmz catalog record."
  };
  if (type === "item" && record.byteLength >= 100) {
    Object.assign(summary, itemRecordSummary(index, record, sourceName));
  } else if (type === "monster-scrapbook-entry" && record.byteLength >= 466) {
    Object.assign(summary, monsterRecordSummary(index, record));
  } else if (type === "spell" && record.byteLength >= 30) {
    Object.assign(summary, spellRecordSummary(index, record));
  } else if (type === "race" && record.byteLength >= 408) {
    Object.assign(summary, raceRecordSummary(index, record));
  } else if (type === "caste" && record.byteLength >= 576) {
    Object.assign(summary, casteRecordSummary(index, record));
  }
  return summary;
}

function monsterRecordSummary(index: number, record: Uint8Array) {
  return {
    displayName: decodeClassicText(record.slice(170, 210)) || `Monster ${index}`,
    description: decodePascalClassicText(record.slice(210, 466)),
    hitDice: record[0] ?? 0,
    staminaBonus: record[1] ?? 0,
    agility: record[2] ?? 0,
    movementMax: record[4] ?? 0,
    armor: signedByte(record[5] ?? 0),
    magicResistance: signedByte(record[6] ?? 0),
    distance: signedByte(record[7] ?? 0),
    size: signedByte(record[9] ?? 0),
    attackCount: signedByte(record[18] ?? 0),
    magicAttackCount: signedByte(record[19] ?? 0),
    attacks: Array.from({ length: 5 }, (_, row) => Array.from(record.slice(20 + row * 4, 24 + row * 4), signedByte)),
    damageBonus: signedByte(record[40] ?? 0),
    castPercent: signedByte(record[41] ?? 0),
    runPercent: signedByte(record[42] ?? 0),
    surrenderPercent: signedByte(record[43] ?? 0),
    missilePercent: signedByte(record[44] ?? 0),
    money: readI16s(record, 58, 3),
    spells: readI16s(record, 64, 10),
    items: readI16s(record, 84, 6),
    weapon: i16At(record, 96) ?? 0,
    iconId: i16At(record, 98) ?? 0,
    spellPoints: i16At(record, 100) ?? 0,
    exp: i16At(record, 102) ?? 0
  };
}

function decodePascalClassicText(bytes: Uint8Array) {
  const length = Math.min(bytes[0] ?? 0, Math.max(0, bytes.byteLength - 1));
  return decodeClassicText(bytes.slice(1, 1 + length));
}

function recordLabel(type: string, index: number, summary: Record<string, unknown>) {
  if (type === "item" && typeof summary.itemId === "number") {
    const category = typeof summary.category === "string" ? summary.category : "Item";
    return `${category} ${summary.itemId}`;
  }
  if (typeof summary.displayName === "string" && summary.displayName) return summary.displayName;
  if (typeof summary.packedSpellId === "number") return `Spell ${summary.packedSpellId}`;
  if (type === "race") return `Race ${index}`;
  if (type === "caste") return `Caste ${index}`;
  return `${title(type)} ${index}`;
}

function decorateRuleCatalog(catalog: LibraryCatalog) {
  const stringsById = new Map<number, string[]>();
  for (const entity of catalog.entities) {
    if (entity.type !== "string-list-resource") continue;
    const resourceId = typeof entity.summary.resourceId === "number" ? entity.summary.resourceId : null;
    const strings = Array.isArray(entity.summary.strings) ? entity.summary.strings.filter((value): value is string => typeof value === "string") : [];
    if (resourceId !== null && strings.length > 0) stringsById.set(resourceId, strings);
  }
  const decorate = (entry: { type?: string; label: string; summary: Record<string, unknown> }) => {
    if (entry.type === "spell") {
      const resourceId = typeof entry.summary.spellNameResourceId === "number" ? entry.summary.spellNameResourceId : null;
      const slot = typeof entry.summary.spellSlot === "number" ? entry.summary.spellSlot : null;
      const name = resourceId !== null && slot !== null ? stringsById.get(resourceId)?.[slot] : null;
      if (name) {
        entry.summary.displayName = name;
        entry.label = `${entry.summary.packedSpellId ?? "Spell"} ${name}`;
      }
    } else if (entry.type === "race") {
      const number = typeof entry.summary.raceNumber === "number" ? entry.summary.raceNumber : null;
      const name = number !== null ? stringsById.get(129)?.[number - 1] : null;
      if (name) {
        entry.summary.displayName = name;
        entry.label = name;
      }
    } else if (entry.type === "caste") {
      const number = typeof entry.summary.casteNumber === "number" ? entry.summary.casteNumber : null;
      const name = number !== null ? stringsById.get(131)?.[number - 1] : null;
      if (name) {
        entry.summary.displayName = name;
        entry.label = name;
      }
    }
  };
  catalog.records.forEach(decorate);
  catalog.entities.forEach(decorate);
}

function spellRecordSummary(index: number, record: Uint8Array) {
  const spellcasterClass = Math.floor(index / 105);
  const withinClass = index % 105;
  const levelIndex = Math.floor(withinClass / 15);
  const spellSlot = withinClass % 15;
  const packedSpellId = (spellcasterClass + 1) * 1000 + (levelIndex + 1) * 100 + spellSlot + 1;
  return {
    packedSpellId,
    spellcasterClass,
    spellLevel: levelIndex + 1,
    spellSlot,
    visibleSpellSlot: spellSlot < 12,
    spellNameResourceId: (spellcasterClass + 1) * 1000 + levelIndex,
    range1: record[0],
    range2: record[1],
    queueIcon: record[2],
    toHitBonus: signedByte(record[3]),
    saveBonus: signedByte(record[4]),
    fixedTargetNum: record[5],
    canRotate: record[6],
    saveAdjust: signedByte(record[7]),
    cannot: record[8],
    resistAdjust: signedByte(record[9]),
    cost: record[10],
    damage1: record[11],
    damage2: record[12],
    powerDamage1: record[13],
    powerDamage2: record[14],
    duration1: record[15],
    duration2: record[16],
    powerDuration1: record[17],
    powerDuration2: record[18],
    spellLook1: record[19],
    spellLook2: record[20],
    sound1: record[21],
    sound2: record[22],
    targetType: record[23],
    size: record[24],
    special: record[25],
    damageType: record[26],
    spellClass: record[27],
    inCombat: record[28] !== 0,
    inCamp: record[29] !== 0
  };
}

function raceRecordSummary(index: number, record: Uint8Array) {
  return {
    raceNumber: index + 1,
    plusMinusToHit: readI16s(record, 0, 8),
    specialAbility: readI16s(record, 16, 14),
    drvBonus: readI16s(record, 44, 8),
    attBonus: readI16s(record, 60, 6),
    minMax: readI16s(record, 72, 12),
    conditions: readI16s(record, 112, 40),
    maxAge: i16At(record, 192),
    doesNotDie: i16At(record, 194),
    baseMove: i16At(record, 196),
    magRes: i16At(record, 198),
    twoHand: i16At(record, 200),
    missile: i16At(record, 202),
    numOfAttacks: readI16s(record, 204, 2),
    canCaste: Array.from(record.slice(208, 238)),
    ageRange: Array.from({ length: 5 }, (_, band) => readI16s(record, 238 + band * 4, 2)),
    ageChange: Array.from({ length: 5 }, (_, band) => Array.from(record.slice(258 + band * 15, 258 + (band + 1) * 15)).map(signedByte)),
    canRegenerate: record[333],
    defaultIconSet: i16At(record, 334),
    itemTypes: [i32At(record, 336), i32At(record, 340)],
    descriptors: i16At(record, 344)
  };
}

function casteRecordSummary(index: number, record: Uint8Array) {
  return {
    casteNumber: index + 1,
    specialAbility: [readI16s(record, 0, 14), readI16s(record, 28, 14)],
    drvBonus: readI16s(record, 56, 8),
    attBonus: readI16s(record, 72, 6),
    spellcasters: Array.from({ length: 4 }, (_, row) => readI16s(record, 84 + row * 6, 3)),
    minMax: readI16s(record, 108, 12),
    conditions: readI16s(record, 132, 40),
    canUseMissile: i16At(record, 212),
    getsMissileBonus: i16At(record, 214),
    stamina: readI16s(record, 216, 2),
    strength: readI16s(record, 220, 2),
    dodge: readI16s(record, 224, 2),
    toHit: readI16s(record, 228, 2),
    missile: readI16s(record, 232, 2),
    hand2Hand: readI16s(record, 236, 2),
    casteClass: i16At(record, 248),
    minimumAgeGroup: i16At(record, 250),
    moveBonus: i16At(record, 252),
    magRes: i16At(record, 254),
    twoHand: i16At(record, 256),
    maxStaminaBonus: i16At(record, 258),
    bonusAttacks: i16At(record, 260),
    maxAttacks: i16At(record, 262),
    victory: readI32s(record, 264, 30),
    startMoney: i16At(record, 384),
    startItems: readI16s(record, 386, 20),
    attacks: Array.from(record.slice(426, 436)),
    itemTypes: [i32At(record, 436), i32At(record, 440)],
    defaultIcon: i16At(record, 444),
    maxSpellsAttacks: i16At(record, 446),
    spellsSoFar: i16At(record, 448)
  };
}

function readI16s(record: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => i16At(record, offset + index * 2));
}

function readI32s(record: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => i32At(record, offset + index * 4));
}

function signedByte(value: number | undefined) {
  const byte = value ?? 0;
  return byte > 127 ? byte - 256 : byte;
}

function itemRecordSummary(index: number, record: Uint8Array, sourceName: string) {
  const baseId = sourceName === "Data NI" ? 800 : 0;
  const itemNumber = baseId + index;
  const categoryIndex = Math.floor(itemNumber / 200);
  const categorySlot = itemNumber % 200;
  const category = itemCategory(categoryIndex);
  const fallbackId = itemNumber;
  const storedId = i16At(record, 2);
  const itemId = storedId !== 0 ? storedId : fallbackId;
  return {
    itemId,
    category,
    categorySlot,
    sourceFile: sourceName,
    scenarioLocal: sourceName === "Data NI",
    divinityEditableRange: itemId >= 900 && itemId <= 999,
    st: i16At(record, 0),
    storedItemId: storedId,
    iconId: i16At(record, 4),
    type: i16At(record, 6),
    blunt: i16At(record, 8),
    hands: i16At(record, 10),
    lu: i16At(record, 12),
    movement: i16At(record, 14),
    ac: i16At(record, 16),
    magicResistance: i16At(record, 18),
    damage: i16At(record, 20),
    spellPoints: i16At(record, 22),
    sound: i16At(record, 24),
    weight: i16At(record, 26),
    cost: i16At(record, 28),
    charge: i16At(record, 30),
    cursedItemId: i16At(record, 32),
    magical: i16At(record, 34),
    itemCat0: i32At(record, 36),
    itemCat1: i32At(record, 40),
    raceRestrictions: i16At(record, 44),
    casteRestrictions: i16At(record, 46),
    specificRace: i16At(record, 48),
    specificCaste: i16At(record, 50),
    raceClassOnly: i16At(record, 52),
    casteClassOnly: i16At(record, 54),
    vSmall: i16At(record, 70),
    vLarge: i16At(record, 72),
    heat: i16At(record, 74),
    cold: i16At(record, 76),
    electric: i16At(record, 78),
    vsUndead: i16At(record, 80),
    vsDemonDevil: i16At(record, 82),
    vsEvil: i16At(record, 84),
    special1: i16At(record, 86),
    special2: i16At(record, 88),
    special3: i16At(record, 90),
    special4: i16At(record, 92),
    special5: i16At(record, 94),
    weightPerCharge: i16At(record, 96),
    dropOnEmpty: i16At(record, 98)
  };
}

function itemCategory(categoryIndex: number) {
  switch (categoryIndex) {
    case 0:
      return "Weapon";
    case 1:
      return "Armor";
    case 2:
      return "Accessory";
    case 3:
      return "Magic";
    case 4:
      return "Supply / Special";
    default:
      return "Item";
  }
}

function roleForFile(name: string) {
  if (isResourceFile(name)) return "resource-fork";
  if (["Data ID", "Data NI", "Data Spell", "Data S", "Data Race", "Data Caste"].includes(name)) return "shared-data";
  if (name.startsWith("Data ")) return "template-data";
  return "library-file";
}

function isResourceFile(name: string) {
  return name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function stableToken(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function sha256Hex(bytes: Uint8Array) {
  if (crypto.subtle) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `bytes-${bytes.byteLength}`;
}

function hexPreview(bytes: Uint8Array, limit: number) {
  return [...bytes.slice(0, limit)].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function title(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function u32At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function i32At(bytes: Uint8Array, offset: number) {
  const value = u32At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x80000000 ? value - 0x100000000 : value;
}

function u16At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16At(bytes: Uint8Array, offset: number) {
  const value = u16At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function decodeClassicText(bytes: Uint8Array) {
  const nul = bytes.indexOf(0);
  const slice = nul >= 0 ? bytes.slice(0, nul) : bytes;
  let output = "";
  let lastSpace = false;
  for (const byte of slice) {
    const ch = byte <= 31 ? " " : String.fromCharCode(byte);
    if (/\s/.test(ch)) {
      if (!lastSpace) output += " ";
      lastSpace = true;
    } else {
      output += ch;
      lastSpace = false;
    }
  }
  return output.trim();
}

function decodeClassicTextBody(bytes: Uint8Array) {
  const nul = bytes.indexOf(0);
  const slice = nul >= 0 ? bytes.slice(0, nul) : bytes;
  return Array.from(slice)
    .map((byte) => {
      if (byte === 13) return "\n";
      if (byte === 9) return "\t";
      if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
      return " ";
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeClassicTextOffsetBody(bytes: Uint8Array) {
  const nul = bytes.indexOf(0);
  const slice = nul >= 0 ? bytes.slice(0, nul) : bytes;
  return Array.from(slice)
    .map((byte) => {
      if (byte === 13 || byte === 10) return "\n";
      if (byte === 9) return "\t";
      if (byte >= 32) return String.fromCharCode(byte);
      return " ";
    })
    .join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 8192));
  }
  return btoa(binary);
}

function shortPreview(bytes: Uint8Array) {
  const shorts = [];
  for (let offset = 0; offset + 1 < Math.min(bytes.byteLength, 24); offset += 2) {
    shorts.push(i16At(bytes, offset));
  }
  return shorts;
}

function nonzeroBytes(bytes: Uint8Array) {
  let count = 0;
  for (const byte of bytes) {
    if (byte !== 0) count += 1;
  }
  return count;
}

function printableToken(value: string) {
  return [...value].map((ch) => {
    if ((ch >= "!" && ch <= "~") || ch === " ") return ch;
    return "?";
  }).join("");
}
