import type {
  LandCellSecretState,
  LevelType,
  LibraryCatalog,
  ManagedAsset,
  ManagedAssetKind,
  Project,
  ScenarioSpellOverride,
  SmartBrushPreset
} from "../types";
import type { ScenarioSeedNamedStampName } from "../map/namedLandStamps";
import type { ScenarioSeedNamedTileName } from "../map/namedLandTiles";

export const SCENARIO_SEED_SCHEMA_VERSION = 1;

export type ScenarioSeedRef = number | string;

export type ScenarioSeed = {
  schemaVersion: typeof SCENARIO_SEED_SCHEMA_VERSION;
  baseTemplate?: string;
  scenario: ScenarioSeedScenario;
  maps?: ScenarioSeedMap[];
  messages?: ScenarioSeedMessage[];
  optionLabels?: ScenarioSeedOptionLabel[];
  quests?: ScenarioSeedQuest[];
  battles?: ScenarioSeedBattle[];
  monsters?: ScenarioSeedMonster[];
  treasures?: ScenarioSeedTreasure[];
  shops?: ScenarioSeedShop[];
  items?: ScenarioSeedItem[];
  assets?: ScenarioSeedAsset[];
  simpleEncounters?: ScenarioSeedSimpleEncounter[];
  complexEncounters?: ScenarioSeedComplexEncounter[];
  thiefEncounters?: ScenarioSeedThiefEncounter[];
  timedEncounters?: ScenarioSeedTimedEncounter[];
  spells?: ScenarioSeedSpell[];
  races?: ScenarioSeedRace[];
  castes?: ScenarioSeedCaste[];
  actionPoints?: ScenarioSeedActionPoint[];
  extraActionPoints?: ScenarioSeedExtraActionPoint[];
};

export type ScenarioSeedSpell = {
  key?: string;
  id?: number;
  displayName?: string;
  description?: string;
  inCombat?: boolean;
  inCamp?: boolean;
} & Partial<Record<ScenarioSeedSpellNumberField, number>>;

export type ScenarioSeedSpellNumberField = Exclude<keyof ScenarioSpellOverride, "id" | "displayName" | "description" | "inCombat" | "inCamp" | "authored" | "provenance">;

export type ScenarioSeedRace = {
  key?: string;
  id?: number;
  displayName?: string;
  plusMinusToHit?: number[];
  specialAbility?: number[];
  drvBonus?: number[];
  attBonus?: number[];
  minMax?: number[];
  conditions?: number[];
  numOfAttacks?: number[];
  canCaste?: number[];
  ageRange?: number[][];
  ageChange?: number[][];
  itemTypes?: number[];
} & Partial<Record<"maxAge" | "doesNotDie" | "baseMove" | "magRes" | "twoHand" | "missile" | "canRegenerate" | "defaultIconSet" | "descriptors", number>>;

export type ScenarioSeedCaste = {
  key?: string;
  id?: number;
  displayName?: string;
  specialAbility?: number[][];
  drvBonus?: number[];
  attBonus?: number[];
  spellcasters?: number[][];
  minMax?: number[];
  conditions?: number[];
  stamina?: number[];
  strength?: number[];
  dodge?: number[];
  toHit?: number[];
  missile?: number[];
  hand2Hand?: number[];
  victory?: number[];
  startItems?: ScenarioSeedRef[];
  attacks?: number[];
  itemTypes?: number[];
} & Partial<Record<"canUseMissile" | "getsMissileBonus" | "casteClass" | "minimumAgeGroup" | "moveBonus" | "magRes" | "twoHand" | "maxStaminaBonus" | "bonusAttacks" | "maxAttacks" | "startMoney" | "defaultIcon" | "maxSpellsAttacks" | "spellsSoFar", number>>;

export type ScenarioSeedScenario = {
  id?: string;
  name: string;
  start?: ScenarioSeedStart;
  globalMacros?: ScenarioSeedGlobalMacros;
  restrictions?: ScenarioSeedRestrictions;
  author?: string;
  version?: string;
  date?: string;
  email?: string;
  web?: string;
  description?: string;
};

export type ScenarioSeedGlobalMacros = Partial<Record<"start" | "death" | "quit" | "shop" | "temple", ScenarioSeedRef>>;

