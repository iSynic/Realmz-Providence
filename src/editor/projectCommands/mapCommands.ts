import { LevelType, MapEntity, MapMarker, MapRecord, PaintCellChange, Project, ProjectCommand, Provenance, RandomLevel, RandomRect, TileAttributeFlag, TileAttributeProfile, TilesetAsset } from "../types";

const MAP_SIZE = 90;
const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
const RANDOM_LEVEL_BYTES = 644;
const RANDOM_LEVEL_WORDS = RANDOM_LEVEL_BYTES / 2;
const RANDOM_RECTS_PER_LEVEL = 20;
const MAP_RECORD_BYTES = 340;
const MAP_RECORD_MARKERS = 10;
const MAP_RECORD_MARKER_BYTES = 6;
const LAND_LAYOUT_ROWS = 8;
const LAND_LAYOUT_COLS = 16;

export function paintTiles(project: Project, mapId: string, cells: PaintCellChange[]) {
  if (cells.length === 0) return project;
  let projectChanged = false;
  const maps = project.maps.map((map) => {
    if (map.id !== mapId) return map;
    const tiles = [...map.tiles];
    let mapChanged = false;
    for (const cell of cells) {
      if (cell.index < 0 || cell.index >= tiles.length) continue;
      if (tiles[cell.index] === cell.to) continue;
      tiles[cell.index] = cell.to;
      mapChanged = true;
    }
    if (!mapChanged) return map;
    projectChanged = true;
    return { ...map, tiles };
  });
  return projectChanged ? { ...project, maps } : project;
}

export function createMap(project: Project, command: Extract<ProjectCommand, { kind: "createMap" }>) {
  const index = nextMapIndex(project, command.levelType);
  const map = authoredMap(command.levelType, index, null);
  const randomLevel = syncMapRenderForRandomLevel(authoredRandomLevel(command.levelType, index, map.render.landlook ?? -1));
  return {
    ...project,
    maps: [...project.maps, map],
    randomLevels: upsertRandomLevel(project.randomLevels, randomLevel),
    assetCatalog: ensureMapTileset(project, map)
  };
}

export function duplicateMap(project: Project, command: Extract<ProjectCommand, { kind: "duplicateMap" }>) {
  const source = project.maps.find((map) => map.id === command.mapId);
  if (!source) return project;
  const index = nextMapIndex(project, source.levelType);
  const map = authoredMap(source.levelType, index, source);
  const randomLevel = syncMapRenderForRandomLevel(authoredRandomLevel(source.levelType, index, source.render.landlook ?? defaultLandlook(source.levelType)));
  return {
    ...project,
    maps: [...project.maps, map],
    randomLevels: upsertRandomLevel(project.randomLevels, randomLevel),
    assetCatalog: ensureMapTileset(project, map)
  };
}

export function updateRandomLevelSettings(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateRandomLevelSettings" }>
) {
  const nextLevel = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const level = {
    ...nextLevel,
    ...command.fields
  };
  return replaceRandomLevel(project, syncMapRenderForRandomLevel(level));
}

export function updateMapRecord(project: Project, id: number, changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) {
  let changed = false;
  const mapRecords = (project.mapRecords ?? []).map((record) => {
    if (record.id !== id) return record;
    changed = true;
    const next: MapRecord = {
      ...record,
      ...changes,
      rect: changes.rect ? { ...record.rect, ...changes.rect } : record.rect,
      authored: true
    };
    return { ...next, rawBytes: mapRecordRawBytes(next) };
  });
  return changed ? { ...project, mapRecords } : project;
}

export function ensureLandLayout(project: Project) {
  if (project.landLayout) return project;
  return {
    ...project,
    landLayout: {
      rows: LAND_LAYOUT_ROWS,
      cols: LAND_LAYOUT_COLS,
      cells: new Array(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS).fill(0),
      trailingBytes: [],
      authored: true,
      provenance: authoredProvenance("Layout", 0, 0, LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2)
    }
  };
}

export function updateLandLayoutCell(project: Project, row: number, col: number, value: number) {
  if (row < 0 || row >= LAND_LAYOUT_ROWS || col < 0 || col >= LAND_LAYOUT_COLS) return project;
  const withLayout = ensureLandLayout(project);
  const layout = withLayout.landLayout;
  if (!layout) return withLayout;
  const cells = [...layout.cells];
  const index = row * LAND_LAYOUT_COLS + col;
  const nextValue = clampSignedShort(Math.trunc(value));
  if (cells[index] === nextValue && layout.rows === LAND_LAYOUT_ROWS && layout.cols === LAND_LAYOUT_COLS && layout.authored) return withLayout;
  cells[index] = nextValue;
  return {
    ...withLayout,
    landLayout: {
      ...layout,
      rows: LAND_LAYOUT_ROWS,
      cols: LAND_LAYOUT_COLS,
      cells: normalizeLandLayoutCells(cells),
      authored: true
    }
  };
}

