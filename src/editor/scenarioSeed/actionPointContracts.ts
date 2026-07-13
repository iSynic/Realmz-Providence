import type {
  ScenarioSeedPartyCondition,
  ScenarioSeedTileParameter
} from "../scenarioSeed";

export const ALTER_PICKED_ATTRIBUTE_CODES = {
  meleeAttacks: 1,
  spellAttacks: 2,
  movement: 3,
  damage: 4,
  spellPoints: 5,
  handToHand: 6,
  stamina: 7,
  armor: 8,
  toHit: 9,
  missileToHit: 10,
  magicResistance: 11,
  prestige: 12
} as const;

export const DIRECTION_CODES = {
  north: 1,
  east: 2,
  south: 3,
  west: 4,
  random: -1
} as const;

export const PARTY_CONDITION_CODES: Record<Exclude<ScenarioSeedPartyCondition, number>, number> = {
  torchLit: 0,
  waterworld: 1,
  dragonHide: 2,
  discoverSecret: 3,
  wizardEye: 4,
  search: 5,
  freeFallLevitate: 6,
  sentry: 7,
  charmResistance: 8
};

export const TILE_PARAMETER_CODES: Record<ScenarioSeedTileParameter, number> = {
  shoreline: 1,
  boatRequired: 2,
  path: 3,
  blocksLos: 4,
  flyFloatRequired: 5,
  forest: 6,
  tileId: 7
};
