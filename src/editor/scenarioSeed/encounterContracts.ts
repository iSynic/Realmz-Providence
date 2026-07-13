import type { ScenarioSeedRogueActionKind } from "../scenarioSeed";

export const ROGUE_ACTION_SLOTS: Record<ScenarioSeedRogueActionKind, number> = {
  acrobaticAct: 0,
  detectTrap: 1,
  disarmTrap: 2,
  hearNoise: 3,
  forceLock: 4,
  moveSilently: 5,
  pickLock: 6,
  pickPocket: 7
};
