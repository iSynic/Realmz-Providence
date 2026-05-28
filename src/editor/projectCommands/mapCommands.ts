import { MapRecord, PaintCellChange, Project, ProjectCommand, Provenance, RandomLevel, RandomRect } from "../types";

const RANDOM_LEVEL_BYTES = 644;
const RANDOM_LEVEL_WORDS = RANDOM_LEVEL_BYTES / 2;
const RANDOM_RECTS_PER_LEVEL = 20;
const MAP_RECORD_BYTES = 340;
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
  const randomLevels = [...project.randomLevels];
  const index = randomLevels.findIndex((candidate) => candidate.levelType === level.levelType && candidate.levelIndex === level.levelIndex);
  if (index >= 0) randomLevels[index] = level;
  else randomLevels.push(level);
  randomLevels.sort((a, b) => a.levelType.localeCompare(b.levelType) || a.levelIndex - b.levelIndex);
  return {
    ...project,
    randomLevels,
    maps: project.maps.map((map) => {
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
    })
  };
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
  const left = clampInt(Math.min(rect.left, rect.right), 0, 89);
  const right = clampInt(Math.max(rect.left, rect.right), 0, 89);
  const top = clampInt(Math.min(rect.top, rect.bottom), 0, 89);
  const bottom = clampInt(Math.max(rect.top, rect.bottom), 0, 89);
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
