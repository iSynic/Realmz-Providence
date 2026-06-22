import { CustomMapStamp, Project, QuestContextSource, QuestThread, TilePalette } from "../types";

export function createTilePalette(project: Project, command: { id?: string; name: string; tiles?: number[] }) {
  const metadata = normalizedEditorMetadata(project);
  const now = new Date().toISOString();
  const name = normalizePaletteName(command.name, metadata.tilePalettes.length + 1);
  const palette: TilePalette = {
    id: uniquePaletteId(metadata.tilePalettes, command.id ?? paletteIdFromName(name)),
    name,
    tiles: uniqueTiles(command.tiles ?? []),
    createdAt: now,
    updatedAt: now
  };
  return {
    ...project,
    editorMetadata: {
      ...metadata,
      tilePalettes: [...metadata.tilePalettes, palette]
    }
  };
}

export function renameTilePalette(project: Project, paletteId: string, name: string) {
  const metadata = normalizedEditorMetadata(project);
  const nextName = name.trim();
  if (!nextName) return project;
  let changed = false;
  const tilePalettes = metadata.tilePalettes.map((palette) => {
    if (palette.id !== paletteId || palette.name === nextName) return palette;
    changed = true;
    return { ...palette, name: nextName, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...project, editorMetadata: { ...metadata, tilePalettes } } : project;
}

export function deleteTilePalette(project: Project, paletteId: string) {
  const metadata = normalizedEditorMetadata(project);
  const tilePalettes = metadata.tilePalettes.filter((palette) => palette.id !== paletteId);
  return tilePalettes.length === metadata.tilePalettes.length
    ? project
    : { ...project, editorMetadata: { ...metadata, tilePalettes } };
}

export function updateTilePaletteTiles(project: Project, paletteId: string, tiles: number[]) {
  return updatePalette(project, paletteId, (palette) => ({ ...palette, tiles: uniqueTiles(tiles) }));
}

export function addTileToPalette(project: Project, paletteId: string, tile: number) {
  const normalized = normalizeTile(tile);
  if (normalized == null) return project;
  return updatePalette(project, paletteId, (palette) => {
    if (palette.tiles.includes(normalized)) return palette;
    return { ...palette, tiles: [...palette.tiles, normalized] };
  });
}

export function removeTileFromPalette(project: Project, paletteId: string, tile: number) {
  const normalized = normalizeTile(tile);
  if (normalized == null) return project;
  return updatePalette(project, paletteId, (palette) => {
    const tiles = palette.tiles.filter((candidate) => candidate !== normalized);
    return tiles.length === palette.tiles.length ? palette : { ...palette, tiles };
  });
}

export function normalizedEditorMetadata(project: Project): Project["editorMetadata"] {
  return {
    displayNames: project.editorMetadata?.displayNames ?? {},
    tilePalettes: normalizePalettes(project.editorMetadata?.tilePalettes ?? []),
    mapStamps: normalizeMapStamps(project.editorMetadata?.mapStamps ?? []),
    questThreads: normalizeQuestThreads(project.editorMetadata?.questThreads ?? []),
    questContextSources: normalizeQuestContextSources(project.editorMetadata?.questContextSources ?? [])
  };
}

function updatePalette(project: Project, paletteId: string, update: (palette: TilePalette) => TilePalette) {
  const metadata = normalizedEditorMetadata(project);
  let changed = false;
  const tilePalettes = metadata.tilePalettes.map((palette) => {
    if (palette.id !== paletteId) return palette;
    const next = update(palette);
    if (next === palette || palettesEqual(next, palette)) return palette;
    changed = true;
    return { ...next, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...project, editorMetadata: { ...metadata, tilePalettes } } : project;
}

function normalizePalettes(palettes: TilePalette[]) {
  const used = new Set<string>();
  return palettes.map((palette, index) => {
    const name = normalizePaletteName(palette.name, index + 1);
    const id = uniqueIdWithinSet(used, palette.id?.trim() || paletteIdFromName(name));
    return {
      ...palette,
      id,
      name,
      tiles: uniqueTiles(palette.tiles ?? []),
      createdAt: palette.createdAt || new Date(0).toISOString(),
      updatedAt: palette.updatedAt || palette.createdAt || new Date(0).toISOString()
    };
  });
}

function uniqueTiles(tiles: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const tile of tiles) {
    const normalized = normalizeTile(tile);
    if (normalized == null || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeTile(tile: number) {
  if (!Number.isFinite(tile)) return null;
  return Math.trunc(tile);
}

function normalizeMapStamps(stamps: CustomMapStamp[]) {
  const used = new Set<string>();
  return stamps.map((stamp, index) => {
    const name = normalizeStampName(stamp.name, index + 1);
    const id = uniqueIdWithinSet(used, stamp.id?.trim() || stampIdFromName(name));
    const width = normalizeDimension(stamp.width);
    const height = normalizeDimension(stamp.height);
    return {
      ...stamp,
      id,
      name,
      width,
      height,
      cells: normalizeStampCells(stamp.cells ?? [], width, height),
      createdAt: stamp.createdAt || new Date(0).toISOString(),
      updatedAt: stamp.updatedAt || stamp.createdAt || new Date(0).toISOString()
    };
  });
}

function normalizeStampCells(cells: CustomMapStamp["cells"], width: number, height: number) {
  const out: CustomMapStamp["cells"] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const x = normalizeTile(cell.x);
    const y = normalizeTile(cell.y);
    const tile = normalizeTile(cell.tile);
    if (x == null || y == null || tile == null || x < 0 || y < 0 || x >= width || y >= height) continue;
    const key = `${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, tile });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeQuestThreads(threads: QuestThread[]) {
  const used = new Set<string>();
  return threads.map((thread, index) => {
    const name = normalizeQuestThreadName(thread.name, index + 1);
    const id = uniqueIdWithinSet(used, thread.id?.trim() || questThreadIdFromName(name));
    return {
      ...thread,
      id,
      name,
      description: thread.description ?? "",
      questIds: uniqueQuestIds(thread.questIds ?? []),
      contextRefs: normalizeQuestContextRefs(thread.contextRefs ?? []),
      createdAt: thread.createdAt || new Date(0).toISOString(),
      updatedAt: thread.updatedAt || thread.createdAt || new Date(0).toISOString(),
      source: thread.source === "bundled" ? "bundled" as const : "user" as const
    };
  });
}

function normalizeQuestContextSources(sources: QuestContextSource[]) {
  const used = new Set<string>();
  return sources.map((source, index) => {
    const title = source.title?.trim() || `Quest Context Source ${index + 1}`;
    const id = uniqueIdWithinSet(used, source.id?.trim() || questContextSourceIdFromTitle(title));
    return {
      ...source,
      id,
      title,
      sourceType: source.sourceType ?? "manual",
      scenarioSlug: source.scenarioSlug?.trim() || undefined,
      sourceUrl: source.sourceUrl?.trim() || undefined,
      sourcePath: source.sourcePath?.trim() || undefined,
      fetchedAt: source.fetchedAt || undefined,
      contentHash: source.contentHash?.trim() || "",
      sections: (source.sections ?? []).map((section, sectionIndex) => ({
        id: section.id?.trim() || `${id}:section:${sectionIndex + 1}`,
        title: section.title?.trim() || `Section ${sectionIndex + 1}`,
        snippet: section.snippet?.trim() || "",
        terms: uniqueStrings(section.terms ?? [])
      })).filter((section) => section.snippet || section.terms.length > 0)
    };
  });
}

function normalizeQuestContextRefs(refs: QuestThread["contextRefs"]) {
  return (refs ?? []).map((ref) => ({
    sourceId: ref.sourceId?.trim() || "",
    sectionId: ref.sectionId?.trim() || undefined,
    label: ref.label?.trim() || "Quest context",
    snippet: ref.snippet?.trim() || undefined,
    terms: uniqueStrings(ref.terms ?? [])
  })).filter((ref) => ref.sourceId || ref.snippet || ref.terms.length > 0);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out.slice(0, 24);
}

function uniqueQuestIds(questIds: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const questId of questIds) {
    const normalized = normalizeQuestId(questId);
    if (normalized == null || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeQuestId(questId: number) {
  if (!Number.isFinite(questId)) return null;
  const normalized = Math.trunc(questId);
  return normalized >= 0 ? normalized : null;
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(32, Math.trunc(value)));
}

function normalizePaletteName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Palette ${index}`;
}

function normalizeStampName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Stamp ${index}`;
}

function normalizeQuestThreadName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Quest Thread ${index}`;
}

function paletteIdFromName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `tile-palette:${slug || "palette"}`;
}

function stampIdFromName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `map-stamp:${slug || "stamp"}`;
}

function questThreadIdFromName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `quest-thread:${slug || "thread"}`;
}

function questContextSourceIdFromTitle(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `quest-context:${slug || "source"}`;
}

function uniquePaletteId(palettes: TilePalette[], preferred: string) {
  return uniqueIdWithinSet(new Set(palettes.map((palette) => palette.id)), preferred);
}

function uniqueIdWithinSet(used: Set<string>, preferred: string) {
  const base = preferred.trim() || "tile-palette:palette";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function palettesEqual(a: TilePalette, b: TilePalette) {
  return a.id === b.id &&
    a.name === b.name &&
    a.tiles.length === b.tiles.length &&
    a.tiles.every((tile, index) => tile === b.tiles[index]);
}