export type ScenarioSeedRestrictions = {
  description?: string;
  maxPartyCharacters?: number;
  maxPartyLevel?: number;
  bannedRaces?: number[];
  bannedCastes?: number[];
};

export type ScenarioSeedStart = {
  landLevel: number;
  x: number;
  y: number;
};

export type ScenarioSeedMap = {
  key?: string;
  levelType?: LevelType;
  index?: number;
  name?: string;
  landlook?: number;
  isDark?: boolean;
  useLos?: boolean;
  fillTile?: number;
  tiles?: number[];
  operations?: ScenarioSeedMapOperation[];
  regions?: ScenarioSeedRegion[];
};

export type ScenarioSeedMessage = {
  key?: string;
  id?: number;
  text: string;
};

export type ScenarioSeedOptionLabel = {
  id: number;
  text: string;
};

export type ScenarioSeedQuest = {
  key?: string;
  id?: number;
  label: string;
  note?: string;
};

export type ScenarioSeedAsset =
  | { key: string; source: "stock"; resourceType: string; resourceId: number; kind?: ManagedAssetKind }
  | { key: string; source: "custom-library"; assetId: string; resourceId?: number };

export type ScenarioSeedTimedLocation =
  | { kind: "any" }
  | { kind: "land" | "dungeon"; level: number; randomRectangle?: number; x?: number; y?: number };

export type ScenarioSeedTimedEncounter = {
  key?: string;
  id?: number;
  day: number;
  increment?: number;
  percent?: number;
  macro: ScenarioSeedRef;
  requiredItem?: ScenarioSeedRef;
  requiredQuest?: ScenarioSeedRef;
  location?: ScenarioSeedTimedLocation;
};

export type ScenarioSeedBattle = {
  key?: string;
  id?: number;
  grid?: number[];
  placements?: ScenarioSeedBattlePlacement[];
  dist?: number;
  messageBefore?: number;
  messageAfter?: number;
  battleMacro?: number;
};

export type ScenarioSeedBattlePlacement = {
  x: number;
  y: number;
  monster: ScenarioSeedRef;
  friendly?: boolean;
};

export type ScenarioSeedMonster = {
  key?: string;
  id?: number;
  libraryEntry?: string;
  variants?: "normalOnly" | "copyAll" | "generated";
  name?: string;
  displayName?: string;
  description?: string;
  iconId?: number;
  icon?: ScenarioSeedRef;
  attacks?: number[][];
  typeFlags?: number[];
  saves?: number[];
  spellImmunities?: number[];
  money?: number[];
  spells?: number[];
  items?: ScenarioSeedRef[];
  weapon?: ScenarioSeedRef;
  underneath?: number[];
  conditions?: number[];
  notOnMenu?: boolean;
  deathMacro?: ScenarioSeedRef;
} & Partial<Record<ScenarioSeedMonsterNumberField, number>>;

export type ScenarioSeedMonsterNumberField =
  | "hitDice"
  | "staminaBonus"
  | "agility"
  | "nameId"
  | "movementMax"
  | "armor"
  | "magicResistance"
  | "distance"
  | "traitor"
  | "size"
  | "attackCount"
  | "magicAttackCount"
  | "damageBonus"
  | "castPercent"
  | "runPercent"
  | "surrenderPercent"
  | "missilePercent"
  | "canSummon"
  | "spellPoints"
  | "exp"
  | "stamina"
  | "staminaMax"
  | "target"
  | "guarding"
  | "beenAttacked"
  | "movement"
  | "magicToHit"
  | "lr"
  | "up"
  | "attackNum"
  | "bonusAttack"
  | "maxSpellPoints";

export type ScenarioSeedTreasure = {
  key?: string;
  id?: number;
  itemIds?: ScenarioSeedRef[];
  exp?: number;
  gold?: number;
  gems?: number;
  jewelry?: number;
};

export type ScenarioSeedShop = {
  key?: string;
  id?: number;
  stock?: Array<{ itemId: ScenarioSeedRef; quantity?: number }>;
  inflation?: number;
};

export type ScenarioSeedItem = {
  key?: string;
  id?: number;
  itemId?: number;
  unidentifiedName?: string;
  identifiedName?: string;
  description?: string;
  iconId?: number;
  icon?: ScenarioSeedRef;
  typeName?: ScenarioSeedItemTypeName;
} & Partial<Record<ScenarioSeedItemNumberField, number>>;

