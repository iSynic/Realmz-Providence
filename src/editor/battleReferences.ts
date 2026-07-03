import { Project } from "./types";

export const BATTLE_GRID_CELL_COUNT = 13 * 13;
export const BATTLE_RUNTIME_MONSTER_LIMIT = 100;

export type BattleMonsterReference = {
  battleId: number;
  slot: number;
  row: number;
  col: number;
  rawValue: number;
  monsterId: number;
  forcedFriendly: boolean;
};

export type BattleMonsterReferenceRewrite =
  | { mode: "clear"; monsterId: number }
  | { mode: "replace"; fromId: number; toId: number }
  | { mode: "swap"; fromId: number; toId: number };

export function countBattleRuntimeMonsterSlots(grid: number[]) {
  return grid.filter((value) => value !== 0).length;
}

export function battleReferencesForMonster(project: Project, monsterId: number): BattleMonsterReference[] {
  const targetId = Math.trunc(Math.abs(monsterId));
  if (!targetId) return [];
  const references: BattleMonsterReference[] = [];
  for (const battle of project.battles ?? []) {
    for (const [slot, rawValue] of battle.grid.entries()) {
      const referencedId = Math.abs(rawValue);
      if (referencedId !== targetId) continue;
      references.push({
        battleId: battle.id,
        slot,
        row: Math.floor(slot / 13),
        col: slot % 13,
        rawValue,
        monsterId: referencedId,
        forcedFriendly: rawValue < 0
      });
    }
  }
  return references;
}

export function battleReferencesByMonster(project: Project) {
  const byMonster = new Map<number, BattleMonsterReference[]>();
  for (const battle of project.battles ?? []) {
    for (const [slot, rawValue] of battle.grid.entries()) {
      const monsterId = Math.abs(rawValue);
      if (!monsterId) continue;
      const references = byMonster.get(monsterId) ?? [];
      references.push({
        battleId: battle.id,
        slot,
        row: Math.floor(slot / 13),
        col: slot % 13,
        rawValue,
        monsterId,
        forcedFriendly: rawValue < 0
      });
      byMonster.set(monsterId, references);
    }
  }
  return byMonster;
}

export function rewriteBattleMonsterReferences(project: Project, rewrite: BattleMonsterReferenceRewrite): Project {
  const normalized = normalizeRewrite(rewrite);
  if (!normalized) return project;
  let changed = false;
  const battles = (project.battles ?? []).map((battle) => {
    let battleChanged = false;
    const grid = battle.grid.map((rawValue) => {
      const nextValue = rewriteBattleGridValue(rawValue, normalized);
      if (nextValue !== rawValue) battleChanged = true;
      return nextValue;
    });
    if (!battleChanged) return battle;
    changed = true;
    return { ...battle, grid, authored: true };
  });
  return changed ? { ...project, battles } : project;
}

function rewriteBattleGridValue(rawValue: number, rewrite: BattleMonsterReferenceRewrite) {
  const sign = rawValue < 0 ? -1 : 1;
  const monsterId = Math.abs(rawValue);
  if (!monsterId) return rawValue;
  if (rewrite.mode === "clear") {
    return monsterId === rewrite.monsterId ? 0 : rawValue;
  }
  if (rewrite.mode === "replace") {
    return monsterId === rewrite.fromId ? sign * rewrite.toId : rawValue;
  }
  if (rewrite.mode === "swap") {
    if (monsterId === rewrite.fromId) return sign * rewrite.toId;
    if (monsterId === rewrite.toId) return sign * rewrite.fromId;
  }
  return rawValue;
}

function normalizeRewrite(rewrite: BattleMonsterReferenceRewrite): BattleMonsterReferenceRewrite | null {
  if (rewrite.mode === "clear") {
    const monsterId = Math.trunc(Math.abs(rewrite.monsterId));
    return monsterId > 0 ? { mode: "clear", monsterId } : null;
  }
  const fromId = Math.trunc(Math.abs(rewrite.fromId));
  const toId = Math.trunc(Math.abs(rewrite.toId));
  if (!fromId || !toId || fromId === toId) return null;
  return rewrite.mode === "swap" ? { mode: "swap", fromId, toId } : { mode: "replace", fromId, toId };
}
