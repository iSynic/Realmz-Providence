import { LandlookRangeSlot, LevelType, MapEntity, MapMarker, MapRecord, MapstatsRecord, PaintCellChange, Project, ProjectCommand, Provenance, RandomLevel, RandomRect, TileAttributeFlag, TileAttributeProfile, TilesetAsset } from "../types";
import { setDungeonCellFlags } from "../map/dungeonCellFlags";
import { landCellSecretState, setLandCellSecretState as encodeLandCellSecretState } from "../map/actionPointMarkers";
import { mapCellFromTileIndex, mapTileIndex } from "../map/geometry";

const MAP_SIZE = 90;
const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
const RANDOM_LEVEL_BYTES = 644;
const RANDOM_RECTS_PER_LEVEL = 20;
const MAP_RECORD_BYTES = 340;
const MAP_RECORD_MARKERS = 10;
const LAND_LAYOUT_ROWS = 8;
const LAND_LAYOUT_COLS = 16;
const DUNGEON_WALL_TILE = 1;
const CUSTOM_LANDLOOK_RECORDS = 201;
const CUSTOM_LANDLOOKS = new Set([6, 7, 8]);
const CUSTOM_LANDLOOK_SOURCE_FILES: Record<number, string> = {
  6: "Data Custom 1 BD",
  7: "Data Custom 2 BD",
  8: "Data Custom 3 BD"
};

export function paintTiles(project: Project, mapId: string, cells: PaintCellChange[]) {
  if (cells.length === 0) return project;
  let projectChanged = false;
  const maps = project.maps.map((map) => {
    if (map.id !== mapId) return map;
    const tiles = [...map.tiles];
    let mapChanged = false;
    for (const cell of cells) {
      if (cell.index < 0 || cell.index >= tiles.length) continue;
      let value = cell.to;
      if (map.levelType === "land") {
        const coordinate = mapCellFromTileIndex(map, cell.index);
        const ownsActionPoint = (project.triggers ?? []).some((trigger) =>
          trigger.active &&
          trigger.levelType === "land" &&
          trigger.levelIndex === map.index &&
          trigger.coordinate?.x === coordinate.x &&
          trigger.coordinate.y === coordinate.y
        );
        const secretState = landCellSecretState(tiles[cell.index]);
        value = encodeLandCellSecretState(value, secretState, ownsActionPoint);
      }
      if (tiles[cell.index] === value) continue;
      tiles[cell.index] = value;
      mapChanged = true;
    }
    if (!mapChanged) return map;
    projectChanged = true;
    return { ...map, tiles };
  });
  return projectChanged ? { ...project, maps } : project;
}

export function setLandCellSecretState(
  project: Project,
  command: Extract<ProjectCommand, { kind: "setLandCellSecretState" }>
) {
  let changed = false;
  const maps = project.maps.map((map) => {
    if (map.id !== command.mapId || map.levelType !== "land") return map;
    const index = mapTileIndex(map, command.x, command.y);
    if (index < 0 || index >= map.tiles.length) return map;
    const hasActionPoint = (project.triggers ?? []).some((trigger) =>
      trigger.active &&
      trigger.levelType === "land" &&
      trigger.levelIndex === map.index &&
      trigger.coordinate?.x === command.x &&
      trigger.coordinate.y === command.y
    );
    const value = encodeLandCellSecretState(map.tiles[index], command.state, hasActionPoint);
    if (value === map.tiles[index]) return map;
    const tiles = [...map.tiles];
    tiles[index] = value;
    changed = true;
    return { ...map, tiles };
  });
  return changed ? { ...project, maps } : project;
}