export type ScenarioSeedItemTypeName =
  | "ring"
  | "unused"
  | "meleeWeapon"
  | "shield"
  | "armorOrRobe"
  | "gauntletOrGloves"
  | "cloakOrCape"
  | "helmetOrCap"
  | "ionStone"
  | "boots"
  | "quiver"
  | "waistOrBelt"
  | "neck"
  | "scrollCase"
  | "miscItem"
  | "missileWeapon"
  | "broach"
  | "faceOrMask"
  | "scabbard"
  | "beltLoop"
  | "scroll"
  | "magicItem"
  | "supplyItem"
  | "actionPointItem"
  | "identifiedItem"
  | "scenarioItem";

export type ScenarioSeedItemNumberField =
  | "type"
  | "st"
  | "blunt"
  | "hands"
  | "lu"
  | "movement"
  | "ac"
  | "magicResistance"
  | "damage"
  | "spellPoints"
  | "sound"
  | "weight"
  | "cost"
  | "charge"
  | "cursedItemId"
  | "magical"
  | "itemCat0"
  | "itemCat1"
  | "raceRestrictions"
  | "casteRestrictions"
  | "specificRace"
  | "specificCaste"
  | "raceClassOnly"
  | "casteClassOnly"
  | "vSmall"
  | "vLarge"
  | "heat"
  | "cold"
  | "electric"
  | "vsUndead"
  | "vsDemonDevil"
  | "vsEvil"
  | "special1"
  | "special2"
  | "special3"
  | "special4"
  | "special5"
  | "weightPerCharge"
  | "dropOnEmpty";

export type ScenarioSeedSimpleEncounter = {
  key?: string;
  id?: number;
  prompt?: ScenarioSeedRef;
  options?: ScenarioSeedSimpleEncounterOption[];
  texts?: string[];
  actions?: ScenarioSeedEncounterAction[];
  choiceResults?: number[];
  canBackOut?: boolean;
  maxTimes?: number;
  casteSuccess?: number;
};

export type ScenarioSeedSimpleEncounterOption = {
  label: string;
  steps: ScenarioSeedStep[];
};

export type ScenarioSeedComplexEncounter = {
  key?: string;
  id?: number;
  prompt?: ScenarioSeedRef;
  physicalActions?: string[];
  requiredPhysicalActions?: number[];
  physicalResult?: ScenarioSeedComplexResultNumber;
  word?: { text: string; result: ScenarioSeedComplexResultNumber };
  spells?: Array<{ spell: number; result: ScenarioSeedComplexResultNumber }>;
  items?: Array<{ item: ScenarioSeedRef; result: ScenarioSeedComplexResultNumber }>;
  thief?: { encounter: ScenarioSeedRef };
  results?: ScenarioSeedComplexResultScript[];
  actions?: ScenarioSeedEncounterAction[];
  canBackOut?: boolean;
  maxTimes?: number;
  casteSuccess?: number;
};

export type ScenarioSeedRogueActionKind =
  | "acrobaticAct"
  | "detectTrap"
  | "disarmTrap"
  | "hearNoise"
  | "forceLock"
  | "moveSilently"
  | "pickLock"
  | "pickPocket";

export type ScenarioSeedRogueOutcome = {
  result?: ScenarioSeedComplexResultNumber;
  message?: ScenarioSeedRef;
  sound?: ScenarioSeedRef;
};

export type ScenarioSeedRogueAction = {
  kind: ScenarioSeedRogueActionKind;
  modifier?: number;
  success: ScenarioSeedRogueOutcome;
  failure: ScenarioSeedRogueOutcome;
};

export type ScenarioSeedThiefEncounter = {
  key?: string;
  id?: number;
  prompt?: ScenarioSeedRef;
  actions?: ScenarioSeedRogueAction[];
  trap?: {
    armed?: boolean;
    rogueOnly?: boolean;
    damage?: { low: number; high: number };
    sound?: ScenarioSeedRef;
    spell?: number;
    spellPower?: number;
    disarmChancePerLevel?: number;
  };
  lock?: {
    tumblers?: number;
    openChancePerLevel?: number;
  };
};

