import { LibraryCatalog, LibraryEntity, LibraryRecord, LibrarySource, ProvidenceWorkspace } from "../types";
import { BrowserDirectoryHandle, BrowserFileSelection, BrowserScenarioSource } from "./fsAccess";
import { previewResourceDataUrl } from "./resourcePreview";

export const BROWSER_WORKSPACE_PATH = "browser://workspace";
const LIBRARY_SCHEMA_VERSION = 2;
const bundledResourceCache = new Map<string, Promise<ResourceEntry[]>>();
const bundledPreviewCache = new Map<string, Promise<string | null>>();
type BrowserLibraryFile = { name: string; relativePath: string; bytes: Uint8Array };
type BrowserLibrarySourceKind = "divinity-import" | "realmz-reference";
type ResourceEntry = {
  resourceType: string;
  id: number;
  name: string;
  attributes: number;
  refOffset: number;
  nameOffset: number | null;
  dataRelativeOffset: number;
  offset: number;
  length: number;
  data: Uint8Array;
};

const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;

export function createBrowserWorkspace(catalog: LibraryCatalog | null = null): ProvidenceWorkspace {
  return {
    schemaVersion: 1,
    appVersion: "browser-preview",
    workspacePath: BROWSER_WORKSPACE_PATH,
    managedLibraryPath: "browser://workspace/library",
    referenceRoots: {
      divinity: "F:\\Divinity CD\\Divinity CD\\Install Options\\World of Realmz\\Divinity",
      realmzData: "F:\\Realmz\\base\\Realmz\\Data Files",
      newScenario: "F:\\Realmz\\base\\Realmz\\Scenarios\\New Scenario"
    },
    recentProjects: [],
    activeLibraryCatalog: catalog,
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
  for (const sourceKind of ["divinity-import", "realmz-reference"] as const) {
    const folder = sourceKind === "divinity-import" ? "divinity" : "realmz-reference";
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
  return mergeCatalogs(catalogs);
}

export async function importBrowserLibrary(source: BrowserScenarioSource, sourceKind: BrowserLibrarySourceKind) {
  const files = await readAllFiles(source);
  return buildLibraryCatalogFromFiles(source.name, files, sourceKind, "browser-memory://library", "browser-fallback");
}

export async function loadBrowserBundledLibraryAssetPreview(asset: LibraryCatalog["assets"][number]) {
  if (asset.previewPath) return asset.previewPath;
  const folder = bundledFolderForSource(asset.source);
  if (!folder) return null;
  const [filePath, fragment] = splitResourceFragment(asset.relativePath);
  if (!fragment) return null;
  const cacheKey = `${folder}:${asset.relativePath}`;
  if (!bundledPreviewCache.has(cacheKey)) {
    bundledPreviewCache.set(cacheKey, loadBrowserBundledResourcePreview(folder, filePath, fragment));
  }
  return bundledPreviewCache.get(cacheKey) ?? null;
}

async function loadBrowserBundledResourcePreview(folder: string, filePath: string, fragment: { resourceType: string; resourceId: number }) {
  const url = `/bundled-libraries/${folder}/${encodePath(filePath.replace(/\\/g, "/"))}`;
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
  return resource ? previewResourceDataUrl(fragment.resourceType, resource.data) : null;
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
    const id = `library-source:${sourceKind === "divinity-import" ? "divinity" : "realmz"}:${stableToken(file.relativePath)}`;
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
  return catalog;
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
  for (let index = 0; index < Math.min(full, 512); index += 1) {
    const start = index * recordBytes;
    const recordId = `library-record:${sourceKind}:${type}:${index}`;
    records.push({
      id: recordId,
      source: sourceId,
      type,
      label: `${title(type)} ${index}`,
      editState: "inspect-only",
      byteRange: { start, length: recordBytes, endExclusive: start + recordBytes },
      confidence,
      summary: { index, recordBytes, preview: hexPreview(file.bytes.slice(start, start + recordBytes), 20) }
    });
    entities.push({
      id: `library-entity:${sourceKind}:${type}:${index}`,
      type,
      label: `${title(type)} ${index}`,
      source: sourceId,
      recordRef: recordId,
      editState: "inspect-only",
      confidence,
      summary: { index, sourceFile: file.relativePath, recordBytes }
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

function parseResourceFork(original: Uint8Array): ResourceEntry[] {
  const buffer = extractResourceFork(original);
  if (buffer.byteLength < 32) return [];
  const dataOffset = u32At(buffer, 0);
  const mapOffset = u32At(buffer, 4);
  if (dataOffset === null || mapOffset === null || mapOffset + 28 > buffer.byteLength) return [];
  const typeListRelativeOffset = u16At(buffer, mapOffset + 24);
  const nameListRelativeOffset = u16At(buffer, mapOffset + 26);
  if (typeListRelativeOffset === null || nameListRelativeOffset === null) return [];
  const typeListOffset = mapOffset + typeListRelativeOffset;
  const nameListOffset = mapOffset + nameListRelativeOffset;
  if (typeListOffset + 2 > buffer.byteLength) return [];
  const rawTypeCount = u16At(buffer, typeListOffset);
  if (rawTypeCount === null) return [];

  const resources: ResourceEntry[] = [];
  for (let typeIndex = 0; typeIndex <= rawTypeCount; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.byteLength) continue;
    const resourceType = decodeAscii(buffer.slice(typeOffset, typeOffset + 4));
    const rawResourceCount = u16At(buffer, typeOffset + 4);
    const refListRelativeOffset = u16At(buffer, typeOffset + 6);
    if (rawResourceCount === null || refListRelativeOffset === null) continue;
    const refListOffset = typeListOffset + refListRelativeOffset;
    for (let refIndex = 0; refIndex <= rawResourceCount; refIndex += 1) {
      const refOffset = refListOffset + refIndex * 12;
      if (refOffset + 12 > buffer.byteLength) continue;
      const id = i16At(buffer, refOffset);
      const nameRelativeOffset = i16At(buffer, refOffset + 2);
      let name = "";
      let nameOffset: number | null = null;
      if (nameRelativeOffset >= 0) {
        nameOffset = nameListOffset + nameRelativeOffset;
        if (nameOffset < buffer.byteLength) {
          const length = buffer[nameOffset] ?? 0;
          const end = Math.min(nameOffset + 1 + length, buffer.byteLength);
          name = decodeClassicText(buffer.slice(nameOffset + 1, end));
        }
      }
      const dataRelativeOffset = ((buffer[refOffset + 5] ?? 0) << 16) | ((buffer[refOffset + 6] ?? 0) << 8) | (buffer[refOffset + 7] ?? 0);
      const lengthOffset = dataOffset + dataRelativeOffset;
      const length = u32At(buffer, lengthOffset);
      if (length === null || lengthOffset + 4 + length > buffer.byteLength) continue;
      const offset = lengthOffset + 4;
      resources.push({
        resourceType,
        id,
        name,
        attributes: buffer[refOffset + 4] ?? 0,
        refOffset,
        nameOffset,
        dataRelativeOffset,
        offset,
        length,
        data: buffer.slice(offset, offset + length)
      });
    }
  }
  return resources;
}

function extractResourceFork(buffer: Uint8Array) {
  if (buffer.byteLength < 26) return buffer;
  const magic = u32At(buffer, 0);
  if (magic !== APPLE_SINGLE_MAGIC && magic !== APPLE_DOUBLE_MAGIC) return buffer;
  const entryCount = u16At(buffer, 24);
  if (entryCount === null) return buffer;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    const entryId = u32At(buffer, entryOffset);
    const offset = u32At(buffer, entryOffset + 4);
    const length = u32At(buffer, entryOffset + 8);
    if (entryId === RESOURCE_FORK_ENTRY_ID && offset !== null && length !== null && offset + length <= buffer.byteLength) {
      return buffer.slice(offset, offset + length);
    }
  }
  return buffer;
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
    const text = decodeClassicText(resource.data);
    return { family: "text", text, textPreview: decodeClassicText(resource.data.slice(0, 240)) };
  }
  if (resource.resourceType === "styl") {
    return { family: "text-style", styleRunCountCandidate: u16At(resource.data, 0) ?? 0, styleBytes: resource.length };
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
  return null;
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
  if (name === "Monster Scrap Book") return ["monster-scrapbook-entry", 210];
  if (name === "Data ID") return ["item", 400];
  if (name === "Data Race") return ["race", 288];
  if (name === "Data Caste") return ["caste", 288];
  if (name === "Data Spell") return ["spell", 112];
  if (name === "Data S") return ["spell", 126];
  return null;
}

function roleForFile(name: string) {
  if (isResourceFile(name)) return "resource-fork";
  if (["Data ID", "Data Spell", "Data S", "Data Race", "Data Caste"].includes(name)) return "shared-data";
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

function u16At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16At(bytes: Uint8Array, offset: number) {
  const value = u16At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function decodeAscii(bytes: Uint8Array) {
  return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
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

function parseStringListResource(bytes: Uint8Array) {
  const count = u16At(bytes, 0);
  if (count === null) return [];
  const strings: string[] = [];
  let offset = 2;
  for (let index = 0; index < count; index += 1) {
    if (offset >= bytes.byteLength) break;
    const length = bytes[offset] ?? 0;
    offset += 1;
    if (offset + length > bytes.byteLength) break;
    strings.push(decodeClassicText(bytes.slice(offset, offset + length)));
    offset += length;
  }
  return strings;
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