export function updateDungeonCellFlags(project: Project, command: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>) {
  if (command.cells.length === 0) return project;
  let projectChanged = false;
  const maps = project.maps.map((map) => {
    if (map.id !== command.mapId || map.levelType !== "dungeon") return map;
    const tiles = [...map.tiles];
    let mapChanged = false;
    for (const cell of command.cells) {
      if (cell.index < 0 || cell.index >= tiles.length) continue;
      const next = setDungeonCellFlags(tiles[cell.index], command.flags);
      if (next === tiles[cell.index]) continue;
      tiles[cell.index] = next;
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
  const randomLevel = authoredRandomLevel(command.levelType, index, map.render.landlook ?? -1);
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
  const randomLevel = authoredRandomLevel(source.levelType, index, source.render.landlook ?? defaultLandlook(source.levelType));
  return {
    ...project,
    maps: [...project.maps, map],
    randomLevels: upsertRandomLevel(project.randomLevels, randomLevel),
    assetCatalog: ensureMapTileset(project, map)
  };
}

export function createMapRecord(project: Project, command: Extract<ProjectCommand, { kind: "createMapRecord" }>) {
  const id = Number.isInteger(command.id) && command.id != null && command.id >= 0
    ? command.id
    : nextMapRecordId(project);
  if ((project.mapRecords ?? []).some((record) => record.id === id)) return project;
  const record = authoredMapRecord(id, command.template);
  return {
    ...project,
    mapRecords: [...(project.mapRecords ?? []), record].sort((left, right) => left.id - right.id)
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
  return replaceRandomLevel(project, level);
}

export function updateMapRecord(project: Project, id: number, changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) {
  let changed = false;
  const mapRecords = (project.mapRecords ?? []).map((record) => {
    if (record.id !== id) return record;
    changed = true;
    const { rawBytes: _legacyRawBytes, ...canonicalRecord } = record as typeof record & { rawBytes?: number[] };
    const next: MapRecord = {
      ...canonicalRecord,
      ...changes,
      rect: changes.rect ? { ...record.rect, ...changes.rect } : record.rect,
      authored: true
    };
    return next;
  });
  return changed ? { ...project, mapRecords } : project;
}

export function updateMapRecordNames(project: Project, id: number, changes: Extract<ProjectCommand, { kind: "updateMapRecordNames" }>["changes"]) {
  let changed = false;
  const mapRecords = (project.mapRecords ?? []).map((record) => {
    if (record.id !== id) return record;
    changed = true;
    const { rawBytes: _legacyRawBytes, ...canonicalRecord } = record as typeof record & { rawBytes?: number[] };
    const primaryName = changes.primaryName ?? changes.name ?? record.primaryName ?? record.name;
    return {
      ...canonicalRecord,
      ...changes,
      name: changes.name ?? primaryName,
      primaryName,
      mapNameAuthored: true
    };
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
  const hadLegacyTrailingBytes = "trailingBytes" in layout;
  const { trailingBytes: _legacyTrailingBytes, ...canonicalLayout } = layout as typeof layout & { trailingBytes?: number[] };
  const index = row * LAND_LAYOUT_COLS + col;
  const nextValue = clampSignedShort(Math.trunc(value));
  if (
    cells[index] === nextValue &&
    layout.rows === LAND_LAYOUT_ROWS &&
    layout.cols === LAND_LAYOUT_COLS &&
    layout.authored &&
    !hadLegacyTrailingBytes
  ) return withLayout;
  cells[index] = nextValue;
  return {
    ...withLayout,
    landLayout: {
      ...canonicalLayout,
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
  const { trailingBytes: _legacyTrailingBytes, ...canonicalLayout } = layout as typeof layout & { trailingBytes?: number[] };
  return {
    ...withLayout,
    landLayout: {
      ...canonicalLayout,
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
  let updatedLandlook: CustomLandlookMetadata | null = null;
  const nextProject = updateCustomLandlook(project, command.landlook, (landlook) => {
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
    updatedLandlook = { ...landlook, records, authored: true };
    return updatedLandlook;
  });
  return updatedLandlook ? syncCustomLandlookTileAttribute(nextProject, updatedLandlook, command.tile) : nextProject;
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
      rawByte: null
    }, command.solid));
  }
  return changed ? { ...project, tileAttributes } : project;
}

export function createCustomLandlookFromSource(
  project: Project,
  command: Extract<ProjectCommand, { kind: "createCustomLandlookFromSource" }>
) {
  const sourceLandlook = Math.trunc(command.sourceLandlook);
  const targetLandlook = Math.trunc(command.targetLandlook);
  if (!CUSTOM_LANDLOOKS.has(targetLandlook)) return project;
  const sourceFile = CUSTOM_LANDLOOK_SOURCE_FILES[targetLandlook];
  const existingSource = (project.customLandlooks ?? []).find((landlook) => landlook.landlook === sourceLandlook);
  const targetMetadata = existingSource
    ? cloneCustomLandlookMetadata(existingSource, targetLandlook, sourceFile)
    : createCustomLandlookMetadataFromProfiles(project, sourceLandlook, targetLandlook, sourceFile);
  const customLandlooks = [
    ...(project.customLandlooks ?? []).filter((landlook) => landlook.landlook !== targetLandlook),
    targetMetadata
  ].sort((left, right) => left.landlook - right.landlook);
  const tileAttributes = (project.tileAttributes ?? []).filter((profile) =>
    !(profile.sourceKind === "mapstats" && profile.landlook === targetLandlook)
  );
  let nextProject: Project = {
    ...project,
    customLandlooks,
    tileAttributes
  };
  nextProject = syncCustomLandlookTileAttributes(nextProject, targetMetadata);
  nextProject = upsertCustomLandlookTileset(nextProject, sourceLandlook, targetMetadata);
  if (command.assignMapId) {
    nextProject = assignMapToCustomLandlook(nextProject, command.assignMapId, sourceLandlook, targetLandlook);
  }
  return nextProject;
}

function cloneCustomLandlookMetadata(source: CustomLandlookMetadata, targetLandlook: number, sourceFile: string): CustomLandlookMetadata {
  const { trailingBytes: _trailingBytes, rawBytes: _rawBytes, ...semanticSource } = source;
  return {
    ...semanticSource,
    landlook: targetLandlook,
    sourceFile,
    records: source.records.map((record) => cloneMapstatsRecord(record)),
    rangeSlots: source.rangeSlots.map(({ reserved: _reserved, ...slot }) => slot),
    writerGate: {
      ...source.writerGate,
      evidence: [...(source.writerGate?.evidence ?? [])]
    },
    authored: true
  };
}

function createCustomLandlookMetadataFromProfiles(
  project: Project,
  sourceLandlook: number,
  targetLandlook: number,
  sourceFile: string
): CustomLandlookMetadata {
  const sourceTileset = findTilesetForLandlook(project, sourceLandlook);
  const sampleProfile = (project.tileAttributes ?? []).find((profile) =>
    profile.sourceKind === "mapstats" &&
    profile.landlook === sourceLandlook &&
    profile.baseTile != null
  );
  const baseTile = sampleProfile?.baseTile ?? sourceTileset?.baseTile ?? landlookBaseTile(sourceLandlook) ?? 156;
  const baseScale = sampleProfile?.baseScale ?? 1;
  return {
    landlook: targetLandlook,
    sourceFile,
    records: Array.from({ length: CUSTOM_LANDLOOK_RECORDS }, (_, tile) =>
      mapstatsRecordFromProfile(tile, findMapstatsProfile(project, sourceLandlook, tile))
    ),
    baseTile,
    baseScale,
    rangeSlots: defaultCustomLandlookRangeSlots(),
    writerGate: defaultCustomLandlookWriterGate(),
    authored: true
  };
}

function mapstatsRecordFromProfile(tile: number, profile: TileAttributeProfile | null): MapstatsRecord {
  return {
    tile,
    sound: profile?.movementSoundId ?? 0,
    time: profile?.movementCost ?? 0,
    solid: profile?.solidType ?? 0,
    shore: profile?.shore ? 1 : 0,
    needBoat: profile?.boatRequirement ?? 0,
    isPath: profile?.pathFlag ? 1 : 0,
    los: profile?.blocksLos ? 1 : 0,
    flyFloat: profile?.flyFloatRequired ? 1 : 0,
    forest: profile?.forestType ?? 0,
    combatBuild: normalizeCombatBuild(profile?.combatBuild),
    clearLandId: profile?.clearLandId ?? 0
  };
}

function cloneMapstatsRecord(record: MapstatsRecord): MapstatsRecord {
  const { spare: _spare, ...semanticRecord } = record;
  return {
    ...semanticRecord,
    combatBuild: normalizeCombatBuild(record.combatBuild)
  };
}

function normalizeCombatBuild(combatBuild: number[][] | undefined | null) {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].map((col) => clampSignedShort(combatBuild?.[row]?.[col] ?? 0))
  );
}

function findMapstatsProfile(project: Project, landlook: number, tile: number) {
  return (project.tileAttributes ?? []).find((profile) =>
    profile.sourceKind === "mapstats" &&
    profile.landlook === landlook &&
    profile.tile === tile
  ) ?? null;
}

function findTilesetForLandlook(project: Project, landlook: number) {
  return (project.assetCatalog?.tilesets ?? []).find((tileset) => tileset.landlook === landlook || tileset.id === `landlook-${landlook}`) ?? null;
}

function defaultCustomLandlookRangeSlots(): LandlookRangeSlot[] {
  return Array.from({ length: 10 }, (_, slot) => ({
    slot,
    label: `Range ${slot + 1}`,
    firstTile: 0,
    lastTile: 0,
  }));
}

function defaultCustomLandlookWriterGate() {
  return {
    metadataWriterStatus: "decoded-writable",
    atlasWriterStatus: "generated",
    writableFields: [
      "tile sound",
      "time/move",
      "solid",
      "shore",
      "needBoat",
      "path",
      "line-of-sight",
      "fly/float",
      "forest",
      "combat build",
      "clear/base tile",
      "base tile",
      "base scale",
      "range slots"
    ],
    preserveOnlyFields: ["spare", "range reserved words", "trailing bytes"],
    evidence: [
      "Divinity manual: standard tile sets can be loaded as templates, but only Custom 1 through Custom 3 can be saved.",
      "Providence writes Data Custom 1/2/3 BD metadata and generated PICT 306/307/308 atlas resources."
    ]
  };
}

function upsertCustomLandlookTileset(project: Project, sourceLandlook: number, landlook: CustomLandlookMetadata): Project {
  const sourceTileset = findTilesetForLandlook(project, sourceLandlook);
  const pictId = landlookPictId(landlook.landlook);
  const fallbackImagePath = sourceTileset?.imagePath
    ?? (sourceTileset?.pictId != null ? `reference-picture:${sourceTileset.pictId}` : null);
  const required: TilesetAsset = {
    id: `landlook-${landlook.landlook}`,
    landlook: landlook.landlook,
    name: customLandlookDisplayName(landlook.landlook),
    source: `Scenario custom copied from ${sourceTileset?.name ?? landlookName(sourceLandlook)}`,
    available: Boolean(fallbackImagePath) || Boolean(sourceTileset?.available),
    imagePath: fallbackImagePath,
    pictId,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: true,
    baseTile: landlook.baseTile
  };
  const assetCatalog = {
    ...project.assetCatalog,
    tilesets: [...(project.assetCatalog?.tilesets ?? [])],
    pictures: project.assetCatalog?.pictures,
    icons: project.assetCatalog?.icons,
    sounds: project.assetCatalog?.sounds
  };
  const existingIndex = assetCatalog.tilesets.findIndex((tileset) => tileset.landlook === landlook.landlook || tileset.id === required.id);
  if (existingIndex >= 0) {
    const existing = assetCatalog.tilesets[existingIndex];
    assetCatalog.tilesets[existingIndex] = {
      ...existing,
      ...required,
      imagePath: existing.imagePath && existing.pictId === pictId ? existing.imagePath : required.imagePath,
      available: existing.available || required.available
    };
  } else {
    assetCatalog.tilesets.push(required);
  }
  return { ...project, assetCatalog };
}

function assignMapToCustomLandlook(project: Project, mapId: string, previousLandlook: number, targetLandlook: number): Project {
  let matchedMap: MapEntity | null = null;
  const maps = project.maps.map((map) => {
    if (map.id !== mapId || map.levelType !== "land") return map;
    matchedMap = map;
    return {
      ...map,
      tiles: remapClearTilesForLandlook(map, previousLandlook, targetLandlook),
      render: {
        ...map.render,
        landlook: targetLandlook,
        tilesetId: `landlook-${targetLandlook}`,
        mode: "outdoor-landlook" as const
      }
    };
  });
  if (!matchedMap) return project;
  const randomLevels = (project.randomLevels ?? []).map((level) => {
    if (level.levelType !== matchedMap?.levelType || level.levelIndex !== matchedMap.index) return level;
    return { ...level, landlook: targetLandlook };
  });
  return { ...project, maps, randomLevels };
}

function specialTileSolidityProfile(profile: TileAttributeProfile, solid: boolean): TileAttributeProfile {
  const solidType = solid ? 1 : 0;
  const flags: TileAttributeFlag[] = solid ? ["solid"] : ["walkable"];
  if (
    profile.rawByte == null &&
    profile.solidType === solidType &&
    profile.flags.length === 1 &&
    profile.flags[0] === flags[0]
  ) {
    return profile;
  }
  return {
    ...profile,
    solidType,
    rawByte: null,
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
  let updatedLandlook: CustomLandlookMetadata | null = null;
  const nextProject = updateCustomLandlook(project, command.landlook, (landlook) => {
    const records = [...landlook.records];
    const record = records[command.tile];
    if (!record) return landlook;
    const combatBuild = [0, 1, 2].map((row) => [0, 1, 2].map((col) => record.combatBuild?.[row]?.[col] ?? 0));
    combatBuild[command.row][command.col] = clampSignedShort(command.value);
    records[command.tile] = { ...record, combatBuild };
    updatedLandlook = { ...landlook, records, authored: true };
    return updatedLandlook;
  });
  return updatedLandlook ? syncCustomLandlookTileAttribute(nextProject, updatedLandlook, command.tile) : nextProject;
}

export function updateCustomLandlookBase(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateCustomLandlookBase" }>
) {
  let updatedLandlook: CustomLandlookMetadata | null = null;
  const nextProject = updateCustomLandlook(project, command.landlook, (landlook) => {
    updatedLandlook = {
      ...landlook,
      baseTile: command.baseTile == null ? landlook.baseTile : clampSignedShort(command.baseTile),
      baseScale: command.baseScale == null ? landlook.baseScale : clampSignedShort(command.baseScale),
      authored: true
    };
    return updatedLandlook;
  });
  return updatedLandlook ? syncCustomLandlookTileAttributes(nextProject, updatedLandlook) : nextProject;
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

type CustomLandlookMetadata = NonNullable<Project["customLandlooks"]>[number];

function updateCustomLandlook(project: Project, landlook: number, update: (landlook: CustomLandlookMetadata) => CustomLandlookMetadata) {
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

function syncCustomLandlookTileAttribute(project: Project, landlook: CustomLandlookMetadata, tile: number): Project {
  const record = landlook.records[tile];
  if (!record) return project;
  return syncTileAttribute(project, customMapstatsAttributeProfile(landlook, record));
}

function syncCustomLandlookTileAttributes(project: Project, landlook: CustomLandlookMetadata): Project {
  return landlook.records.reduce((current, record) => syncTileAttribute(current, customMapstatsAttributeProfile(landlook, record)), project);
}

function syncTileAttribute(project: Project, profile: TileAttributeProfile): Project {
  const tileAttributes = [...(project.tileAttributes ?? [])];
  const existingIndex = tileAttributes.findIndex((candidate) =>
    candidate.sourceKind === "mapstats" &&
    candidate.landlook === profile.landlook &&
    candidate.tile === profile.tile
  );
  if (existingIndex >= 0) {
    tileAttributes[existingIndex] = profile;
  } else {
    tileAttributes.push(profile);
  }
  return { ...project, tileAttributes };
}

function customMapstatsAttributeProfile(landlook: CustomLandlookMetadata, record: CustomLandlookMetadata["records"][number]): TileAttributeProfile {
  const solid = record.solid;
  const needBoat = record.needBoat;
  const flyFloat = record.flyFloat;
  const flags: TileAttributeFlag[] = [solid === 0 && needBoat === 0 && flyFloat === 0 ? "walkable" : "solid"];
  if (record.shore !== 0) flags.push("shore");
  if (needBoat !== 0) flags.push("boat-required");
  if (record.isPath !== 0) flags.push("path");
  if (record.los !== 0) flags.push("blocks-los");
  if (flyFloat !== 0) flags.push("fly-float-required");
  if (record.forest !== 0) flags.push("forest");
  if ((record.combatBuild ?? []).flat().some((value) => value !== 0)) flags.push("combat-build");
  return {
    tile: record.tile,
    landlook: landlook.landlook,
    solidType: solid,
    movementSoundId: record.sound,
    movementCost: record.time,
    shore: record.shore !== 0,
    boatRequirement: needBoat,
    pathFlag: record.isPath !== 0,
    blocksLos: record.los !== 0,
    flyFloatRequired: flyFloat !== 0,
    forestType: record.forest,
    spare: record.spare ?? null,
    combatBuild: (record.combatBuild ?? []).map((row) => [...row]),
    clearLandId: record.clearLandId,
    baseTile: landlook.baseTile,
    baseScale: landlook.baseScale,
    editableScope: "scenario-custom",
    flags,
    confidence: "source-backed",
    sourceKind: "mapstats",
    source: landlook.sourceFile,
    rawByte: null
  };
}

export function createRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "createRandomRect" }>) {
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const rectIndex = command.rect.rectIndex ?? nextRandomRectIndex(level);
  if (rectIndex == null || !randomRectIndexInRange(rectIndex)) return project;
  const rect = normalizeRandomRect({ ...command.rect, rectIndex });
  const nextLevel = {
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  };
  return replaceRandomLevel(project, nextLevel);
}

export function updateRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "updateRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const existing = level.rects.find((rect) => rect.rectIndex === command.rectIndex) ?? defaultRandomRect(command.rectIndex);
  const rect = normalizeRandomRect({ ...existing, ...command.fields, rectIndex: command.rectIndex });
  const nextLevel = {
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  };
  return replaceRandomLevel(project, nextLevel);
}

export function clearRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "clearRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const nextLevel = {
    ...level,
    rects: level.rects.filter((rect) => rect.rectIndex !== command.rectIndex)
  };
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
    provenance: authoredProvenance(levelType === "land" ? "Data RD" : "Data RDD", levelIndex, levelIndex * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function replaceRandomLevel(project: Project, level: RandomLevel) {
  const randomLevels = upsertRandomLevel(project.randomLevels, level);
  const maps = project.maps.map((map): MapEntity => {
    if (map.levelType !== level.levelType || map.index !== level.levelIndex) return map;
    const previousLandlook = map.render.landlook;
    const nextLandlook = level.levelType === "dungeon" ? -1 : level.landlook;
    const tiles = remapClearTilesForLandlook(map, previousLandlook, nextLandlook);
    return {
      ...map,
      tiles,
      render: {
        ...map.render,
        landlook: nextLandlook,
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

function remapClearTilesForLandlook(map: MapEntity, previousLandlook: number | null, nextLandlook: number | null) {
  if (map.levelType !== "land" || previousLandlook == null || nextLandlook == null || previousLandlook === nextLandlook) return map.tiles;
  const previousClearTile = landlookBaseTile(previousLandlook);
  const nextClearTile = landlookBaseTile(nextLandlook);
  if (previousClearTile == null || nextClearTile == null || previousClearTile === nextClearTile) return map.tiles;
  let changed = false;
  const tiles = map.tiles.map((tile) => {
    if (tile !== previousClearTile) return tile;
    changed = true;
    return nextClearTile;
  });
  return changed ? tiles : map.tiles;
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
  const fillTile = levelType === "land" ? landlookBaseTile(render.landlook ?? 0) ?? 1 : DUNGEON_WALL_TILE;
  return {
    id: `${levelType}:${index}`,
    levelType,
    source: levelType === "land" ? "Data LD" : "Data DL",
    index,
    name: `${levelType === "land" ? "Land" : "Dungeon"} level ${index}`,
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
    6: "Custom 1",
    7: "Custom 2",
    8: "Custom 3",
    9: "Swamp",
    10: "Snow"
  };
  return names[landlook] ?? "Unknown landlook";
}

function customLandlookDisplayName(landlook: number) {
  return ({ 6: "Custom 1", 7: "Custom 2", 8: "Custom 3" } as Record<number, string>)[landlook] ?? `Custom ${landlook}`;
}

function landlookPictId(landlook: number) {
  return ({ 0: 300, 2: 302, 3: 303, 4: 304, 5: 305, 6: 306, 7: 307, 8: 308, 9: 309, 10: 310 } as Record<number, number>)[landlook] ?? null;
}

function landlookBaseTile(landlook: number) {
  return ({ 0: 156, 3: 155, 4: 111, 5: 191, 6: 156, 7: 156, 8: 156, 9: 155, 10: 155 } as Record<number, number | null>)[landlook] ?? null;
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
  const left = clampInt(Math.min(rect.left, rect.right), 0, 89);
  const right = clampInt(Math.max(rect.left, rect.right), 0, 90);
  const top = clampInt(Math.min(rect.top, rect.bottom), 0, 89);
  const bottom = clampInt(Math.max(rect.top, rect.bottom), 0, 90);
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

function nextMapRecordId(project: Project) {
  const used = new Set((project.mapRecords ?? []).map((record) => record.id));
  for (let id = 0; id < 1000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size;
}

function authoredMapRecord(id: number, template: Partial<MapRecord> = {}): MapRecord {
  const markers = Array.from({ length: MAP_RECORD_MARKERS }, (_, slot) => ({
    iconId: template.markers?.[slot]?.iconId ?? 0,
    x: template.markers?.[slot]?.x ?? 0,
    y: template.markers?.[slot]?.y ?? 0
  }));
  const record: MapRecord = {
    id,
    markers,
    startX: template.startX ?? 0,
    startY: template.startY ?? 0,
    level: template.level ?? 0,
    pictId: template.pictId ?? 0,
    iconSize: template.iconSize ?? 16,
    show: template.show ?? 1,
    isDungeon: template.isDungeon ?? false,
    rect: {
      top: template.rect?.top ?? 0,
      left: template.rect?.left ?? 0,
      bottom: template.rect?.bottom ?? 0,
      right: template.rect?.right ?? 0
    },
    note: template.note ?? "",
    name: template.name ?? template.primaryName ?? `Player Map ${id}`,
    primaryName: template.primaryName ?? template.name ?? `Player Map ${id}`,
    secondaryName: template.secondaryName ?? "",
    mapNameAuthored: true,
    authored: true,
    provenance: authoredProvenance("Data MD2", id, id * MAP_RECORD_BYTES, MAP_RECORD_BYTES)
  };
  return record;
}

function mapRecordMarkers(record: MapRecord): MapMarker[] {
  return Array.from({ length: MAP_RECORD_MARKERS }, (_, slot) => {
    const marker = record.markers[slot];
    if (marker) {
      return {
        iconId: clampSignedShort(Math.trunc(marker.iconId ?? 0)),
        x: clampSignedShort(Math.trunc(marker.x ?? 0)),
        y: clampSignedShort(Math.trunc(marker.y ?? 0))
      };
    }
    return { iconId: 0, x: 0, y: 0 };
  });
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