export type ScenarioSeedComplexResultNumber = 1 | 2 | 3 | 4;

export type ScenarioSeedComplexResultScript = {
  result: ScenarioSeedComplexResultNumber;
  steps: ScenarioSeedStep[];
};

export type ScenarioSeedEncounterAction = {
  slot?: number;
  rawCode: number;
  id: number;
};

export type ScenarioSeedActionPoint = {
  key?: string;
  id?: string;
  recordIndex?: number;
  levelType?: LevelType;
  levelIndex?: number;
  map?: ScenarioSeedRef;
  at?: ScenarioSeedRef;
  x?: number;
  y?: number;
  percent?: number;
  steps: ScenarioSeedStep[];
};

export type ScenarioSeedExtraActionPoint = {
  key?: string;
  id?: number;
  steps: ScenarioSeedStep[];
};

export type ScenarioSeedRegion = {
  key: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type ScenarioSeedMapOperation =
  | { kind: "fill"; tile: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; tile: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; tile: number }
  | { kind: "path"; points: ScenarioSeedPoint[]; tile: number }
  | { kind: "border"; x: number; y: number; width: number; height: number; tile: number; thickness?: number }
  | { kind: "room"; x: number; y: number; width: number; height: number; wallTile: number; floorTile: number; doors?: ScenarioSeedRoomDoor[] }
  | { kind: "road" | "river"; points: ScenarioSeedPoint[]; tile: number; width?: number }
  | { kind: "semanticRoad"; paths: ScenarioSeedPoint[][] }
  | { kind: "semanticRoute"; connections: string[][]; style?: "direct" | "natural" }
  | { kind: "stamp"; x: number; y: number; tiles: number[][] }
  | { kind: "namedStamp"; x: number; y: number; name: ScenarioSeedNamedStampName; variant?: number; region?: string; anchor?: ScenarioSeedStampAnchor }
  | { kind: "namedTile"; x: number; y: number; name: ScenarioSeedNamedTileName; variant?: number; region?: string }
  | { kind: "terrainGroup"; terrain: SmartBrushPreset; geometry: ScenarioSeedTerrainGeometry }
  | { kind: "naturalScatter"; geometry: ScenarioSeedTerrainGeometry; density?: number; spacing?: number }
  | { kind: "landmass"; x: number; y: number; radiusX: number; radiusY: number; roughness?: number }
  | { kind: "castleRoom"; x: number; y: number; width: number; height: number; floorVariant?: number; doors?: ScenarioSeedCastleRoomDoor[] }
  | { kind: "landSecret"; x: number; y: number; state: LandCellSecretState }
  | { kind: "hiddenWalkable"; x: number; y: number; tile?: ScenarioSeedHiddenWalkableTile }
  | { kind: "combatClearing"; x: number; y: number; tile?: ScenarioSeedCombatClearingTile }
  | { kind: "dungeonPassage"; x: number; y: number; directions: ScenarioSeedDungeonDirection[] };

export type ScenarioSeedPoint = { x: number; y: number };

export type ScenarioSeedTerrainGeometry =
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "path"; points: ScenarioSeedPoint[]; width?: number }
  | { kind: "blob"; x: number; y: number; radiusX: number; radiusY: number; roughness?: number };

export type ScenarioSeedCastleRoomDoor = {
  side: "north" | "south" | "west" | "east";
  offset: number;
  region?: string;
};

export type ScenarioSeedStampAnchor = "northWest" | "northEast" | "southWest" | "southEast";

export type ScenarioSeedHiddenWalkableTile = 96 | 169 | 184;
export type ScenarioSeedCombatClearingTile = 59 | 60 | 61 | 62 | 63 | 64 | 65 | 180 | 181 | 182 | 183 | 184 | 185;
export type ScenarioSeedDungeonDirection = "north" | "east" | "south" | "west";

export type ScenarioSeedRoomDoor = {
  side: "north" | "south" | "west" | "east";
  offset: number;
  tile: number;
};

export type ScenarioSeedBranchTargetKind = "actionPoint" | "simpleEncounter" | "complexEncounter";

