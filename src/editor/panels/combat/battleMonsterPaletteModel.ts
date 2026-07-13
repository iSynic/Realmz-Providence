import type { MonsterRecord, MonsterSetId } from "../../types";
import { MONSTER_SET_OPTIONS } from "./combatLookups";

export type BattleMonsterPaintEntry = {
  kind: "scenario";
  key: string;
  id: number;
  monster: MonsterRecord;
};

export const MAX_DIVINITY_BATTLE_MONSTER_ID = 217;

const MONSTER_BRUSH_TILE_SIZE = 72;
const MONSTER_BRUSH_TILE_GAP = 8;
const MONSTER_BRUSH_TILE_STRIDE = MONSTER_BRUSH_TILE_SIZE + MONSTER_BRUSH_TILE_GAP;
const MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS = 2;

export function battleMonsterPaintEntries(monsters: MonsterRecord[]): BattleMonsterPaintEntry[] {
  return monsters
    .filter((monster) => monster.id > 0 && monster.id <= MAX_DIVINITY_BATTLE_MONSTER_ID)
    .map((monster) => ({ kind: "scenario", key: `scenario:${monster.id}`, id: monster.id, monster }));
}

export function battleMonsterPaintEntrySearchText(entry: BattleMonsterPaintEntry) {
  return `${entry.id} ${entry.monster.displayName} icon ${entry.monster.iconId} hd ${entry.monster.hitDice} scenario`;
}

export function monsterSetLabel(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.label ?? "Normal";
}

export function monsterSetFile(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.file ?? "Data MD";
}

export function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
}

export function monsterBattleStats(monster: MonsterRecord): Array<[string, string | number]> {
  return [
    ["Stamina", monster.hitDice],
    ["Spell Points", monster.spellPoints],
    ["Armor Cat", monster.armor],
    ["Magic Resist", monster.magicResistance],
    ["Movement", monster.movementMax],
    ["Alliance", monster.traitor],
    ["Experience", monster.exp],
    ["# Att", monster.attackCount]
  ];
}

export function monsterPlacementTitle(monster: MonsterRecord | null | undefined, rawValue: number, setId: MonsterSetId = 0) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster
    ? `${monster.displayName || `Monster ${monster.id}`} | Monster ${monster.id}${side}`
    : `${monsterSetLabel(setId)} Monster ${id} missing${side}`;
}

export function monsterPlacementLabel(monster: MonsterRecord | null | undefined, rawValue: number, setId: MonsterSetId = 0) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster
    ? `${monster.displayName || `Monster ${monster.id}`} | ${monsterFacts(monster)}${side}`
    : `${monsterSetLabel(setId)} Monster ${id} missing in ${monsterSetFile(setId)}${side}`;
}

export function monsterBrushPaletteWindow(total: number, width: number, height: number, scrollTop: number) {
  if (total <= 0) return { startIndex: 0, endIndex: 0, topSpacer: 0, bottomSpacer: 0 };
  if (width <= 0 || height <= 0) return { startIndex: 0, endIndex: total, topSpacer: 0, bottomSpacer: 0 };
  const columns = Math.max(1, Math.floor((Math.max(width, MONSTER_BRUSH_TILE_SIZE) + MONSTER_BRUSH_TILE_GAP) / MONSTER_BRUSH_TILE_STRIDE));
  const totalRows = Math.ceil(total / columns);
  const visibleRows = Math.max(1, Math.ceil(Math.max(height, MONSTER_BRUSH_TILE_STRIDE) / MONSTER_BRUSH_TILE_STRIDE));
  const startRow = clamp(Math.floor(scrollTop / MONSTER_BRUSH_TILE_STRIDE) - MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS, 0, totalRows);
  const endRow = clamp(startRow + visibleRows + MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS * 2, startRow, totalRows);
  return {
    startIndex: startRow * columns,
    endIndex: Math.min(total, endRow * columns),
    topSpacer: startRow * MONSTER_BRUSH_TILE_STRIDE,
    bottomSpacer: Math.max(0, (totalRows - endRow) * MONSTER_BRUSH_TILE_STRIDE)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