export function clearLandLayout(project: Project) {
  const withLayout = ensureLandLayout(project);
  const layout = withLayout.landLayout;
  if (!layout) return withLayout;
  return {
    ...withLayout,
    landLayout: {
      ...layout,
      rows: LAND_LAYOUT_ROWS,
      cols: LAND_LAYOUT_COLS,
      cells: new Array(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS).fill(0),
      authored: true
    }
  };
}

export function updateCustomLandTileAttributes(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateCustomLandTileAttributes" }>
) {
  return updateCustomLandlook(project, command.landlook, (landlook) => {
    const records = [...landlook.records];
    const record = records[command.tile];
    if (!record) return landlook;
    const changes = Object.fromEntries(
      Object.entries(command.changes)
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, clampSignedShort(Number(value))])
    );
    records[command.tile] = {
      ...record,
      ...changes
    };
    return { ...landlook, records, authored: true };
  });
}

export function updateSpecialTileSolidity(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateSpecialTileSolidity" }>
) {
  const tile = Math.abs(Math.trunc(command.tile));
  if (tile < 0 || tile > 1023) return project;
  let changed = false;
  let matched = false;
  const tileAttributes = (project.tileAttributes ?? []).map((profile) => {
    if (profile.sourceKind !== "data-solids" || profile.tile !== tile) return profile;
    matched = true;
    const next = specialTileSolidityProfile(profile, command.solid);
    if (profile !== next) changed = true;
    return next;
  });
  if (!matched) {
    changed = true;
    tileAttributes.push(specialTileSolidityProfile({
      tile,
      landlook: null,
      solidType: command.solid ? 1 : 0,
      movementSoundId: null,
      movementCost: null,
      shore: null,
      boatRequirement: null,
      pathFlag: null,
      blocksLos: null,
      flyFloatRequired: null,
      forestType: null,
      spare: null,
      combatBuild: [],
      clearLandId: null,
      baseTile: null,
      baseScale: null,
      editableScope: "special-tile",
      flags: [],
      confidence: "source-backed",
      sourceKind: "data-solids",
      source: "Data Solids",
      rawByte: command.solid ? 1 : 0
    }, command.solid));
  }
  return changed ? { ...project, tileAttributes } : project;
}

function specialTileSolidityProfile(profile: TileAttributeProfile, solid: boolean): TileAttributeProfile {
  const rawByte = solid ? 1 : 0;
  const flags: TileAttributeFlag[] = solid ? ["solid"] : ["walkable"];
  if (
    profile.rawByte === rawByte &&
    profile.solidType === rawByte &&
    profile.flags.length === 1 &&
    profile.flags[0] === flags[0]
  ) {
    return profile;
  }
  return {
    ...profile,
    solidType: rawByte,
    rawByte,
    flags,
    editableScope: "special-tile",
    confidence: "source-backed",
    sourceKind: "data-solids",
    source: "Data Solids"
  };
}

export function updateCustomLandTileCombatBuild(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateCustomLandTileCombatBuild" }>
) {
  if (command.row < 0 || command.row > 2 || command.col < 0 || command.col > 2) return project;
  return updateCustomLandlook(project, command.landlook, (landlook) => {
    const records = [...landlook.records];
    const record = records[command.tile];
    if (!record) return landlook;
    const combatBuild = [0, 1, 2].map((row) => [0, 1, 2].map((col) => record.combatBuild?.[row]?.[col] ?? 0));
    combatBuild[command.row][command.col] = clampSignedShort(command.value);
    records[command.tile] = { ...record, combatBuild };
    return { ...landlook, records, authored: true };
  });
}

export function updateCustomLandlookBase(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateCustomLandlookBase" }>
) {
  return updateCustomLandlook(project, command.landlook, (landlook) => ({
    ...landlook,
    baseTile: command.baseTile == null ? landlook.baseTile : clampSignedShort(command.baseTile),
    baseScale: command.baseScale == null ? landlook.baseScale : clampSignedShort(command.baseScale),
    authored: true
  }));
}