export type ScenarioSeedPartyCondition =
  | number
  | "torchLit"
  | "waterworld"
  | "dragonHide"
  | "discoverSecret"
  | "wizardEye"
  | "search"
  | "freeFallLevitate"
  | "sentry"
  | "charmResistance";

export type ScenarioSeedCharacterSelector = "party" | "picked" | number;

export type ScenarioSeedTileParameter = "shoreline" | "boatRequired" | "path" | "blocksLos" | "flyFloatRequired" | "forest" | "tileId";

export type ScenarioSeedTimeMode = "set" | "offset";
export type ScenarioSeedBoatStatus = "inBoat" | "notInBoat";
export type ScenarioSeedRandomRectangleShape =
  | { mode: "unchanged" }
  | { mode: "absolute"; left: number; right: number; top: number; bottom: number }
  | { mode: "offset"; x: number; y: number }
  | { mode: "warp"; left: number; right: number; top: number; bottom: number };

export type ScenarioSeedStep =
  | { kind: "message"; message: ScenarioSeedRef }
  | { kind: "battle"; battle: ScenarioSeedRef; battleHigh?: ScenarioSeedRef; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; reviveParty?: boolean }
  | { kind: "simpleEncounter"; encounter: ScenarioSeedRef }
  | { kind: "complexEncounter"; encounter: ScenarioSeedRef }
  | { kind: "shop"; shop: ScenarioSeedRef }
  | { kind: "treasure"; treasure: ScenarioSeedRef }
  | { kind: "sound"; sound: ScenarioSeedRef }
  | { kind: "picture"; picture: ScenarioSeedRef }
  | { kind: "scrollingText"; text: ScenarioSeedRef }
  | { kind: "victoryPoints"; amount: number }
  | { kind: "temple"; inflation: number }
  | { kind: "banking"; shop?: ScenarioSeedRef }
  | { kind: "displayMap"; map: number }
  | { kind: "pickCharacters"; count: number; inverse?: boolean }
  | { kind: "returnGosub" }
  | { kind: "popStack" }
  | { kind: "addSpecialCharacter"; monster: ScenarioSeedRef }
  | { kind: "dropSpecialCharacter"; monster: ScenarioSeedRef }
  | { kind: "teleport"; landLevel?: number; map?: ScenarioSeedRef; at?: ScenarioSeedRef; x?: number; y?: number; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; teleportOnly?: boolean }
  | { kind: "randomMessage"; low: ScenarioSeedRef; high: ScenarioSeedRef }
  | { kind: "selectiveBattle"; battleLow: ScenarioSeedRef; battleHigh?: ScenarioSeedRef; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; treasure?: ScenarioSeedRef; improved?: boolean; cowardMacro?: ScenarioSeedRef }
  | { kind: "battleOutcome"; battleLow: ScenarioSeedRef; battleHigh?: ScenarioSeedRef; cowardMacro?: ScenarioSeedRef; sound?: ScenarioSeedRef; message?: ScenarioSeedRef }
  | { kind: "improvedBattleOutcome"; battleLow: ScenarioSeedRef; battleHigh?: ScenarioSeedRef; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; cowardMacro?: ScenarioSeedRef }
  | { kind: "causeRout"; monsters: ScenarioSeedRef[] }
  | { kind: "battleMacroCriteria"; mode: 0 | 1 | 2; roundOrPercent: number; repeatMode: 0 | 1 | 2; macroLow: ScenarioSeedRef; macroHigh?: ScenarioSeedRef }
  | { kind: "spawnMonsters"; monster: ScenarioSeedRef; countOrRandomLimit: number; sound?: ScenarioSeedRef; traitorOverride?: number }
  | { kind: "destroyRelatedMonsters"; monster: ScenarioSeedRef; maxCount?: number; includeTraitorSide?: boolean }
  | { kind: "continueIfMonsterPresent"; monster: ScenarioSeedRef }
  | { kind: "alterTimedEncounter"; timedEncounter: ScenarioSeedRef; percent?: number; increment?: number; resetFromCurrentDay?: boolean; daysUntilNext?: number }
  | { kind: "branchOnQuest"; quest: ScenarioSeedRef; test?: number; branchMode?: number; target?: ScenarioSeedRef; code?: number }
  | { kind: "setQuestFlag"; quest: ScenarioSeedRef }
  | { kind: "questValue"; quest: ScenarioSeedRef; amount: number; branchType?: number; threshold?: number; target?: ScenarioSeedRef }
  | { kind: "branchOnQuestValue"; quest: ScenarioSeedRef; testValue?: number; branchType?: number; lessThanTarget?: ScenarioSeedRef; equalOrGreaterTarget?: ScenarioSeedRef }
  | { kind: "branchOnRandom"; mode?: number; low: number; high: number; sound?: ScenarioSeedRef; message?: ScenarioSeedRef }
  | { kind: "branchOnPercent"; percent: number; successBehavior?: number; branchMode?: number; target?: ScenarioSeedRef; code?: number }
  | { kind: "changeTile"; level?: number; x: number; y: number; tile: number; dungeon?: boolean }
  | { kind: "healHurtParty"; multiplier: number; low: number; high: number; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; picked?: boolean }
  | { kind: "takeGold"; amount: number; failureMarker?: number }
  | { kind: "giveCondition"; who?: number; condition: number; duration: number; sound?: ScenarioSeedRef }
  | { kind: "awardRandomItems"; count: number; lowItem: ScenarioSeedRef; highItem: ScenarioSeedRef }
  | { kind: "branchOnItem"; item: ScenarioSeedRef; targetKind?: ScenarioSeedBranchTargetKind; possessedTarget: ScenarioSeedRef; missingBehavior?: "branch" | "continue" | "message"; missingTarget?: ScenarioSeedRef }
  | { kind: "branchOnItemCharges"; item: ScenarioSeedRef; minimumCharges: number; targetKind?: ScenarioSeedBranchTargetKind; enoughTarget?: ScenarioSeedRef; insufficientTarget?: ScenarioSeedRef }
  | { kind: "dropItems"; item: ScenarioSeedRef; count?: number }
  | { kind: "changeItemCharges"; item: ScenarioSeedRef; amount: number; count?: number }
  | { kind: "replaceItems"; item: ScenarioSeedRef; replacementItem: ScenarioSeedRef; count?: number }
  | { kind: "branchOnPartyCondition"; condition: ScenarioSeedPartyCondition; when?: "present" | "absent"; targetKind?: ScenarioSeedBranchTargetKind; target: ScenarioSeedRef }
  | { kind: "branchOnCharacterCondition"; condition: number; selector?: ScenarioSeedCharacterSelector; successTarget: ScenarioSeedRef; failureTarget: ScenarioSeedRef }
  | { kind: "branchOnTileParameter"; test: ScenarioSeedTileParameter; tile?: number; targetKind?: ScenarioSeedBranchTargetKind; falseTarget?: ScenarioSeedRef; trueTarget?: ScenarioSeedRef }
  | { kind: "copyActionPointSteps"; source: ScenarioSeedRef }
  | { kind: "enableActionPoint"; target: ScenarioSeedRef; level?: number; percent?: number }
  | { kind: "disableActionPoint"; target: ScenarioSeedRef; level?: number }
  | { kind: "patchActionPoint"; target: ScenarioSeedRef; source: ScenarioSeedRef; level?: number; levelType?: LevelType }
  | { kind: "setDarkLevel"; dark: boolean; stopIfUnchanged?: boolean }
  | { kind: "alterGameTime"; mode: ScenarioSeedTimeMode; days?: number; hours?: number; minutes?: number }
  | { kind: "branchOnGameTime"; dayAtMost?: number; hourAtMost?: number; successMacro: ScenarioSeedRef; failureMacro: ScenarioSeedRef }
  | { kind: "boatCampStatus"; continueBoat?: ScenarioSeedBoatStatus; continueCamping?: "camping" | "notCamping"; setBoat?: ScenarioSeedBoatStatus }
  | { kind: "alterFatigue"; mode: "maximum" | "minimum" | "percent"; percent?: number }
  | { kind: "changeSpellPoints"; rolls: number; low: number; high: number; take?: boolean; sound?: ScenarioSeedRef; message?: ScenarioSeedRef }
  | { kind: "branchOnSpellPoints"; scope: "picked" | "alive"; minimum: number; onFailure?: "continue" | "exitSave"; successMacro: ScenarioSeedRef }
  | { kind: "castSpell"; scope: "picked" | "party"; spell: number; power: number; saveModifier?: number; noSave?: boolean }
  | { kind: "takeVictoryPoints"; amount: number; scope?: "each" | "picked" | "spread" }
  | { kind: "alterPicked"; attribute: "meleeAttacks" | "spellAttacks" | "movement" | "damage" | "spellPoints" | "handToHand" | "stamina" | "armor" | "toHit" | "missileToHit" | "magicResistance" | "prestige"; amount: number }
  | { kind: "clericTurning"; enabled: boolean }
  | { kind: "dropAllEquipment" }
  | { kind: "compass"; enabled: boolean }
  | { kind: "faceDirection"; direction: "north" | "east" | "south" | "west" | "random" }
  | { kind: "dungeonView"; mode: "force3d" | "allow2d" }
  | { kind: "endBattle" }
  | { kind: "backUpParty" }
  | { kind: "levelUpPicked" }
  | { kind: "randomBattles"; enabled: boolean }
  | { kind: "allies"; enabled: boolean }
  | { kind: "alterRandomEncounterRectangle"; level: number; rectangle: number; encounterRate: number; battleLow?: ScenarioSeedRef; battleHigh?: ScenarioSeedRef; dungeon?: boolean }
  | { kind: "alterRandomRectangle"; level: number; rectangle: number; encounterPercentDelta?: number; dungeon?: boolean; shape: ScenarioSeedRandomRectangleShape }
  | { kind: "enterExitDungeon"; mode: number; level: number; x: number; y: number; heading: number }
  | { kind: "edcd"; opcode: number; values: number[] }
  | { kind: "raw"; rawCode: number; id: number };

