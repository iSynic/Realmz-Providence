import { LandCellSecretState, LevelType, MapEntity, Project, TriggerRecord } from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";

const LAND_NOTE_PATH_MASK = 0x6000;
const DUNGEON_REVEALED_SECRET_MASK = 0x0040;
const DUNGEON_ACTION_POINT_MASK = 0x1000;
const DUNGEON_SECRET_DIRECTION_MASK = 0x0f00;

export type ActionPointMarkerState = "none" | "normal" | "revealed-secret" | "secret";

export function actionPointMarkerState(value: number, levelType: LevelType): ActionPointMarkerState {
  if (levelType === "dungeon") {
    const mask = value & 0xffff;
    if ((mask & DUNGEON_ACTION_POINT_MASK) === 0) return "none";
    if ((mask & DUNGEON_SECRET_DIRECTION_MASK) === 0) return "normal";
    return (mask & DUNGEON_REVEALED_SECRET_MASK) !== 0 ? "revealed-secret" : "secret";
  }

  const magnitude = landMarkerMagnitude(value);
  if (magnitude >= 3000) return "secret";
  if (magnitude >= 2000) return "revealed-secret";
  if (magnitude >= 1000) return "normal";
  return "none";
}

export function actionPointMarkerStateForTrigger(project: Project | null, trigger: TriggerRecord): ActionPointMarkerState {
  const map = mapForTrigger(project, trigger);
  if (!map || !trigger.coordinate) return "none";
  return actionPointMarkerState(tileValueAt(map, trigger.coordinate.x, trigger.coordinate.y), map.levelType);
}

export function isSecretActionPointState(state: ActionPointMarkerState) {
  return state === "secret" || state === "revealed-secret";
}

export function landCellSecretState(value: number): LandCellSecretState {
  const state = actionPointMarkerState(value, "land");
  if (state === "secret") return "hidden";
  if (state === "revealed-secret") return "revealed";
  return "normal";
}

export function ensureActionPointMarker(value: number, levelType: LevelType): number {
  if (levelType === "dungeon") return signedShort((value & 0xffff) | DUNGEON_ACTION_POINT_MASK);
  const state = actionPointMarkerState(value, levelType);
  return state === "none" ? withLandMarkerBand(value, 1) : value;
}

export function clearActionPointMarker(value: number, levelType: LevelType) {
  if (levelType === "land") {
    return landCellSecretState(value) === "normal" ? withLandMarkerBand(value, 0) : value;
  }
  return signedShort((value & 0xffff) & ~DUNGEON_ACTION_POINT_MASK);
}

export function setLandCellSecretState(value: number, state: LandCellSecretState, hasActionPoint: boolean) {
  if (state === "hidden") return withLandMarkerBand(value, 3);
  if (state === "revealed") return withLandMarkerBand(value, 2);
  return withLandMarkerBand(value, hasActionPoint ? 1 : 0);
}

export function setActionPointMarkerState(
  value: number,
  levelType: LevelType,
  state: ActionPointMarkerState
): number {
  if (state === "none") return clearActionPointMarker(value, levelType);
  if (levelType === "dungeon") return ensureActionPointMarker(value, levelType);
  if (state === "normal") return setLandCellSecretState(value, "normal", true);
  return withLandMarkerBand(value, state === "secret" ? 3 : 2);
}

export function updateActionPointMapCell(
  maps: MapEntity[],
  levelType: LevelType,
  levelIndex: number,
  x: number,
  y: number,
  update: (value: number) => number
) {
  let changed = false;
  const next = maps.map((map) => {
    if (map.levelType !== levelType || map.index !== levelIndex) return map;
    const index = mapTileIndex(map, x, y);
    if (index < 0 || index >= map.tiles.length) return map;
    const value = update(map.tiles[index]);
    if (value === map.tiles[index]) return map;
    const tiles = [...map.tiles];
    tiles[index] = value;
    changed = true;
    return { ...map, tiles };
  });
  return changed ? next : maps;
}

function mapForTrigger(project: Project | null, trigger: TriggerRecord) {
  if (!project || !trigger.levelType || trigger.levelIndex == null) return null;
  return project.maps.find((map) => map.levelType === trigger.levelType && map.index === trigger.levelIndex) ?? null;
}

function landMarkerMagnitude(value: number) {
  if (value < 0) return Math.abs(value);
  return value & ~LAND_NOTE_PATH_MASK;
}

function withLandMarkerBand(value: number, band: 0 | 1 | 2 | 3) {
  const metadata = value > 0 ? value & LAND_NOTE_PATH_MASK : 0;
  let magnitude = landMarkerMagnitude(value);
  for (let index = 0; index < 3 && magnitude > 999; index += 1) magnitude -= 1000;
  const payload = band * 1000 + magnitude;
  if (value < 0) return -payload;
  return signedShort((payload & ~LAND_NOTE_PATH_MASK) | metadata);
}

function signedShort(value: number) {
  const mask = value & 0xffff;
  return mask >= 0x8000 ? mask - 0x10000 : mask;
}