export function updateCustomLandlookRangeSlot(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateCustomLandlookRangeSlot" }>
) {
  return updateCustomLandlook(project, command.landlook, (landlook) => {
    const rangeSlots = landlook.rangeSlots.map((slot) => {
      if (slot.slot !== command.slot) return slot;
      return {
        ...slot,
        firstTile: command.firstTile == null ? slot.firstTile : clampSignedShort(command.firstTile),
        lastTile: command.lastTile == null ? slot.lastTile : clampSignedShort(command.lastTile)
      };
    });
    return { ...landlook, rangeSlots, authored: true };
  });
}

function updateCustomLandlook(project: Project, landlook: number, update: (landlook: NonNullable<Project["customLandlooks"]>[number]) => NonNullable<Project["customLandlooks"]>[number]) {
  const customLandlooks = project.customLandlooks ?? [];
  let changed = false;
  const next = customLandlooks.map((candidate) => {
    if (candidate.landlook !== landlook) return candidate;
    const updated = update(candidate);
    if (updated !== candidate) changed = true;
    return updated;
  });
  return changed ? { ...project, customLandlooks: next } : project;
}

export function createRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "createRandomRect" }>) {
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const rectIndex = command.rect.rectIndex ?? nextRandomRectIndex(level);
  if (rectIndex == null || !randomRectIndexInRange(rectIndex)) return project;
  const rect = normalizeRandomRect({ ...command.rect, rectIndex });
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  }, rect);
  return replaceRandomLevel(project, nextLevel);
}

export function updateRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "updateRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const existing = level.rects.find((rect) => rect.rectIndex === command.rectIndex) ?? defaultRandomRect(command.rectIndex);
  const rect = normalizeRandomRect({ ...existing, ...command.fields, rectIndex: command.rectIndex });
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  }, rect);
  return replaceRandomLevel(project, nextLevel);
}

export function clearRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "clearRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const cleared = defaultRandomRect(command.rectIndex);
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: level.rects.filter((rect) => rect.rectIndex !== command.rectIndex)
  }, cleared);
  return replaceRandomLevel(project, nextLevel);
}