export type ScenarioSeedParseResult =
  | { ok: true; seed: ScenarioSeed; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export type ScenarioSeedAllocationEntry = {
  key: string;
  id: number;
  explicit: boolean;
};

export type ScenarioSeedMapAllocationEntry = {
  key: string;
  levelType: LevelType;
  index: number;
  explicit: boolean;
};

export type ScenarioSeedRegionAllocationEntry = {
  key: string;
  mapKey?: string;
  levelType: LevelType;
  index: number;
  x: number;
  y: number;
};

export type ScenarioSeedAllocationReport = {
  baseTemplate: string;
  messages: ScenarioSeedAllocationEntry[];
  quests: ScenarioSeedAllocationEntry[];
  battles: ScenarioSeedAllocationEntry[];
  monsters: ScenarioSeedAllocationEntry[];
  treasures: ScenarioSeedAllocationEntry[];
  shops: ScenarioSeedAllocationEntry[];
  items: ScenarioSeedAllocationEntry[];
  assets: ScenarioSeedAssetAllocationEntry[];
  simpleEncounters: ScenarioSeedAllocationEntry[];
  complexEncounters: ScenarioSeedAllocationEntry[];
  thiefEncounters: ScenarioSeedAllocationEntry[];
  timedEncounters: ScenarioSeedAllocationEntry[];
  spells: ScenarioSeedAllocationEntry[];
  races: ScenarioSeedAllocationEntry[];
  castes: ScenarioSeedAllocationEntry[];
  actionPoints: ScenarioSeedAllocationEntry[];
  extraActionPoints: ScenarioSeedAllocationEntry[];
  maps: ScenarioSeedMapAllocationEntry[];
  regions: ScenarioSeedRegionAllocationEntry[];
};

export type ScenarioSeedAssetAllocationEntry = {
  key: string;
  source: "stock" | "custom-library";
  resourceType: string;
  resourceId: number;
  bundled: boolean;
};

export type ScenarioSeedDiagnostic = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  family?: string;
  key?: string;
};

export type ScenarioSeedProjectResult =
  | { ok: true; project: Project; warnings: string[]; allocations: ScenarioSeedAllocationReport; diagnostics: ScenarioSeedDiagnostic[] }
  | { ok: false; errors: string[]; warnings: string[]; allocations?: ScenarioSeedAllocationReport; diagnostics: ScenarioSeedDiagnostic[] };

export type ScenarioSeedProjectOptions = {
  now?: string;
  appVersion?: string;
  customAssets?: ManagedAsset[];
  baseTemplates?: Record<string, Project>;
  libraryCatalog?: LibraryCatalog | null;
};