function ensureRandomLevel(project: Project, levelType: RandomLevel["levelType"], levelIndex: number): RandomLevel {
  const existing = project.randomLevels.find((level) => level.levelType === levelType && level.levelIndex === levelIndex);
  if (existing) return existing;
  return {
    id: `${levelType}:${levelIndex}:randlevel`,
    source: levelType === "land" ? "Data RD" : "Data RDD",
    levelType,
    levelIndex,
    landlook: levelType === "land" ? 2 : -1,
    isDark: false,
    useLos: false,
    rects: [],
    rawValues: new Array(RANDOM_LEVEL_WORDS).fill(0),
    provenance: authoredProvenance(levelType === "land" ? "Data RD" : "Data RDD", levelIndex, levelIndex * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function replaceRandomLevel(project: Project, level: RandomLevel) {
  const randomLevels = upsertRandomLevel(project.randomLevels, level);
  const maps = project.maps.map((map) => {
    if (map.levelType !== level.levelType || map.index !== level.levelIndex) return map;
    return {
      ...map,
      render: {
        ...map.render,
        landlook: level.landlook,
        tilesetId: level.levelType === "dungeon" ? "dungeon-top-down-302" : `landlook-${level.landlook}`,
        mode: level.levelType === "dungeon" ? "dungeon-top-down" : "outdoor-landlook"
      }
    };
  });
  const nextProject = {
    ...project,
    randomLevels,
    maps
  };
  const map = maps.find((candidate) => candidate.levelType === level.levelType && candidate.index === level.levelIndex);
  return map ? { ...nextProject, assetCatalog: ensureMapTileset(nextProject, map) } : nextProject;
}

function upsertRandomLevel(levels: RandomLevel[], level: RandomLevel) {
  const randomLevels = [...levels];
  const index = randomLevels.findIndex((candidate) => candidate.levelType === level.levelType && candidate.levelIndex === level.levelIndex);
  if (index >= 0) randomLevels[index] = level;
  else randomLevels.push(level);
  randomLevels.sort((a, b) => a.levelType.localeCompare(b.levelType) || a.levelIndex - b.levelIndex);
  return randomLevels;
}

function nextMapIndex(project: Project, levelType: LevelType) {
  return project.maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

function authoredMap(levelType: LevelType, index: number, source: MapEntity | null): MapEntity {
  const render = defaultRender(levelType, source);
  const fillTile = levelType === "land" ? landlookBaseTile(render.landlook ?? 0) ?? 1 : 0;
  return {
    id: `${levelType}:${index}`,
    levelType,
    source: levelType === "land" ? "Data LD" : "Data DL",
    index,
    name: `${levelType === "land" ? "Land" : "Dungeon"} Level ${index}`,
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles: source ? [...source.tiles] : new Array(MAP_SIZE * MAP_SIZE).fill(fillTile),
    render,
    provenance: authoredProvenance(levelType === "land" ? "Data LD" : "Data DL", index, index * FIELD_BYTES, FIELD_BYTES)
  };
}

function defaultRender(levelType: LevelType, source: MapEntity | null): MapEntity["render"] {
  if (source) {
    return {
      tilesetId: source.render.tilesetId,
      landlook: source.render.landlook,
      mode: source.render.mode
    };
  }
  if (levelType === "dungeon") {
    return { tilesetId: "dungeon-top-down-302", landlook: -1, mode: "dungeon-top-down" };
  }
  return { tilesetId: "landlook-0", landlook: 0, mode: "outdoor-landlook" };
}

function defaultLandlook(levelType: LevelType) {
  return levelType === "land" ? 0 : -1;
}

function authoredRandomLevel(levelType: LevelType, levelIndex: number, landlook: number): RandomLevel {
  return {
    id: `${levelType}:${levelIndex}:randlevel`,
    source: levelType === "land" ? "Data RD" : "Data RDD",
    levelType,
    levelIndex,
    landlook,
    isDark: false,
    useLos: false,
    rects: [],
    rawValues: new Array(RANDOM_LEVEL_WORDS).fill(0),
    provenance: authoredProvenance(levelType === "land" ? "Data RD" : "Data RDD", levelIndex, levelIndex * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function ensureMapTileset(project: Project, map: MapEntity): Project["assetCatalog"] {
  const assetCatalog = {
    tilesets: [...(project.assetCatalog?.tilesets ?? [])],
    pictures: project.assetCatalog?.pictures,
    icons: project.assetCatalog?.icons,
    sounds: project.assetCatalog?.sounds
  };
  const required = referenceTilesetForMap(map);
  if (!required) return assetCatalog;
  const existingIndex = assetCatalog.tilesets.findIndex((tileset) => tileset.id === required.id || tileset.landlook === required.landlook);
  if (existingIndex >= 0) {
    const existing = assetCatalog.tilesets[existingIndex];
    assetCatalog.tilesets[existingIndex] = {
      ...required,
      ...existing,
      baseTile: existing.baseTile ?? required.baseTile,
      pictId: existing.pictId ?? required.pictId,
      available: existing.available || required.available
    };
    return assetCatalog;
  }
  assetCatalog.tilesets.push(required);
  return assetCatalog;
}

function referenceTilesetForMap(map: MapEntity): TilesetAsset | null {
  if (map.levelType === "dungeon") {
    return {
      id: "dungeon-top-down-302",
      landlook: 2,
      name: "Dungeon Top Down",
      source: "Realmz reference resources",
      available: true,
      imagePath: null,
      pictId: 302,
      tileWidth: 16,
      tileHeight: 16,
      columns: 4,
      rows: 4,
      custom: false,
      baseTile: null
    };
  }
  const landlook = map.render.landlook;
  if (typeof landlook !== "number" || landlook < 0) return null;
  return {
    id: `landlook-${landlook}`,
    landlook,
    name: landlookName(landlook),
    source: (landlook >= 6 && landlook <= 8) ? "Scenario resource fork" : "Realmz reference resources",
    available: true,
    imagePath: null,
    pictId: landlookPictId(landlook),
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: landlook >= 6 && landlook <= 8,
    baseTile: landlookBaseTile(landlook)
  };
}

function landlookName(landlook: number) {
  const names: Record<number, string> = {
    0: "Plains",
    2: "Default Land",
    3: "Subterranean",
    4: "Castle",
    5: "Desert",
    6: "Custom 6",
    7: "Custom 7",
    8: "Custom 8",
    9: "Swamp",
    10: "Snow"
  };
  return names[landlook] ?? "Unknown landlook";
}

function landlookPictId(landlook: number) {
  return ({ 0: 300, 2: 302, 3: 303, 4: 304, 5: 305, 6: 306, 7: 307, 8: 308, 9: 309, 10: 310 } as Record<number, number>)[landlook] ?? null;
}

function landlookBaseTile(landlook: number) {
  return ({ 0: 156, 3: 155, 4: 111, 5: 191, 6: 156, 7: 156, 8: 156, 9: 155, 10: 155 } as Record<number, number | null>)[landlook] ?? null;
}

function syncMapRenderForRandomLevel(level: RandomLevel) {
  const bytes = randomLevelRawBytes(level);
  bytes[520] = level.landlook & 0xff;
  bytes[521] = level.isDark ? 1 : 0;
  bytes[522] = level.useLos ? 1 : 0;
  return { ...level, rawValues: rawBytesToWords(bytes) };
}

function upsertRandomRect(rects: RandomRect[], rect: RandomRect) {
  const next = rects.filter((candidate) => candidate.rectIndex !== rect.rectIndex);
  next.push(rect);
  next.sort((a, b) => a.rectIndex - b.rectIndex);
  return next;
}

function nextRandomRectIndex(level: RandomLevel) {
  const used = new Set(level.rects.map((rect) => rect.rectIndex));
  for (let index = 0; index < RANDOM_RECTS_PER_LEVEL; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function defaultRandomRect(rectIndex: number): RandomRect {
  return {
    rectIndex,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    percent: 0,
    battleRange: [0, 0],
    randomDoors: [0, 0, 0],
    randomDoorPercent: [0, 0, 0],
    only: false,
    option: 0,
    sound: 0,
    text: 0
  };
}

function normalizeRandomRect(rect: RandomRect): RandomRect {
  const maxRightBottom = rect.percent < 0 ? 90 : 89;
  const left = clampInt(Math.min(rect.left, rect.right), 0, 89);
  const right = clampInt(Math.max(rect.left, rect.right), 0, maxRightBottom);
  const top = clampInt(Math.min(rect.top, rect.bottom), 0, 89);
  const bottom = clampInt(Math.max(rect.top, rect.bottom), 0, maxRightBottom);
  return {
    rectIndex: rect.rectIndex,
    left,
    top,
    right,
    bottom,
    percent: clampInt(rect.percent, -32768, 10000),
    battleRange: normalizePair(rect.battleRange),
    randomDoors: normalizeFixedTriple(rect.randomDoors),
    randomDoorPercent: normalizeFixedTriple(rect.randomDoorPercent).map((value) => clampInt(value, -100, 100)),
    only: Boolean(rect.only),
    option: clampInt(rect.option, -128, 127),
    sound: clampInt(rect.sound, -32768, 32767),
    text: clampInt(rect.text, -32768, 32767)
  };
}

function writeRandomRectToRaw(level: RandomLevel, rect: RandomRect) {
  const bytes = randomLevelRawBytes(level);
  const r = rect.rectIndex;
  writeI16(bytes, r * 8, rect.top);
  writeI16(bytes, r * 8 + 2, rect.left);
  writeI16(bytes, r * 8 + 4, rect.bottom);
  writeI16(bytes, r * 8 + 6, rect.right);
  writeI16(bytes, 160 + r * 2, rect.percent);
  writeI16(bytes, 200 + r * 4, rect.battleRange[0] ?? 0);
  writeI16(bytes, 202 + r * 4, rect.battleRange[1] ?? 0);
  for (let slot = 0; slot < 3; slot += 1) {
    writeI16(bytes, 280 + r * 6 + slot * 2, rect.randomDoors[slot] ?? 0);
    writeI16(bytes, 400 + r * 6 + slot * 2, rect.randomDoorPercent[slot] ?? 0);
  }
  bytes[523 + r] = rect.only ? 1 : 0;
  bytes[543 + r] = rect.option & 0xff;
  writeI16(bytes, 563 + r * 2, rect.sound);
  writeI16(bytes, 603 + r * 2, rect.text);
  bytes[520] = level.landlook & 0xff;
  bytes[521] = level.isDark ? 1 : 0;
  bytes[522] = level.useLos ? 1 : 0;
  return { ...level, rawValues: rawBytesToWords(bytes) };
}

function randomLevelRawBytes(level: RandomLevel) {
  const bytes = new Uint8Array(RANDOM_LEVEL_BYTES);
  const rawValues = level.rawValues?.length === RANDOM_LEVEL_WORDS ? level.rawValues : new Array(RANDOM_LEVEL_WORDS).fill(0);
  rawValues.forEach((value, index) => writeI16(bytes, index * 2, value));
  return bytes;
}

function mapRecordRawBytes(record: MapRecord) {
  const bytes = new Uint8Array(MAP_RECORD_BYTES);
  if (record.rawBytes?.length === MAP_RECORD_BYTES) {
    bytes.set(record.rawBytes.map((value) => value & 0xff));
  }
  mapRecordMarkers(record).forEach((marker, slot) => {
    const offset = slot * MAP_RECORD_MARKER_BYTES;
    writeI16(bytes, offset, marker.iconId);
    writeI16(bytes, offset + 2, marker.x);
    writeI16(bytes, offset + 4, marker.y);
  });
  writeI16(bytes, 60, record.startX);
  writeI16(bytes, 62, record.startY);
  writeI16(bytes, 64, record.level);
  writeI16(bytes, 66, record.pictId);
  writeI16(bytes, 68, record.iconSize);
  writeI16(bytes, 70, record.show);
  writeI16(bytes, 72, record.isDungeon ? 1 : 0);
  writeI16(bytes, 76, record.rect.top);
  writeI16(bytes, 78, record.rect.left);
  writeI16(bytes, 80, record.rect.bottom);
  writeI16(bytes, 82, record.rect.right);
  writePascalText(bytes, 84, MAP_RECORD_BYTES - 84, record.note);
  return Array.from(bytes);
}

function mapRecordMarkers(record: MapRecord): MapMarker[] {
  return Array.from({ length: MAP_RECORD_MARKERS }, (_, slot) => {
    const marker = record.markers?.[slot];
    if (marker) {
      return {
        iconId: clampSignedShort(Math.trunc(marker.iconId ?? 0)),
        x: clampSignedShort(Math.trunc(marker.x ?? 0)),
        y: clampSignedShort(Math.trunc(marker.y ?? 0))
      };
    }
    return mapRecordMarkerFromRaw(record.rawBytes, slot);
  });
}

function mapRecordMarkerFromRaw(rawBytes: number[] | undefined, slot: number): MapMarker {
  const offset = slot * MAP_RECORD_MARKER_BYTES;
  if (!rawBytes || rawBytes.length < offset + MAP_RECORD_MARKER_BYTES) return { iconId: 0, x: 0, y: 0 };
  return {
    iconId: readI16(rawBytes, offset),
    x: readI16(rawBytes, offset + 2),
    y: readI16(rawBytes, offset + 4)
  };
}

function readI16(bytes: number[], offset: number) {
  const unsigned = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function rawBytesToWords(bytes: Uint8Array) {
  const values: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const unsigned = (bytes[offset] << 8) | bytes[offset + 1];
    values.push(unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned);
  }
  return values;
}

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  const normalized = clampInt(value, -32768, 32767) & 0xffff;
  bytes[offset] = (normalized >> 8) & 0xff;
  bytes[offset + 1] = normalized & 0xff;
}

function writePascalText(bytes: Uint8Array, offset: number, length: number, text: string) {
  const end = Math.min(bytes.length, offset + length);
  for (let index = offset; index < end; index += 1) bytes[index] = 0;
  const encoded = Array.from(text ?? "").map((char) => {
    const code = char.charCodeAt(0);
    return code >= 0 && code <= 0x7f ? code : 63;
  });
  const count = Math.min(encoded.length, Math.max(0, length - 1), 255);
  bytes[offset] = count;
  for (let index = 0; index < count; index += 1) bytes[offset + 1 + index] = encoded[index];
}

function normalizePair(values: number[]) {
  return [clampInt(values?.[0] ?? 0, -32768, 32767), clampInt(values?.[1] ?? 0, -32768, 32767)];
}

function normalizeFixedTriple(values: number[]) {
  return [0, 1, 2].map((index) => clampInt(values?.[index] ?? 0, -32768, 32767));
}

function randomRectIndexInRange(rectIndex: number) {
  return Number.isInteger(rectIndex) && rectIndex >= 0 && rectIndex < RANDOM_RECTS_PER_LEVEL;
}

function clampInt(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeLandLayoutCells(cells: number[]) {
  const out = new Array(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS).fill(0);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = clampSignedShort(Math.trunc(cells[index] ?? 0));
  }
  return out;
}

function clampSignedShort(value: number) {
  return Math.max(-32768, Math.min(32767, Number.isFinite(value) ? value : 0));
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return {
    sourceFile,
    recordIndex,
    byteOffset,
    byteLength,
    confidence: "inferred"
  };
}
