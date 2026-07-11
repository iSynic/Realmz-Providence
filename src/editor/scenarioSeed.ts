import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import {
  Action,
  BattleRecord,
  ComplexEncounterRecord,
  EncounterActionRow,
  ExtraCodeRow,
  ItemTextRecord,
  LandCellSecretState,
  LevelType,
  LibraryCatalog,
  MapEntity,
  ManagedAsset,
  ManagedAssetKind,
  MessageRecord,
  MonsterDescriptionRecord,
  MonsterRecord,
  Project,
  Provenance,
  QuestLabel,
  RandomLevel,
  ShopRecord,
  ScenarioItemRecord,
  ScenarioRaceOverride,
  ScenarioCasteOverride,
  ScenarioSpellOverride,
  SimpleEncounterRecord,
  SmartBrushPreset,
  SmartBrushProfile,
  SmartBrushRole,
  ThiefEncounterRecord,
  TilesetAsset,
  TimedEncounterRecord,
  TreasureRecord,
  TriggerRecord
} from "./types";
import { nextResourceId } from "./mediaAssets";
import { browserReferenceAtlasUrl, hasBrowserReferenceAtlas } from "./browser/atlasPaths";
import { createBrowserProject, validateBrowserProject } from "./browser/project";
import { landlookBaseTile, landlookName, landlookPictId } from "./browser/realmzParser";
import { clearActionPointMarker, ensureActionPointMarker, landCellSecretState, setLandCellSecretState } from "./map/actionPointMarkers";
import { setDungeonCellFlags } from "./map/dungeonCellFlags";
import { GENERATED_SMART_TERRAIN_PROFILES } from "./map/generatedSmartTerrainProfiles";
import { defaultStockCombatClearingTile, defaultStockHiddenWalkableTile, isStockCombatClearingTile, isStockHiddenWalkableTile } from "./map/secrets";
import { monsterLibraryEntryDescription, monsterLibraryEntryTemplate } from "./monsterLibrary";
import { copyCurrentMonsterToAllSets, generateMonsterVariants } from "./projectCommands/targetRecordCommands";
import { createCasteOverride, createRaceOverride, createSpellOverride } from "./projectCommands/scenarioRulesCommands";

export const SCENARIO_SEED_SCHEMA_VERSION = 1;

const PROJECT_SCHEMA_VERSION = 4;
const MAP_SIZE = 90;
const MAP_TILE_MIN = -32768;
const MAP_TILE_MAX = 32767;
const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
const RANDOM_LEVEL_BYTES = 644;
const MESSAGE_BYTES = 256;
const BATTLE_BYTES = 346;
const MONSTER_BYTES = 210;
const MONSTER_DESCRIPTION_BYTES = 256;
const TREASURE_BYTES = 48;
const SHOP_BYTES = 3002;
const ITEM_BYTES = 100;
const SIMPLE_ENCOUNTER_BYTES = 426;
const COMPLEX_ENCOUNTER_BYTES = 520;
const THIEF_ENCOUNTER_BYTES = 118;
const TIMED_ENCOUNTER_BYTES = 40;
const EXTRACODE_BYTES = 10;
const DOOR_BYTES = 40;
const SCENARIO_ITEM_ID_BASE = 800;
const SCENARIO_ITEM_RECORD_COUNT = 200;
const MAGIC_RESPONSE_BLANK_SPELL_ID = 1100;

const ROGUE_ACTION_SLOTS: Record<ScenarioSeedRogueActionKind, number> = {
  acrobaticAct: 0,
  detectTrap: 1,
  disarmTrap: 2,
  hearNoise: 3,
  forceLock: 4,
  moveSilently: 5,
  pickLock: 6,
  pickPocket: 7
};

const PARTY_CONDITION_CODES: Record<Exclude<ScenarioSeedPartyCondition, number>, number> = {
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

const TILE_PARAMETER_CODES: Record<ScenarioSeedTileParameter, number> = {
  shoreline: 1,
  boatRequired: 2,
  path: 3,
  blocksLos: 4,
  flyFloatRequired: 5,
  forest: 6,
  tileId: 7
};

export type ScenarioSeedRef = number | string;

export type ScenarioSeed = {
  schemaVersion: typeof SCENARIO_SEED_SCHEMA_VERSION;
  baseTemplate?: string;
  scenario: ScenarioSeedScenario;
  maps?: ScenarioSeedMap[];
  messages?: ScenarioSeedMessage[];
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

export type ScenarioSeedSpellNumberField = Exclude<keyof ScenarioSpellOverride, "id" | "displayName" | "description" | "inCombat" | "inCamp" | "rawBytes" | "authored" | "provenance">;

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
  author?: string;
  version?: string;
  date?: string;
  email?: string;
  web?: string;
  description?: string;
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
  | { kind: "stamp"; x: number; y: number; tiles: number[][] }
  | { kind: "terrainGroup"; terrain: SmartBrushPreset; geometry: ScenarioSeedTerrainGeometry }
  | { kind: "landSecret"; x: number; y: number; state: LandCellSecretState }
  | { kind: "hiddenWalkable"; x: number; y: number; tile?: ScenarioSeedHiddenWalkableTile }
  | { kind: "combatClearing"; x: number; y: number; tile?: ScenarioSeedCombatClearingTile }
  | { kind: "dungeonPassage"; x: number; y: number; directions: ScenarioSeedDungeonDirection[] };

export type ScenarioSeedPoint = { x: number; y: number };

export type ScenarioSeedTerrainGeometry =
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "path"; points: ScenarioSeedPoint[]; width?: number };

export type ScenarioSeedHiddenWalkableTile = 96 | 169;
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
  | { kind: "teleport"; landLevel?: number; x?: number; y?: number; sound?: ScenarioSeedRef; message?: ScenarioSeedRef; teleportOnly?: boolean }
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

const SCENARIO_ITEM_NUMBER_FIELDS: ScenarioSeedItemNumberField[] = [
  "type",
  "st",
  "blunt",
  "hands",
  "lu",
  "movement",
  "ac",
  "magicResistance",
  "damage",
  "spellPoints",
  "sound",
  "weight",
  "cost",
  "charge",
  "cursedItemId",
  "magical",
  "itemCat0",
  "itemCat1",
  "raceRestrictions",
  "casteRestrictions",
  "specificRace",
  "specificCaste",
  "raceClassOnly",
  "casteClassOnly",
  "vSmall",
  "vLarge",
  "heat",
  "cold",
  "electric",
  "vsUndead",
  "vsDemonDevil",
  "vsEvil",
  "special1",
  "special2",
  "special3",
  "special4",
  "special5",
  "weightPerCharge",
  "dropOnEmpty"
];

const SCENARIO_MONSTER_NUMBER_FIELDS: ScenarioSeedMonsterNumberField[] = [
  "hitDice",
  "staminaBonus",
  "agility",
  "nameId",
  "movementMax",
  "armor",
  "magicResistance",
  "distance",
  "traitor",
  "size",
  "attackCount",
  "magicAttackCount",
  "damageBonus",
  "castPercent",
  "runPercent",
  "surrenderPercent",
  "missilePercent",
  "canSummon",
  "spellPoints",
  "exp",
  "stamina",
  "staminaMax",
  "target",
  "guarding",
  "beenAttacked",
  "movement",
  "magicToHit",
  "lr",
  "up",
  "attackNum",
  "bonusAttack",
  "maxSpellPoints"
];

const SCENARIO_SPELL_NUMBER_FIELDS: ScenarioSeedSpellNumberField[] = [
  "range1", "range2", "queueIcon", "toHitBonus", "saveBonus", "fixedTargetNum", "canRotate", "saveAdjust",
  "cannot", "resistAdjust", "cost", "damage1", "damage2", "powerDamage1", "powerDamage2", "duration1", "duration2",
  "powerDuration1", "powerDuration2", "spellLook1", "spellLook2", "sound1", "sound2", "targetType", "size", "special",
  "damageType", "spellClass"
];

const SCENARIO_RACE_NUMBER_FIELDS = ["maxAge", "doesNotDie", "baseMove", "magRes", "twoHand", "missile", "canRegenerate", "defaultIconSet", "descriptors"] as const;
const SCENARIO_CASTE_NUMBER_FIELDS = ["canUseMissile", "getsMissileBonus", "casteClass", "minimumAgeGroup", "moveBonus", "magRes", "twoHand", "maxStaminaBonus", "bonusAttacks", "maxAttacks", "startMoney", "defaultIcon", "maxSpellsAttacks", "spellsSoFar"] as const;

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

type ParseContext = {
  errors: string[];
  warnings: string[];
};

type ObjectValue = Record<string, unknown>;

type MapTarget = { levelType: LevelType; index: number; x?: number; y?: number };
type ActionPointTarget = { levelType: LevelType; levelIndex: number; recordIndex: number };
type ScenarioSeedResolvedAsset = { kind: ManagedAssetKind; resourceType: string; resourceId: number; bundled: boolean };
type ActionBuildScope =
  | { kind: "map"; levelType: LevelType; levelIndex: number; recordIndex: number }
  | { kind: "extra"; recordIndex: number }
  | { kind: "encounter"; encounterType: "simple" | "complex"; recordIndex: number; result: ScenarioSeedComplexResultNumber };

type BuildContext = {
  errors: string[];
  warnings: string[];
  diagnostics: ScenarioSeedDiagnostic[];
  allocations: ScenarioSeedAllocationReport;
  messages: Map<string, number>;
  quests: Map<string, number>;
  battles: Map<string, number>;
  monsters: Map<string, number>;
  treasures: Map<string, number>;
  shops: Map<string, number>;
  items: Map<string, number>;
  assets: Map<string, ScenarioSeedResolvedAsset>;
  simpleEncounters: Map<string, number>;
  complexEncounters: Map<string, number>;
  thiefEncounters: Map<string, number>;
  timedEncounters: Map<string, number>;
  spells: Map<string, number>;
  races: Map<string, number>;
  castes: Map<string, number>;
  actionPoints: Map<string, number>;
  actionPointTargets: Map<string, ActionPointTarget>;
  extraActionPoints: Map<string, number>;
  maps: Map<string, MapTarget>;
  regions: Map<string, MapTarget & { x: number; y: number }>;
  libraryCatalog: LibraryCatalog | null;
};

const SCENARIO_ITEM_TYPE_CODES: Record<ScenarioSeedItemTypeName, number> = {
  ring: 0,
  unused: 1,
  meleeWeapon: 2,
  shield: 3,
  armorOrRobe: 4,
  gauntletOrGloves: 5,
  cloakOrCape: 6,
  helmetOrCap: 7,
  ionStone: 8,
  boots: 9,
  quiver: 10,
  waistOrBelt: 11,
  neck: 12,
  scrollCase: 13,
  miscItem: 14,
  missileWeapon: 15,
  broach: 16,
  faceOrMask: 17,
  scabbard: 18,
  beltLoop: 19,
  scroll: 20,
  magicItem: 21,
  supplyItem: 22,
  actionPointItem: 23,
  identifiedItem: 24,
  scenarioItem: 25
};

const ALTER_PICKED_ATTRIBUTE_CODES = {
  meleeAttacks: 1, spellAttacks: 2, movement: 3, damage: 4, spellPoints: 5, handToHand: 6,
  stamina: 7, armor: 8, toHit: 9, missileToHit: 10, magicResistance: 11, prestige: 12
} as const;

const DIRECTION_CODES = { north: 1, east: 2, south: 3, west: 4, random: -1 } as const;

export function parseScenarioSeed(input: unknown): ScenarioSeedParseResult {
  const ctx: ParseContext = { errors: [], warnings: [] };
  const root = requireObject(input, "$", ctx);
  if (!root) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  allowKeys(root, "$", ["schemaVersion", "baseTemplate", "scenario", "maps", "messages", "quests", "battles", "monsters", "treasures", "shops", "items", "assets", "simpleEncounters", "complexEncounters", "thiefEncounters", "timedEncounters", "spells", "races", "castes", "actionPoints", "extraActionPoints"], ctx);

  const schemaVersion = requireInteger(root.schemaVersion, "$.schemaVersion", ctx);
  if (schemaVersion !== null && schemaVersion !== SCENARIO_SEED_SCHEMA_VERSION) {
    ctx.errors.push(`$.schemaVersion must be ${SCENARIO_SEED_SCHEMA_VERSION}.`);
  }
  const scenario = parseScenario(root.scenario, "$.scenario", ctx);
  const baseTemplate = root.baseTemplate === undefined ? undefined : requireString(root.baseTemplate, "$.baseTemplate", ctx);
  const seed: ScenarioSeed = {
    schemaVersion: SCENARIO_SEED_SCHEMA_VERSION,
    ...(baseTemplate ? { baseTemplate } : {}),
    scenario: scenario ?? { name: "Untitled Scenario" }
  };

  const maps = parseArray(root.maps, "$.maps", ctx, parseMap);
  if (maps) seed.maps = maps;
  const messages = parseArray(root.messages, "$.messages", ctx, parseMessage);
  if (messages) seed.messages = messages;
  const quests = parseArray(root.quests, "$.quests", ctx, parseQuest);
  if (quests) seed.quests = quests;
  const battles = parseArray(root.battles, "$.battles", ctx, parseBattle);
  if (battles) seed.battles = battles;
  const monsters = parseArray(root.monsters, "$.monsters", ctx, parseMonster);
  if (monsters) seed.monsters = monsters;
  const treasures = parseArray(root.treasures, "$.treasures", ctx, parseTreasure);
  if (treasures) seed.treasures = treasures;
  const shops = parseArray(root.shops, "$.shops", ctx, parseShop);
  if (shops) seed.shops = shops;
  const items = parseArray(root.items, "$.items", ctx, parseItem);
  if (items) seed.items = items;
  const assets = parseArray(root.assets, "$.assets", ctx, parseAsset);
  if (assets) seed.assets = assets;
  const simpleEncounters = parseArray(root.simpleEncounters, "$.simpleEncounters", ctx, parseSimpleEncounter);
  if (simpleEncounters) seed.simpleEncounters = simpleEncounters;
  const complexEncounters = parseArray(root.complexEncounters, "$.complexEncounters", ctx, parseComplexEncounter);
  if (complexEncounters) seed.complexEncounters = complexEncounters;
  const thiefEncounters = parseArray(root.thiefEncounters, "$.thiefEncounters", ctx, parseThiefEncounter);
  if (thiefEncounters) seed.thiefEncounters = thiefEncounters;
  const timedEncounters = parseArray(root.timedEncounters, "$.timedEncounters", ctx, parseTimedEncounter);
  if (timedEncounters) seed.timedEncounters = timedEncounters;
  const spells = parseArray(root.spells, "$.spells", ctx, parseSpell);
  if (spells) seed.spells = spells;
  const races = parseArray(root.races, "$.races", ctx, parseRace);
  if (races) seed.races = races;
  const castes = parseArray(root.castes, "$.castes", ctx, parseCaste);
  if (castes) seed.castes = castes;
  const actionPoints = parseArray(root.actionPoints, "$.actionPoints", ctx, parseActionPoint);
  if (actionPoints) seed.actionPoints = actionPoints;
  const extraActionPoints = parseArray(root.extraActionPoints, "$.extraActionPoints", ctx, parseExtraActionPoint);
  if (extraActionPoints) seed.extraActionPoints = extraActionPoints;

  validateUniqueIds(seed.messages, "messages", ctx);
  validateUniqueIds(seed.quests, "quests", ctx);
  validateUniqueIds(seed.battles, "battles", ctx);
  validateUniqueIds(seed.monsters, "monsters", ctx);
  validateUniqueIds(seed.treasures, "treasures", ctx);
  validateUniqueIds(seed.shops, "shops", ctx);
  validateUniqueIds(seed.items, "items", ctx);
  validateItems(seed.items, ctx);
  validateUniqueIds(seed.assets, "assets", ctx);
  validateUniqueIds(seed.simpleEncounters, "simpleEncounters", ctx);
  validateUniqueIds(seed.complexEncounters, "complexEncounters", ctx);
  validateUniqueIds(seed.thiefEncounters, "thiefEncounters", ctx);
  validateUniqueIds(seed.timedEncounters, "timedEncounters", ctx);
  validateUniqueIds(seed.spells, "spells", ctx);
  validateUniqueIds(seed.races, "races", ctx);
  validateUniqueIds(seed.castes, "castes", ctx);
  if ((seed.races?.length ?? 0) > 70) ctx.errors.push("$.races can contain at most 70 override records.");
  if ((seed.castes?.length ?? 0) > 30) ctx.errors.push("$.castes can contain at most 30 override records.");
  validateUniqueIds(seed.extraActionPoints, "extraActionPoints", ctx);
  validateMaps(seed.maps, ctx);

  if (ctx.errors.length > 0) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  return { ok: true, seed, warnings: ctx.warnings };
}

export function createProjectFromScenarioSeed(input: unknown, options: ScenarioSeedProjectOptions = {}): ScenarioSeedProjectResult {
  const parsed = parseScenarioSeed(input);
  if (!parsed.ok) return { ...parsed, diagnostics: parsed.errors.map((message) => ({ severity: "error", code: "parse-error", message })) };

  const now = options.now ?? new Date().toISOString();
  const seed = parsed.seed;
  const baseTemplate = seed.baseTemplate ?? "blank";
  const buildContext = createBuildContext(baseTemplate, options.libraryCatalog ?? null);
  const project = createScenarioSeedBaseProject(seed.scenario.name, baseTemplate, options, buildContext);
  if (!project) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  allocateSeedIds(seed, buildContext);
  if (buildContext.errors.length > 0) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  project.schemaVersion = PROJECT_SCHEMA_VERSION;
  project.appVersion = options.appVersion ?? "scenario-seed";
  const scenarioDefaults = createBrowserProject(seed.scenario.name).scenario;
  const scenarioShell = project.scenario.shell ?? scenarioDefaults.shell;
  const contactInfo = project.scenario.contactInfo ?? scenarioDefaults.contactInfo;
  project.scenario = {
    ...project.scenario,
    id: seed.scenario.id ?? project.scenario.id,
    name: seed.scenario.name,
    projectPath: `seed://${slugify(seed.scenario.name)}.providence`,
    importedAt: now,
    shell: scenarioShell
      ? { ...scenarioShell, sourceFile: seed.scenario.name, authored: true }
      : null,
    contactInfo: contactInfo
      ? {
          ...contactInfo,
          scenarioName: seed.scenario.name,
          version: seed.scenario.version ?? contactInfo.version,
          date: seed.scenario.date ?? contactInfo.date,
          author: seed.scenario.author ?? contactInfo.author,
          email: seed.scenario.email ?? contactInfo.email,
          web: seed.scenario.web ?? contactInfo.web,
          description: seed.scenario.description ?? contactInfo.description,
          authored: true
        }
      : null
  };
  project.source = {
    sourcePath: `seed://${slugify(seed.scenario.name)}`,
    rawSourcesDir: baseTemplate === "blank" ? "scenario-seed" : project.source.rawSourcesDir || "scenario-seed",
    immutable: false,
    files: baseTemplate === "blank" ? [] : [...(project.source.files ?? [])]
  };

  if (seed.assets !== undefined) {
    project.assets = buildSeedAssets(seed.assets, options.customAssets ?? [], buildContext);
  }

  if (seed.maps !== undefined) {
    project.maps = seed.maps.map((map, index) => buildMap(map, index));
    project.randomLevels = seed.maps.map((map, index) => buildRandomLevel(map, index));
    project.assetCatalog = {
      ...project.assetCatalog,
      tilesets: buildTilesets(project.maps)
    };
  }

  if (seed.messages !== undefined) {
    project.messages = seed.messages.map((message) => ({
      id: message.id ?? 0,
      text: message.text,
      rawBytes: new Array(MESSAGE_BYTES).fill(0),
      authored: true,
      provenance: authoredProvenance("Data SD2", message.id ?? 0, (message.id ?? 0) * MESSAGE_BYTES, MESSAGE_BYTES)
    }));
  }
  if (seed.quests !== undefined) project.questLabels = seed.quests.map((quest): QuestLabel => ({ id: quest.id ?? 0, label: quest.label, ...(quest.note !== undefined ? { note: quest.note } : {}) })).sort((a, b) => a.id - b.id);
  if (seed.monsters !== undefined) {
    const builtMonsters = seed.monsters.map((monster) => {
      const library = resolveMonsterLibraryEntry(monster, buildContext);
      return {
        record: buildMonster(monster, buildContext, library?.record),
        description: buildMonsterDescription(monster, library?.description)
      };
    });
    project.monsters = builtMonsters.map((built) => built.record);
    project.monsterDescriptions = builtMonsters.map((built) => built.description).filter((record): record is MonsterDescriptionRecord => record !== null);
    let variantProject = project;
    for (const monster of seed.monsters) {
      const id = monster.id ?? 0;
      if (monster.variants === "copyAll") variantProject = copyCurrentMonsterToAllSets(variantProject, id, 0);
      if (monster.variants === "generated") variantProject = generateMonsterVariants(variantProject, id);
    }
    project.monsterSets = variantProject.monsterSets;
  }
  if (seed.battles !== undefined) project.battles = seed.battles.map((battle) => buildBattle(battle, buildContext));
  if (seed.items !== undefined) {
    project.scenarioItems = seed.items.map((item) => buildItem(item, buildContext));
    project.itemTexts = seed.items.map(buildItemText).filter((record): record is ItemTextRecord => record !== null);
  }
  if (seed.treasures !== undefined) project.treasures = seed.treasures.map((treasure) => buildTreasure(treasure, buildContext));
  if (seed.shops !== undefined) project.shops = seed.shops.map((shop) => buildShop(shop, buildContext));

  const baseMapTriggers = project.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const baseExtraActionPoints = project.triggers.filter((trigger) => trigger.source === "Data ED3");
  const simpleBuild = buildSimpleEncounters(seed.simpleEncounters ?? [], buildContext, project.extracodes);
  if (seed.simpleEncounters !== undefined) project.simpleEncounters = simpleBuild.records;
  if (seed.thiefEncounters !== undefined) project.thiefEncounters = seed.thiefEncounters.map((encounter) => buildThiefEncounter(encounter, buildContext));
  const complexBuild = buildComplexEncounters(seed.complexEncounters ?? [], buildContext, simpleBuild.extracodes);
  if (seed.complexEncounters !== undefined) project.complexEncounters = complexBuild.records;
  if (seed.timedEncounters !== undefined) project.timedEncounters = seed.timedEncounters.map((encounter) => buildTimedEncounter(encounter, buildContext));
  if (seed.spells !== undefined) {
    let rulesProject: Project = { ...project, spellOverrides: [] };
    for (const { key: _key, id, ...template } of seed.spells) rulesProject = createSpellOverride(rulesProject, id, template);
    project.spellOverrides = rulesProject.spellOverrides;
  }
  if (seed.races !== undefined) {
    let rulesProject: Project = { ...project, raceOverrides: [] };
    for (const { key: _key, id, ...template } of seed.races) rulesProject = createRaceOverride(rulesProject, id, template);
    project.raceOverrides = rulesProject.raceOverrides;
    project.ruleNames = rulesProject.ruleNames;
  }
  if (seed.castes !== undefined) {
    let rulesProject: Project = { ...project, casteOverrides: [] };
    for (const { key: _key, id, ...caste } of seed.castes) {
      const template = { ...caste, startItems: caste.startItems?.map((item) => resolveItemRef(item, buildContext)) };
      rulesProject = createCasteOverride(rulesProject, id, template);
    }
    project.casteOverrides = rulesProject.casteOverrides;
    project.ruleNames = rulesProject.ruleNames;
  }

  const triggerBuild = buildTriggers(seed.actionPoints ?? [], seed.extraActionPoints ?? [], buildContext, complexBuild.extracodes);
  const generatedMapTriggers = triggerBuild.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const generatedExtraActionPoints = triggerBuild.triggers.filter((trigger) => trigger.source === "Data ED3");
  project.triggers = [
    ...(seed.actionPoints === undefined ? baseMapTriggers : generatedMapTriggers),
    ...(seed.extraActionPoints === undefined ? baseExtraActionPoints : generatedExtraActionPoints)
  ];
  project.maps = syncActionPointMarkers(project.maps, project.triggers);
  project.extracodes = triggerBuild.extracodes;
  project.validation = validateBrowserProject(project);
  if (buildContext.errors.length > 0) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings, ...project.validation.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  return { ok: true, project, warnings: [...parsed.warnings, ...buildContext.warnings, ...project.validation.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
}

function createScenarioSeedBaseProject(projectName: string, baseTemplate: string, options: ScenarioSeedProjectOptions, context: BuildContext): Project | null {
  if (baseTemplate === "blank") return createBrowserProject(projectName);
  const templates = options.baseTemplates;
  if (!templates || !Object.prototype.hasOwnProperty.call(templates, baseTemplate)) {
    addDiagnostic(context, "error", "unresolved-base-template", `Base template "${baseTemplate}" was not provided by the caller.`, "base template", baseTemplate);
    return null;
  }
  const template = templates[baseTemplate];
  try {
    return JSON.parse(JSON.stringify(template)) as Project;
  } catch {
    addDiagnostic(context, "error", "invalid-base-template", `Base template "${baseTemplate}" could not be cloned as Providence project data.`, "base template", baseTemplate);
    return null;
  }
}

function parseScenario(input: unknown, path: string, ctx: ParseContext): ScenarioSeedScenario | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["id", "name", "author", "version", "date", "email", "web", "description"], ctx);
  const name = requireString(value.name, `${path}.name`, ctx);
  return {
    ...(optionalString(value.id, `${path}.id`, ctx) !== undefined ? { id: optionalString(value.id, `${path}.id`, ctx) } : {}),
    name: name ?? "Untitled Scenario",
    ...(optionalString(value.author, `${path}.author`, ctx) !== undefined ? { author: optionalString(value.author, `${path}.author`, ctx) } : {}),
    ...(optionalString(value.version, `${path}.version`, ctx) !== undefined ? { version: optionalString(value.version, `${path}.version`, ctx) } : {}),
    ...(optionalString(value.date, `${path}.date`, ctx) !== undefined ? { date: optionalString(value.date, `${path}.date`, ctx) } : {}),
    ...(optionalString(value.email, `${path}.email`, ctx) !== undefined ? { email: optionalString(value.email, `${path}.email`, ctx) } : {}),
    ...(optionalString(value.web, `${path}.web`, ctx) !== undefined ? { web: optionalString(value.web, `${path}.web`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {})
  };
}

function parseAsset(input: unknown, path: string, ctx: ParseContext): ScenarioSeedAsset | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const source = requireString(value.source, `${path}.source`, ctx);
  if (source === "stock") {
    allowKeys(value, path, ["key", "source", "resourceType", "resourceId", "kind"], ctx);
    const kind = optionalManagedAssetKind(value.kind, `${path}.kind`, ctx);
    return {
      key: requireString(value.key, `${path}.key`, ctx) ?? "asset",
      source,
      resourceType: requireString(value.resourceType, `${path}.resourceType`, ctx) ?? "????",
      resourceId: requireInteger(value.resourceId, `${path}.resourceId`, ctx) ?? 0,
      ...(kind !== undefined ? { kind } : {})
    };
  }
  if (source === "custom-library") {
    allowKeys(value, path, ["key", "source", "assetId", "resourceId"], ctx);
    const resourceId = optionalInteger(value.resourceId, `${path}.resourceId`, ctx);
    return {
      key: requireString(value.key, `${path}.key`, ctx) ?? "asset",
      source,
      assetId: requireString(value.assetId, `${path}.assetId`, ctx) ?? "missing",
      ...(resourceId !== undefined ? { resourceId } : {})
    };
  }
  allowKeys(value, path, ["key", "source", "resourceType", "resourceId", "kind", "assetId"], ctx);
  ctx.errors.push(`${path}.source must be stock or custom-library.`);
  return null;
}

function parseTimedEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTimedEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "day", "increment", "percent", "macro", "requiredItem", "requiredQuest", "location"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const day = requireInteger(value.day, `${path}.day`, ctx);
  const increment = optionalInteger(value.increment, `${path}.increment`, ctx);
  const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
  const requiredItem = optionalRef(value.requiredItem, `${path}.requiredItem`, ctx);
  const requiredQuest = optionalRef(value.requiredQuest, `${path}.requiredQuest`, ctx);
  const location = value.location === undefined ? undefined : parseTimedLocation(value.location, `${path}.location`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, 32767, ctx);
  checkIntegerRange(day, `${path}.day`, 1, 32767, ctx);
  checkIntegerRange(increment, `${path}.increment`, 0, 32767, ctx);
  checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    day: day ?? 1,
    ...(increment !== undefined ? { increment } : {}),
    ...(percent !== undefined ? { percent } : {}),
    macro: requireRef(value.macro, `${path}.macro`, ctx),
    ...(requiredItem !== undefined ? { requiredItem } : {}),
    ...(requiredQuest !== undefined ? { requiredQuest } : {}),
    ...(location !== undefined ? { location } : {})
  };
}

function parseSpell(input: unknown, path: string, ctx: ParseContext): ScenarioSeedSpell | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "displayName", "description", "inCombat", "inCamp", ...SCENARIO_SPELL_NUMBER_FIELDS], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, 104, ctx);
  const record: ScenarioSeedSpell = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(optionalString(value.displayName, `${path}.displayName`, ctx) !== undefined ? { displayName: optionalString(value.displayName, `${path}.displayName`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {}),
    ...(optionalBoolean(value.inCombat, `${path}.inCombat`, ctx) !== undefined ? { inCombat: optionalBoolean(value.inCombat, `${path}.inCombat`, ctx) } : {}),
    ...(optionalBoolean(value.inCamp, `${path}.inCamp`, ctx) !== undefined ? { inCamp: optionalBoolean(value.inCamp, `${path}.inCamp`, ctx) } : {})
  };
  for (const field of SCENARIO_SPELL_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseRace(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRace | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const arrayFields = { plusMinusToHit: 8, specialAbility: 14, drvBonus: 8, attBonus: 6, minMax: 12, conditions: 40, numOfAttacks: 2, canCaste: 30, itemTypes: 2 } as const;
  allowKeys(value, path, ["key", "id", "displayName", ...Object.keys(arrayFields), "ageRange", "ageChange", ...SCENARIO_RACE_NUMBER_FIELDS], ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, 69, ctx);
  const record: ScenarioSeedRace = {
    ...optionalStringProperty(value, "key", path, ctx),
    ...(id !== undefined ? { id } : {}),
    ...optionalStringProperty(value, "displayName", path, ctx)
  };
  for (const [field, length] of Object.entries(arrayFields) as Array<[keyof typeof arrayFields, number]>) {
    const parsed = optionalFixedIntegerArray(value[field], `${path}.${field}`, length, ctx);
    if (parsed) record[field] = parsed;
  }
  const ageRange = optionalFixedIntegerMatrix(value.ageRange, `${path}.ageRange`, 5, 2, ctx);
  const ageChange = optionalFixedIntegerMatrix(value.ageChange, `${path}.ageChange`, 5, 15, ctx);
  if (ageRange) record.ageRange = ageRange;
  if (ageChange) record.ageChange = ageChange;
  for (const field of SCENARIO_RACE_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseCaste(input: unknown, path: string, ctx: ParseContext): ScenarioSeedCaste | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const arrayFields = { drvBonus: 8, attBonus: 6, minMax: 12, conditions: 40, stamina: 2, strength: 2, dodge: 2, toHit: 2, missile: 2, hand2Hand: 2, victory: 30, attacks: 10, itemTypes: 2 } as const;
  allowKeys(value, path, ["key", "id", "displayName", "specialAbility", "spellcasters", "startItems", ...Object.keys(arrayFields), ...SCENARIO_CASTE_NUMBER_FIELDS], ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, 29, ctx);
  const record: ScenarioSeedCaste = {
    ...optionalStringProperty(value, "key", path, ctx),
    ...(id !== undefined ? { id } : {}),
    ...optionalStringProperty(value, "displayName", path, ctx)
  };
  for (const [field, length] of Object.entries(arrayFields) as Array<[keyof typeof arrayFields, number]>) {
    const parsed = optionalFixedIntegerArray(value[field], `${path}.${field}`, length, ctx);
    if (parsed) record[field] = parsed;
  }
  const specialAbility = optionalFixedIntegerMatrix(value.specialAbility, `${path}.specialAbility`, 2, 14, ctx);
  const spellcasters = optionalFixedIntegerMatrix(value.spellcasters, `${path}.spellcasters`, 4, 3, ctx);
  const startItems = parseRefArray(value.startItems, `${path}.startItems`, ctx);
  if (startItems && startItems.length !== 20) ctx.errors.push(`${path}.startItems must contain exactly 20 entries.`);
  if (specialAbility) record.specialAbility = specialAbility;
  if (spellcasters) record.spellcasters = spellcasters;
  if (startItems) record.startItems = startItems;
  for (const field of SCENARIO_CASTE_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseTimedLocation(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTimedLocation {
  const value = requireObject(input, path, ctx);
  if (!value) return { kind: "any" };
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "any") {
    allowKeys(value, path, ["kind"], ctx);
    return { kind };
  }
  if (kind === "land" || kind === "dungeon") {
    allowKeys(value, path, ["kind", "level", "randomRectangle", "x", "y"], ctx);
    const level = requireInteger(value.level, `${path}.level`, ctx);
    const randomRectangle = optionalInteger(value.randomRectangle, `${path}.randomRectangle`, ctx);
    const x = optionalInteger(value.x, `${path}.x`, ctx);
    const y = optionalInteger(value.y, `${path}.y`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, 32767, ctx);
    checkIntegerRange(randomRectangle, `${path}.randomRectangle`, 0, 19, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if ((x === undefined) !== (y === undefined)) ctx.errors.push(`${path}.x and ${path}.y must be provided together.`);
    return { kind, level: level ?? 0, ...(randomRectangle !== undefined ? { randomRectangle } : {}), ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}) };
  }
  allowKeys(value, path, ["kind", "level", "randomRectangle", "x", "y"], ctx);
  ctx.errors.push(`${path}.kind must be any, land, or dungeon.`);
  return { kind: "any" };
}

function parseMap(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMap | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "levelType", "index", "name", "landlook", "isDark", "useLos", "fillTile", "tiles", "operations", "regions"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
  const index = optionalInteger(value.index, `${path}.index`, ctx);
  const name = optionalString(value.name, `${path}.name`, ctx);
  const landlook = optionalInteger(value.landlook, `${path}.landlook`, ctx);
  const fillTile = optionalInteger(value.fillTile, `${path}.fillTile`, ctx);
  const tiles = parseIntegerArray(value.tiles, `${path}.tiles`, ctx);
  const operations = parseArray(value.operations, `${path}.operations`, ctx, parseMapOperation);
  const regions = parseArray(value.regions, `${path}.regions`, ctx, parseRegion);
  if (tiles && tiles.length !== MAP_SIZE * MAP_SIZE) {
    ctx.errors.push(`${path}.tiles must contain exactly ${MAP_SIZE * MAP_SIZE} entries for a Realmz map.`);
  }
  checkIntegerRange(index, `${path}.index`, 0, null, ctx);
  checkIntegerRange(landlook, `${path}.landlook`, 0, null, ctx);
  checkIntegerRange(fillTile, `${path}.fillTile`, MAP_TILE_MIN, MAP_TILE_MAX, ctx);
  tiles?.forEach((tile, tileIndex) => checkIntegerRange(tile, `${path}.tiles[${tileIndex}]`, MAP_TILE_MIN, MAP_TILE_MAX, ctx));
  validateMapOperationLevelTypes(operations ?? [], levelType ?? "land", path, ctx);
  if ((operations ?? []).some((operation) => operation.kind === "terrainGroup")
      && !GENERATED_SMART_TERRAIN_PROFILES.some((profile) => profile.landlook === (landlook ?? 0))) {
    ctx.errors.push(`${path}.landlook ${landlook ?? 0} does not have a checked-in semantic terrain profile.`);
  }
  for (let operationIndex = 0; operationIndex < (operations ?? []).length; operationIndex++) {
    const operation = operations?.[operationIndex];
    const mapLandlook = landlook ?? 0;
    if (operation?.kind === "hiddenWalkable" && (operation.tile !== undefined ? !isStockHiddenWalkableTile(operation.tile, mapLandlook) : defaultStockHiddenWalkableTile(mapLandlook) === null)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] hiddenWalkable is not valid for landlook ${mapLandlook}; use that landlook's stock concealed-walkable tiles.`);
    }
    if (operation?.kind === "combatClearing" && (operation.tile !== undefined ? !isStockCombatClearingTile(operation.tile, mapLandlook) : defaultStockCombatClearingTile(mapLandlook) === null)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] combatClearing is not valid for landlook ${mapLandlook}; use that landlook's stock solid tiles with non-solid combat builds.`);
    }
  }
  return {
    ...(key !== undefined ? { key } : {}),
    ...(levelType !== undefined ? { levelType } : {}),
    ...(index !== undefined ? { index } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(landlook !== undefined ? { landlook } : {}),
    ...(optionalBoolean(value.isDark, `${path}.isDark`, ctx) !== undefined ? { isDark: optionalBoolean(value.isDark, `${path}.isDark`, ctx) } : {}),
    ...(optionalBoolean(value.useLos, `${path}.useLos`, ctx) !== undefined ? { useLos: optionalBoolean(value.useLos, `${path}.useLos`, ctx) } : {}),
    ...(fillTile !== undefined ? { fillTile } : {}),
    ...(tiles ? { tiles } : {}),
    ...(operations ? { operations } : {}),
    ...(regions ? { regions } : {})
  };
}

function parseMessage(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMessage | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "text"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const text = requireString(value.text, `${path}.text`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), text: text ?? "" };
}

function parseQuest(input: unknown, path: string, ctx: ParseContext): ScenarioSeedQuest | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "label", "note"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const label = requireString(value.label, `${path}.label`, ctx);
  const note = optionalString(value.note, `${path}.note`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), label: label ?? "", ...(note !== undefined ? { note } : {}) };
}

function parseBattle(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBattle | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "grid", "placements", "dist", "messageBefore", "messageAfter", "battleMacro"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const grid = parseIntegerArray(value.grid, `${path}.grid`, ctx);
  const placements = parseArray(value.placements, `${path}.placements`, ctx, parseBattlePlacement);
  if (grid && grid.length !== 13 * 13) ctx.errors.push(`${path}.grid must contain exactly 169 entries.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(grid ? { grid } : {}),
    ...(placements ? { placements } : {}),
    ...optionalNumberField(value, "dist", path, ctx),
    ...optionalNumberField(value, "messageBefore", path, ctx),
    ...optionalNumberField(value, "messageAfter", path, ctx),
    ...optionalNumberField(value, "battleMacro", path, ctx)
  };
}

function parseBattlePlacement(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBattlePlacement | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["x", "y", "monster", "friendly"], ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 12, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 12, ctx);
  return {
    x: x ?? 0,
    y: y ?? 0,
    monster: requireRef(value.monster, `${path}.monster`, ctx),
    ...(optionalBoolean(value.friendly, `${path}.friendly`, ctx) !== undefined ? { friendly: optionalBoolean(value.friendly, `${path}.friendly`, ctx) } : {})
  };
}

function parseMonster(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMonster | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "libraryEntry", "variants", "name", "displayName", "description", "iconId", "icon", "attacks", "typeFlags", "saves", "spellImmunities", "money", "spells", "items", "weapon", "underneath", "conditions", "notOnMenu", "deathMacro", ...SCENARIO_MONSTER_NUMBER_FIELDS], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  const attacks = parseArray(value.attacks, `${path}.attacks`, ctx, parseMonsterAttack);
  if (attacks && attacks.length > 5) ctx.errors.push(`${path}.attacks can contain at most 5 attack rows.`);
  const typeFlags = parseIntegerArray(value.typeFlags, `${path}.typeFlags`, ctx);
  const saves = parseIntegerArray(value.saves, `${path}.saves`, ctx);
  const spellImmunities = parseIntegerArray(value.spellImmunities, `${path}.spellImmunities`, ctx);
  const money = parseIntegerArray(value.money, `${path}.money`, ctx);
  const spells = parseIntegerArray(value.spells, `${path}.spells`, ctx);
  const items = parseRefArray(value.items, `${path}.items`, ctx);
  const underneath = parseIntegerArray(value.underneath, `${path}.underneath`, ctx);
  const conditions = parseIntegerArray(value.conditions, `${path}.conditions`, ctx);
  validateMaxArrayLength(typeFlags, `${path}.typeFlags`, 8, ctx);
  validateMaxArrayLength(saves, `${path}.saves`, 6, ctx);
  validateMaxArrayLength(spellImmunities, `${path}.spellImmunities`, 6, ctx);
  validateMaxArrayLength(money, `${path}.money`, 3, ctx);
  validateMaxArrayLength(spells, `${path}.spells`, 10, ctx);
  validateMaxArrayLength(items, `${path}.items`, 6, ctx);
  validateMaxArrayLength(underneath, `${path}.underneath`, 4, ctx);
  validateMaxArrayLength(conditions, `${path}.conditions`, 40, ctx);
  const record: ScenarioSeedMonster = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(optionalString(value.libraryEntry, `${path}.libraryEntry`, ctx) !== undefined ? { libraryEntry: optionalString(value.libraryEntry, `${path}.libraryEntry`, ctx) } : {}),
    ...(optionalMonsterVariantMode(value.variants, `${path}.variants`, ctx) !== undefined ? { variants: optionalMonsterVariantMode(value.variants, `${path}.variants`, ctx) } : {}),
    ...(optionalString(value.name, `${path}.name`, ctx) !== undefined ? { name: optionalString(value.name, `${path}.name`, ctx) } : {}),
    ...(optionalString(value.displayName, `${path}.displayName`, ctx) !== undefined ? { displayName: optionalString(value.displayName, `${path}.displayName`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {}),
    ...optionalNumberField(value, "iconId", path, ctx),
    ...optionalRefField(value, "icon", path, ctx),
    ...(attacks ? { attacks } : {}),
    ...(typeFlags ? { typeFlags } : {}),
    ...(saves ? { saves } : {}),
    ...(spellImmunities ? { spellImmunities } : {}),
    ...(money ? { money } : {}),
    ...(spells ? { spells } : {}),
    ...(items ? { items } : {}),
    ...optionalRefField(value, "weapon", path, ctx),
    ...(underneath ? { underneath } : {}),
    ...(conditions ? { conditions } : {}),
    ...(optionalBoolean(value.notOnMenu, `${path}.notOnMenu`, ctx) !== undefined ? { notOnMenu: optionalBoolean(value.notOnMenu, `${path}.notOnMenu`, ctx) } : {}),
    ...optionalRefField(value, "deathMacro", path, ctx)
  };
  for (const field of SCENARIO_MONSTER_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseMonsterAttack(input: unknown, path: string, ctx: ParseContext): number[] | null {
  const values = parseIntegerArray(input, path, ctx);
  if (!values) return null;
  if (values.length !== 4) ctx.errors.push(`${path} must contain exactly 4 byte-sized attack values.`);
  return padArray(values, 4, 0);
}

function parseTreasure(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTreasure | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "itemIds", "exp", "gold", "gems", "jewelry"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const itemIds = parseRefArray(value.itemIds, `${path}.itemIds`, ctx);
  if (itemIds && itemIds.length > 20) ctx.errors.push(`${path}.itemIds can contain at most 20 item IDs.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(itemIds ? { itemIds } : {}),
    ...optionalNumberField(value, "exp", path, ctx),
    ...optionalNumberField(value, "gold", path, ctx),
    ...optionalNumberField(value, "gems", path, ctx),
    ...optionalNumberField(value, "jewelry", path, ctx)
  };
}

function parseShop(input: unknown, path: string, ctx: ParseContext): ScenarioSeedShop | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "stock", "inflation"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const stock = parseArray(value.stock, `${path}.stock`, ctx, parseShopStock);
  if (stock && stock.length > 1000) ctx.errors.push(`${path}.stock can contain at most 1000 entries.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(stock ? { stock } : {}),
    ...optionalNumberField(value, "inflation", path, ctx)
  };
}

function parseShopStock(input: unknown, path: string, ctx: ParseContext): { itemId: ScenarioSeedRef; quantity?: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["itemId", "quantity"], ctx);
  const itemId = requireRef(value.itemId, `${path}.itemId`, ctx);
  const quantity = optionalInteger(value.quantity, `${path}.quantity`, ctx);
  checkIntegerRange(quantity, `${path}.quantity`, 0, 255, ctx);
  return { itemId, ...(quantity !== undefined ? { quantity } : {}) };
}

function parseItem(input: unknown, path: string, ctx: ParseContext): ScenarioSeedItem | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "itemId", "unidentifiedName", "identifiedName", "description", "iconId", "icon", "typeName", ...SCENARIO_ITEM_NUMBER_FIELDS], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const itemId = optionalInteger(value.itemId, `${path}.itemId`, ctx);
  const iconId = optionalInteger(value.iconId, `${path}.iconId`, ctx);
  const icon = optionalRef(value.icon, `${path}.icon`, ctx);
  const typeName = optionalScenarioItemTypeName(value.typeName, `${path}.typeName`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, SCENARIO_ITEM_RECORD_COUNT - 1, ctx);
  checkIntegerRange(itemId, `${path}.itemId`, SCENARIO_ITEM_ID_BASE, SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT - 1, ctx);
  if (id !== undefined && itemId !== undefined && itemId !== SCENARIO_ITEM_ID_BASE + id) {
    ctx.errors.push(`${path}.itemId must equal ${SCENARIO_ITEM_ID_BASE} + id when both are supplied.`);
  }
  if (typeName !== undefined && value.type !== undefined) ctx.errors.push(`${path}.type and ${path}.typeName cannot both be supplied.`);
  const record: ScenarioSeedItem = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(itemId !== undefined ? { itemId } : {}),
    ...(optionalString(value.unidentifiedName, `${path}.unidentifiedName`, ctx) !== undefined ? { unidentifiedName: optionalString(value.unidentifiedName, `${path}.unidentifiedName`, ctx) } : {}),
    ...(optionalString(value.identifiedName, `${path}.identifiedName`, ctx) !== undefined ? { identifiedName: optionalString(value.identifiedName, `${path}.identifiedName`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {}),
    ...(iconId !== undefined ? { iconId } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(typeName !== undefined ? { typeName } : {})
  };
  for (const field of SCENARIO_ITEM_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseSimpleEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedSimpleEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "options", "texts", "actions", "choiceResults", "canBackOut", "maxTimes", "casteSuccess"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const options = parseArray(value.options, `${path}.options`, ctx, parseSimpleEncounterOption);
  const texts = parseStringArray(value.texts, `${path}.texts`, ctx);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseEncounterAction);
  const choiceResults = parseIntegerArray(value.choiceResults, `${path}.choiceResults`, ctx);
  const maxTimes = optionalInteger(value.maxTimes, `${path}.maxTimes`, ctx);
  const casteSuccess = optionalInteger(value.casteSuccess, `${path}.casteSuccess`, ctx);
  if (texts && texts.length > 4) ctx.errors.push(`${path}.texts can contain at most 4 option strings.`);
  for (const [index, text] of (texts ?? []).entries()) {
    if (text.length > 79) ctx.errors.push(`${path}.texts[${index}] must be 79 characters or fewer.`);
  }
  if (actions && actions.length > 32) ctx.errors.push(`${path}.actions can contain at most 32 encounter action slots.`);
  const actionSlots = new Set<number>();
  for (const [index, action] of (actions ?? []).entries()) {
    const slot = action.slot ?? index;
    if (actionSlots.has(slot)) ctx.errors.push(`${path}.actions contains duplicate slot ${slot}.`);
    actionSlots.add(slot);
  }
  if (choiceResults && choiceResults.length > 4) ctx.errors.push(`${path}.choiceResults can contain at most 4 result entries.`);
  for (const [index, result] of (choiceResults ?? []).entries()) {
    if (result === -4 && index === 0) continue;
    checkIntegerRange(result, `${path}.choiceResults[${index}]`, 0, 4, ctx);
  }
  if (options && options.length === 0) ctx.errors.push(`${path}.options must contain at least one option.`);
  if (options && options.length > 4) ctx.errors.push(`${path}.options can contain at most 4 options.`);
  if (options !== undefined && (texts !== undefined || actions !== undefined || choiceResults !== undefined)) {
    ctx.errors.push(`${path} cannot combine semantic options with raw texts, actions, or choiceResults.`);
  }
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  checkIntegerRange(maxTimes, `${path}.maxTimes`, -128, 127, ctx);
  checkIntegerRange(casteSuccess, `${path}.casteSuccess`, -128, 127, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(options ? { options } : {}),
    ...(texts ? { texts } : {}),
    ...(actions ? { actions } : {}),
    ...(choiceResults ? { choiceResults } : {}),
    ...(optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx) !== undefined ? { canBackOut: optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx) } : {}),
    ...(maxTimes !== undefined ? { maxTimes } : {}),
    ...(casteSuccess !== undefined ? { casteSuccess } : {})
  };
}

function parseSimpleEncounterOption(input: unknown, path: string, ctx: ParseContext): ScenarioSeedSimpleEncounterOption | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["label", "steps"], ctx);
  const label = requireString(value.label, `${path}.label`, ctx) ?? "";
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (label.length > 79) ctx.errors.push(`${path}.label must be 79 characters or fewer.`);
  if (steps.length === 0) ctx.errors.push(`${path}.steps must contain at least one step.`);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 steps.`);
  return { label, steps };
}

function parseThiefEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedThiefEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "actions", "trap", "lock"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseRogueAction);
  const trap = value.trap === undefined ? undefined : parseRogueTrap(value.trap, `${path}.trap`, ctx);
  const lock = value.lock === undefined ? undefined : parseRogueLock(value.lock, `${path}.lock`, ctx);
  checkIntegerRange(id, `${path}.id`, 1, 127, ctx);
  if (actions && actions.length > 8) ctx.errors.push(`${path}.actions can contain at most 8 Rogue actions.`);
  const actionKinds = new Set<ScenarioSeedRogueActionKind>();
  for (const action of actions ?? []) {
    if (actionKinds.has(action.kind)) ctx.errors.push(`${path}.actions contains duplicate action ${action.kind}.`);
    actionKinds.add(action.kind);
  }
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(actions ? { actions } : {}),
    ...(trap ? { trap } : {}),
    ...(lock ? { lock } : {})
  };
}

function parseRogueAction(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRogueAction | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["kind", "modifier", "success", "failure"], ctx);
  const rawKind = requireString(value.kind, `${path}.kind`, ctx);
  const kind = rawKind && Object.prototype.hasOwnProperty.call(ROGUE_ACTION_SLOTS, rawKind)
    ? rawKind as ScenarioSeedRogueActionKind
    : "acrobaticAct";
  if (rawKind && !Object.prototype.hasOwnProperty.call(ROGUE_ACTION_SLOTS, rawKind)) {
    ctx.errors.push(`${path}.kind must be one of ${Object.keys(ROGUE_ACTION_SLOTS).join(", ")}.`);
  }
  const modifier = optionalInteger(value.modifier, `${path}.modifier`, ctx);
  checkIntegerRange(modifier, `${path}.modifier`, -128, 127, ctx);
  return {
    kind,
    ...(modifier !== undefined ? { modifier } : {}),
    success: parseRogueOutcome(value.success, `${path}.success`, ctx),
    failure: parseRogueOutcome(value.failure, `${path}.failure`, ctx)
  };
}

function parseRogueOutcome(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRogueOutcome {
  const value = requireObject(input, path, ctx);
  if (!value) return {};
  allowKeys(value, path, ["result", "message", "sound"], ctx);
  const result = optionalComplexResultNumber(value.result, `${path}.result`, ctx);
  const message = optionalRef(value.message, `${path}.message`, ctx);
  const sound = optionalRef(value.sound, `${path}.sound`, ctx);
  if (result === undefined && message === undefined && sound === undefined) {
    ctx.errors.push(`${path} must provide a result, message, or sound.`);
  }
  return {
    ...(result !== undefined ? { result } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(sound !== undefined ? { sound } : {})
  };
}

function parseRogueTrap(input: unknown, path: string, ctx: ParseContext): NonNullable<ScenarioSeedThiefEncounter["trap"]> | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["armed", "rogueOnly", "damage", "sound", "spell", "spellPower", "disarmChancePerLevel"], ctx);
  const armed = optionalBoolean(value.armed, `${path}.armed`, ctx);
  const rogueOnly = optionalBoolean(value.rogueOnly, `${path}.rogueOnly`, ctx);
  const damage = value.damage === undefined ? undefined : parseRogueDamage(value.damage, `${path}.damage`, ctx);
  const sound = optionalRef(value.sound, `${path}.sound`, ctx);
  const spell = optionalInteger(value.spell, `${path}.spell`, ctx);
  const spellPower = optionalInteger(value.spellPower, `${path}.spellPower`, ctx);
  const disarmChancePerLevel = optionalInteger(value.disarmChancePerLevel, `${path}.disarmChancePerLevel`, ctx);
  checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
  checkIntegerRange(spellPower, `${path}.spellPower`, 0, 32767, ctx);
  checkIntegerRange(disarmChancePerLevel, `${path}.disarmChancePerLevel`, 0, 100, ctx);
  return {
    ...(armed !== undefined ? { armed } : {}),
    ...(rogueOnly !== undefined ? { rogueOnly } : {}),
    ...(damage ? { damage } : {}),
    ...(sound !== undefined ? { sound } : {}),
    ...(spell !== undefined ? { spell } : {}),
    ...(spellPower !== undefined ? { spellPower } : {}),
    ...(disarmChancePerLevel !== undefined ? { disarmChancePerLevel } : {})
  };
}

function parseRogueDamage(input: unknown, path: string, ctx: ParseContext): { low: number; high: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["low", "high"], ctx);
  const low = requireInteger(value.low, `${path}.low`, ctx);
  const high = requireInteger(value.high, `${path}.high`, ctx);
  checkIntegerRange(low, `${path}.low`, 0, 32767, ctx);
  checkIntegerRange(high, `${path}.high`, 0, 32767, ctx);
  if (low !== null && high !== null && low > high) ctx.errors.push(`${path}.low must not exceed ${path}.high.`);
  return { low: low ?? 0, high: high ?? 0 };
}

function parseRogueLock(input: unknown, path: string, ctx: ParseContext): NonNullable<ScenarioSeedThiefEncounter["lock"]> | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["tumblers", "openChancePerLevel"], ctx);
  const tumblers = optionalInteger(value.tumblers, `${path}.tumblers`, ctx);
  const openChancePerLevel = optionalInteger(value.openChancePerLevel, `${path}.openChancePerLevel`, ctx);
  checkIntegerRange(tumblers, `${path}.tumblers`, 0, 6, ctx);
  checkIntegerRange(openChancePerLevel, `${path}.openChancePerLevel`, 0, 100, ctx);
  return {
    ...(tumblers !== undefined ? { tumblers } : {}),
    ...(openChancePerLevel !== undefined ? { openChancePerLevel } : {})
  };
}

function parseComplexEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "physicalActions", "requiredPhysicalActions", "physicalResult", "word", "spells", "items", "thief", "results", "actions", "canBackOut", "maxTimes", "casteSuccess"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const physicalActions = parseStringArray(value.physicalActions, `${path}.physicalActions`, ctx);
  const requiredPhysicalActions = parseIntegerArray(value.requiredPhysicalActions, `${path}.requiredPhysicalActions`, ctx);
  const physicalResult = optionalComplexResultNumber(value.physicalResult, `${path}.physicalResult`, ctx);
  const word = value.word === undefined ? undefined : parseComplexWord(value.word, `${path}.word`, ctx);
  const spells = parseArray(value.spells, `${path}.spells`, ctx, parseComplexSpellResponse);
  const items = parseArray(value.items, `${path}.items`, ctx, parseComplexItemResponse);
  const thief = value.thief === undefined ? undefined : parseComplexThiefResponse(value.thief, `${path}.thief`, ctx);
  const results = parseArray(value.results, `${path}.results`, ctx, parseComplexResultScript);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseEncounterAction);
  const maxTimes = optionalInteger(value.maxTimes, `${path}.maxTimes`, ctx);
  const casteSuccess = optionalInteger(value.casteSuccess, `${path}.casteSuccess`, ctx);
  const canBackOut = optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx);

  if (physicalActions && physicalActions.length > 8) ctx.errors.push(`${path}.physicalActions can contain at most 8 choices.`);
  for (const [index, text] of (physicalActions ?? []).entries()) {
    if (text.length > 39) ctx.errors.push(`${path}.physicalActions[${index}] must be 39 characters or fewer.`);
  }
  if (requiredPhysicalActions && requiredPhysicalActions.length > 8) ctx.errors.push(`${path}.requiredPhysicalActions can contain at most 8 choice numbers.`);
  const requiredSet = new Set<number>();
  for (const [index, choice] of (requiredPhysicalActions ?? []).entries()) {
    checkIntegerRange(choice, `${path}.requiredPhysicalActions[${index}]`, 1, 8, ctx);
    if (requiredSet.has(choice)) ctx.errors.push(`${path}.requiredPhysicalActions contains duplicate choice ${choice}.`);
    requiredSet.add(choice);
    if (physicalActions && choice > physicalActions.length) ctx.errors.push(`${path}.requiredPhysicalActions[${index}] points beyond the ${physicalActions.length} physical choices.`);
  }
  if ((requiredPhysicalActions?.length ?? 0) > 0 && (physicalActions?.length ?? 0) === 0) ctx.errors.push(`${path}.requiredPhysicalActions requires at least one physicalActions entry.`);
  if (physicalResult !== undefined && (physicalActions?.length ?? 0) === 0) ctx.errors.push(`${path}.physicalResult requires at least one physicalActions entry.`);
  if (spells && spells.length > 10) ctx.errors.push(`${path}.spells can contain at most 10 responses.`);
  if (items && items.length > 5) ctx.errors.push(`${path}.items can contain at most 5 responses.`);
  if (results && results.length > 4) ctx.errors.push(`${path}.results can contain at most 4 result scripts.`);
  const resultNumbers = new Set<number>();
  for (const result of results ?? []) {
    if (resultNumbers.has(result.result)) ctx.errors.push(`${path}.results contains duplicate result ${result.result}.`);
    resultNumbers.add(result.result);
  }
  if (actions && actions.length > 32) ctx.errors.push(`${path}.actions can contain at most 32 encounter action slots.`);
  const actionSlots = new Set<number>();
  for (const [index, action] of (actions ?? []).entries()) {
    const slot = action.slot ?? index;
    if (actionSlots.has(slot)) ctx.errors.push(`${path}.actions contains duplicate slot ${slot}.`);
    actionSlots.add(slot);
  }
  if (actions !== undefined && results !== undefined) ctx.errors.push(`${path} cannot combine raw actions with semantic results.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  checkIntegerRange(maxTimes, `${path}.maxTimes`, -128, 127, ctx);
  checkIntegerRange(casteSuccess, `${path}.casteSuccess`, -128, 127, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(physicalActions ? { physicalActions } : {}),
    ...(requiredPhysicalActions ? { requiredPhysicalActions } : {}),
    ...(physicalResult !== undefined ? { physicalResult } : {}),
    ...(word ? { word } : {}),
    ...(spells ? { spells } : {}),
    ...(items ? { items } : {}),
    ...(thief ? { thief } : {}),
    ...(results ? { results } : {}),
    ...(actions ? { actions } : {}),
    ...(canBackOut !== undefined ? { canBackOut } : {}),
    ...(maxTimes !== undefined ? { maxTimes } : {}),
    ...(casteSuccess !== undefined ? { casteSuccess } : {})
  };
}

function parseComplexWord(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["text", "result"], ctx);
  const text = requireString(value.text, `${path}.text`, ctx) ?? "";
  if (text.length > 39) ctx.errors.push(`${path}.text must be 39 characters or fewer.`);
  return { text, result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexSpellResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["spell", "result"], ctx);
  const spell = requireInteger(value.spell, `${path}.spell`, ctx);
  checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
  return { spell: spell ?? 0, result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexItemResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["item", "result"], ctx);
  return { item: requireRef(value.item, `${path}.item`, ctx), result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexThiefResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["encounter"], ctx);
  const encounter = requireRef(value.encounter, `${path}.encounter`, ctx);
  if (typeof encounter === "number") checkIntegerRange(encounter, `${path}.encounter`, 1, 127, ctx);
  return { encounter };
}

function parseComplexResultScript(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultScript | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["result", "steps"], ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (steps.length === 0) ctx.errors.push(`${path}.steps must contain at least one step.`);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 steps.`);
  return { result: requireComplexResultNumber(value.result, `${path}.result`, ctx), steps };
}

function optionalComplexResultNumber(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultNumber | undefined {
  if (input === undefined) return undefined;
  return requireComplexResultNumber(input, path, ctx);
}

function requireComplexResultNumber(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultNumber {
  const value = requireInteger(input, path, ctx);
  checkIntegerRange(value, path, 1, 4, ctx);
  return (value !== null && value >= 1 && value <= 4 ? value : 1) as ScenarioSeedComplexResultNumber;
}

function parseEncounterAction(input: unknown, path: string, ctx: ParseContext): ScenarioSeedEncounterAction | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["slot", "rawCode", "id"], ctx);
  const slot = optionalInteger(value.slot, `${path}.slot`, ctx);
  const rawCode = requireInteger(value.rawCode, `${path}.rawCode`, ctx);
  const id = requireInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(slot, `${path}.slot`, 0, 31, ctx);
  checkIntegerRange(rawCode, `${path}.rawCode`, -128, 127, ctx);
  checkIntegerRange(id, `${path}.id`, -32768, 32767, ctx);
  return { ...(slot !== undefined ? { slot } : {}), rawCode: rawCode ?? 0, id: id ?? 0 };
}

function parseRegion(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRegion | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "x", "y", "width", "height"], ctx);
  const key = requireString(value.key, `${path}.key`, ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  const width = optionalInteger(value.width, `${path}.width`, ctx);
  const height = optionalInteger(value.height, `${path}.height`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
  checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
  return { key: key ?? "", x: x ?? 0, y: y ?? 0, ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) };
}

function parseMapOperation(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMapOperation | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "fill") {
    allowKeys(value, path, ["kind", "tile"], ctx);
    return { kind, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "rect") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "line") {
    allowKeys(value, path, ["kind", "x1", "y1", "x2", "y2", "tile"], ctx);
    const x1 = requireInteger(value.x1, `${path}.x1`, ctx);
    const y1 = requireInteger(value.y1, `${path}.y1`, ctx);
    const x2 = requireInteger(value.x2, `${path}.x2`, ctx);
    const y2 = requireInteger(value.y2, `${path}.y2`, ctx);
    checkIntegerRange(x1, `${path}.x1`, 0, 89, ctx);
    checkIntegerRange(y1, `${path}.y1`, 0, 89, ctx);
    checkIntegerRange(x2, `${path}.x2`, 0, 89, ctx);
    checkIntegerRange(y2, `${path}.y2`, 0, 89, ctx);
    return {
      kind,
      x1: x1 ?? 0,
      y1: y1 ?? 0,
      x2: x2 ?? 0,
      y2: y2 ?? 0,
      tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0
    };
  }
  if (kind === "path") {
    allowKeys(value, path, ["kind", "points", "tile"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    return { kind, points, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "border") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "tile", "thickness"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    const thickness = optionalInteger(value.thickness, `${path}.thickness`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkIntegerRange(thickness, `${path}.thickness`, 1, 45, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    if (thickness !== undefined && width !== null && height !== null && thickness > Math.ceil(Math.min(width, height) / 2)) {
      ctx.errors.push(`${path}.thickness is too large for the border's smaller dimension.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0, ...(thickness !== undefined ? { thickness } : {}) };
  }
  if (kind === "room") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "wallTile", "floorTile", "doors"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    const doors = parseArray(value.doors, `${path}.doors`, ctx, parseRoomDoor) ?? [];
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 3, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 3, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    for (let index = 0; index < doors.length; index++) {
      const door = doors[index];
      const limit = door.side === "north" || door.side === "south" ? width : height;
      if (limit !== null && door.offset >= limit) ctx.errors.push(`${path}.doors[${index}].offset must be less than the room's ${door.side === "north" || door.side === "south" ? "width" : "height"}.`);
    }
    return {
      kind,
      x: x ?? 0,
      y: y ?? 0,
      width: width ?? 3,
      height: height ?? 3,
      wallTile: requireMapTile(value.wallTile, `${path}.wallTile`, ctx) ?? 0,
      floorTile: requireMapTile(value.floorTile, `${path}.floorTile`, ctx) ?? 0,
      ...(value.doors !== undefined ? { doors } : {})
    };
  }
  if (kind === "road" || kind === "river") {
    allowKeys(value, path, ["kind", "points", "tile", "width"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    const width = optionalInteger(value.width, `${path}.width`, ctx);
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    checkIntegerRange(width, `${path}.width`, 1, 15, ctx);
    const routeWidth = width ?? 1;
    const before = Math.floor((routeWidth - 1) / 2);
    const after = routeWidth - before - 1;
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      const point = points[pointIndex];
      if (point.x - before < 0 || point.x + after >= MAP_SIZE || point.y - before < 0 || point.y + after >= MAP_SIZE) {
        ctx.errors.push(`${path}.points[${pointIndex}] does not leave enough map space for width ${routeWidth}.`);
      }
    }
    return { kind, points, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0, ...(width !== undefined ? { width } : {}) };
  }
  if (kind === "stamp") {
    allowKeys(value, path, ["kind", "x", "y", "tiles"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tiles = parseArray(value.tiles, `${path}.tiles`, ctx, parseMapTileRow) ?? [];
    const stampWidth = tiles[0]?.length ?? 0;
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tiles.length === 0) ctx.errors.push(`${path}.tiles must contain at least one row.`);
    if (tiles.length > MAP_SIZE) ctx.errors.push(`${path}.tiles can contain at most ${MAP_SIZE} rows.`);
    if (stampWidth === 0) ctx.errors.push(`${path}.tiles rows must contain at least one tile.`);
    if (stampWidth > MAP_SIZE) ctx.errors.push(`${path}.tiles rows can contain at most ${MAP_SIZE} tiles.`);
    for (let row = 1; row < tiles.length; row++) {
      if (tiles[row].length !== stampWidth) ctx.errors.push(`${path}.tiles[${row}] must have the same width as the first row.`);
    }
    checkMapRectBounds(x, y, stampWidth, tiles.length, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, tiles };
  }
  if (kind === "terrainGroup") {
    allowKeys(value, path, ["kind", "terrain", "geometry"], ctx);
    const terrain = requireString(value.terrain, `${path}.terrain`, ctx);
    if (terrain !== null && terrain !== "water" && terrain !== "mountains" && terrain !== "forest") {
      ctx.errors.push(`${path}.terrain must be water, mountains, or forest.`);
    }
    const geometry = parseTerrainGeometry(value.geometry, `${path}.geometry`, ctx);
    return { kind, terrain: terrain === "mountains" || terrain === "forest" ? terrain : "water", geometry: geometry ?? { kind: "rect", x: 0, y: 0, width: 1, height: 1 } };
  }
  if (kind === "landSecret") {
    allowKeys(value, path, ["kind", "x", "y", "state"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const state = requireString(value.state, `${path}.state`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (state !== null && state !== "normal" && state !== "hidden" && state !== "revealed") {
      ctx.errors.push(`${path}.state must be normal, hidden, or revealed.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, state: state === "hidden" || state === "revealed" ? state : "normal" };
  }
  if (kind === "hiddenWalkable") {
    allowKeys(value, path, ["kind", "x", "y", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tile !== undefined && !isHiddenWalkableTile(tile)) {
      ctx.errors.push(`${path}.tile must be one of the known stock hidden-walkable tiles: Castle 96 or Plains 169.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, ...(tile !== undefined && isHiddenWalkableTile(tile) ? { tile } : {}) };
  }
  if (kind === "combatClearing") {
    allowKeys(value, path, ["kind", "x", "y", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tile !== undefined && !isCombatClearingTile(tile)) {
      ctx.errors.push(`${path}.tile must be one of the known stock combat-clearing tiles: Castle 59-65 or Plains 180-185.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, ...(tile !== undefined && isCombatClearingTile(tile) ? { tile } : {}) };
  }
  if (kind === "dungeonPassage") {
    allowKeys(value, path, ["kind", "x", "y", "directions"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const directions = parseArray(value.directions, `${path}.directions`, ctx, parseDungeonDirection) ?? [];
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (directions.length === 0) ctx.errors.push(`${path}.directions must contain at least one direction.`);
    if (new Set(directions).size !== directions.length) ctx.errors.push(`${path}.directions cannot contain duplicates.`);
    return { kind, x: x ?? 0, y: y ?? 0, directions };
  }
  ctx.errors.push(`${path}.kind must be one of fill, rect, line, path, border, room, road, river, stamp, terrainGroup, landSecret, hiddenWalkable, combatClearing, dungeonPassage.`);
  return null;
}

function validateMapOperationLevelTypes(operations: ScenarioSeedMapOperation[], levelType: LevelType, path: string, ctx: ParseContext) {
  for (let index = 0; index < operations.length; index++) {
    const kind = operations[index].kind;
    if ((kind === "landSecret" || kind === "hiddenWalkable" || kind === "combatClearing" || kind === "terrainGroup") && levelType !== "land") {
      ctx.errors.push(`${path}.operations[${index}].kind ${kind} is only valid on land maps.`);
    }
    if (kind === "dungeonPassage" && levelType !== "dungeon") {
      ctx.errors.push(`${path}.operations[${index}].kind dungeonPassage is only valid on dungeon maps.`);
    }
  }
}

function parseTerrainGeometry(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTerrainGeometry | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "rect") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1 };
  }
  if (kind === "path") {
    allowKeys(value, path, ["kind", "points", "width"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    const width = optionalInteger(value.width, `${path}.width`, ctx);
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    checkIntegerRange(width, `${path}.width`, 1, 15, ctx);
    const routeWidth = width ?? 1;
    const before = Math.floor((routeWidth - 1) / 2);
    const after = routeWidth - before - 1;
    points.forEach((point, pointIndex) => {
      if (point.x - before < 0 || point.x + after >= MAP_SIZE || point.y - before < 0 || point.y + after >= MAP_SIZE) {
        ctx.errors.push(`${path}.points[${pointIndex}] does not leave enough map space for width ${routeWidth}.`);
      }
    });
    return { kind, points, ...(width !== undefined ? { width } : {}) };
  }
  ctx.errors.push(`${path}.kind must be rect or path.`);
  return null;
}

function parseDungeonDirection(input: unknown, path: string, ctx: ParseContext): ScenarioSeedDungeonDirection | null {
  const value = requireString(input, path, ctx);
  if (value === "north" || value === "east" || value === "south" || value === "west") return value;
  if (value !== null) ctx.errors.push(`${path} must be north, east, south, or west.`);
  return null;
}

function isHiddenWalkableTile(value: number): value is ScenarioSeedHiddenWalkableTile {
  return value === 96 || value === 169;
}

function isCombatClearingTile(value: number): value is ScenarioSeedCombatClearingTile {
  return (value >= 59 && value <= 65) || (value >= 180 && value <= 185);
}

function parseRoomDoor(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRoomDoor | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["side", "offset", "tile"], ctx);
  const side = requireString(value.side, `${path}.side`, ctx);
  const offset = requireInteger(value.offset, `${path}.offset`, ctx);
  if (side !== null && side !== "north" && side !== "south" && side !== "west" && side !== "east") {
    ctx.errors.push(`${path}.side must be one of north, south, west, east.`);
  }
  checkIntegerRange(offset, `${path}.offset`, 0, 89, ctx);
  return { side: side === "south" || side === "west" || side === "east" ? side : "north", offset: offset ?? 0, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
}

function parseMapTileRow(input: unknown, path: string, ctx: ParseContext): number[] | null {
  const row = parseIntegerArray(input, path, ctx);
  row?.forEach((tile, tileIndex) => checkIntegerRange(tile, `${path}[${tileIndex}]`, MAP_TILE_MIN, MAP_TILE_MAX, ctx));
  return row ?? null;
}

function checkMapRectBounds(x: number | null, y: number | null, width: number | null, height: number | null, path: string, ctx: ParseContext) {
  if (x !== null && width !== null && x + width > MAP_SIZE) ctx.errors.push(`${path} extends past map column ${MAP_SIZE - 1}.`);
  if (y !== null && height !== null && y + height > MAP_SIZE) ctx.errors.push(`${path} extends past map row ${MAP_SIZE - 1}.`);
}

function parsePoint(input: unknown, path: string, ctx: ParseContext): { x: number; y: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["x", "y"], ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  return { x: x ?? 0, y: y ?? 0 };
}

function parseActionPoint(input: unknown, path: string, ctx: ParseContext): ScenarioSeedActionPoint | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "recordIndex", "levelType", "levelIndex", "map", "at", "x", "y", "percent", "steps"], ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 Realmz action slots.`);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const recordIndex = optionalInteger(value.recordIndex, `${path}.recordIndex`, ctx);
  const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
  const levelIndex = optionalInteger(value.levelIndex, `${path}.levelIndex`, ctx);
  const map = optionalRef(value.map, `${path}.map`, ctx);
  const at = optionalRef(value.at, `${path}.at`, ctx);
  const x = optionalInteger(value.x, `${path}.x`, ctx);
  const y = optionalInteger(value.y, `${path}.y`, ctx);
  const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
  checkIntegerRange(recordIndex, `${path}.recordIndex`, 0, null, ctx);
  checkIntegerRange(levelIndex, `${path}.levelIndex`, 0, null, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
  if (at === undefined && (x === undefined || y === undefined)) ctx.errors.push(`${path} must provide x/y or at.`);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(optionalString(value.id, `${path}.id`, ctx) !== undefined ? { id: optionalString(value.id, `${path}.id`, ctx) } : {}),
    ...(recordIndex !== undefined ? { recordIndex } : {}),
    ...(levelType !== undefined ? { levelType } : {}),
    ...(levelIndex !== undefined ? { levelIndex } : {}),
    ...(map !== undefined ? { map } : {}),
    ...(at !== undefined ? { at } : {}),
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(percent !== undefined ? { percent } : {}),
    steps
  };
}

function parseExtraActionPoint(input: unknown, path: string, ctx: ParseContext): ScenarioSeedExtraActionPoint | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "steps"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 Realmz action slots.`);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), steps };
}

function parseStep(input: unknown, path: string, ctx: ParseContext): ScenarioSeedStep | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "message") {
    allowKeys(value, path, ["kind", "message", "messageId"], ctx);
    return { kind, message: requireRef(value.message ?? value.messageId, `${path}.message`, ctx) };
  }
  if (kind === "battle") {
    allowKeys(value, path, ["kind", "battle", "battleId", "battleHigh", "sound", "message", "reviveParty"], ctx);
    return {
      kind,
      battle: requireRef(value.battle ?? value.battleId, `${path}.battle`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...(optionalBoolean(value.reviveParty, `${path}.reviveParty`, ctx) !== undefined ? { reviveParty: optionalBoolean(value.reviveParty, `${path}.reviveParty`, ctx) } : {})
    };
  }
  if (kind === "simpleEncounter") {
    allowKeys(value, path, ["kind", "encounter"], ctx);
    return { kind, encounter: requireRef(value.encounter, `${path}.encounter`, ctx) };
  }
  if (kind === "complexEncounter") {
    allowKeys(value, path, ["kind", "encounter"], ctx);
    return { kind, encounter: requireRef(value.encounter, `${path}.encounter`, ctx) };
  }
  if (kind === "shop") {
    allowKeys(value, path, ["kind", "shop", "shopId"], ctx);
    return { kind, shop: requireRef(value.shop ?? value.shopId, `${path}.shop`, ctx) };
  }
  if (kind === "treasure") {
    allowKeys(value, path, ["kind", "treasure", "treasureId"], ctx);
    return { kind, treasure: requireRef(value.treasure ?? value.treasureId, `${path}.treasure`, ctx) };
  }
  if (kind === "sound") {
    allowKeys(value, path, ["kind", "sound"], ctx);
    return { kind, sound: requireRef(value.sound, `${path}.sound`, ctx) };
  }
  if (kind === "picture") {
    allowKeys(value, path, ["kind", "picture"], ctx);
    return { kind, picture: requireRef(value.picture, `${path}.picture`, ctx) };
  }
  if (kind === "scrollingText") {
    allowKeys(value, path, ["kind", "text"], ctx);
    return { kind, text: requireRef(value.text, `${path}.text`, ctx) };
  }
  if (kind === "victoryPoints") {
    allowKeys(value, path, ["kind", "amount"], ctx);
    return { kind, amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0 };
  }
  if (kind === "temple") {
    allowKeys(value, path, ["kind", "inflation"], ctx);
    return { kind, inflation: requireInteger(value.inflation, `${path}.inflation`, ctx) ?? 100 };
  }
  if (kind === "banking") {
    allowKeys(value, path, ["kind", "shop"], ctx);
    return { kind, ...optionalRefField(value, "shop", path, ctx) };
  }
  if (kind === "displayMap") {
    allowKeys(value, path, ["kind", "map"], ctx);
    return { kind, map: requireInteger(value.map, `${path}.map`, ctx) ?? 0 };
  }
  if (kind === "pickCharacters") {
    allowKeys(value, path, ["kind", "count", "inverse"], ctx);
    return { kind, count: requireInteger(value.count, `${path}.count`, ctx) ?? 1, ...(optionalBoolean(value.inverse, `${path}.inverse`, ctx) !== undefined ? { inverse: optionalBoolean(value.inverse, `${path}.inverse`, ctx) } : {}) };
  }
  if (kind === "returnGosub") {
    allowKeys(value, path, ["kind"], ctx);
    return { kind };
  }
  if (kind === "popStack") {
    allowKeys(value, path, ["kind"], ctx);
    return { kind };
  }
  if (kind === "addSpecialCharacter") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "dropSpecialCharacter") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "teleport") {
    allowKeys(value, path, ["kind", "landLevel", "x", "y", "sound", "message", "teleportOnly"], ctx);
    const landLevel = optionalInteger(value.landLevel, `${path}.landLevel`, ctx);
    const x = optionalInteger(value.x, `${path}.x`, ctx);
    const y = optionalInteger(value.y, `${path}.y`, ctx);
    const sound = optionalRef(value.sound, `${path}.sound`, ctx);
    const message = optionalRef(value.message, `${path}.message`, ctx);
    checkIntegerRange(landLevel, `${path}.landLevel`, -1, null, ctx);
    checkIntegerRange(x, `${path}.x`, -1, 89, ctx);
    checkIntegerRange(y, `${path}.y`, -1, 89, ctx);
    return {
      kind,
      ...(landLevel !== undefined ? { landLevel } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      ...(sound !== undefined ? { sound } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(optionalBoolean(value.teleportOnly, `${path}.teleportOnly`, ctx) !== undefined ? { teleportOnly: optionalBoolean(value.teleportOnly, `${path}.teleportOnly`, ctx) } : {})
    };
  }
  if (kind === "randomMessage") {
    allowKeys(value, path, ["kind", "low", "high"], ctx);
    return { kind, low: requireRef(value.low, `${path}.low`, ctx), high: requireRef(value.high, `${path}.high`, ctx) };
  }
  if (kind === "selectiveBattle") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "sound", "message", "treasure", "improved", "cowardMacro"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...optionalRefField(value, "treasure", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx),
      ...(optionalBoolean(value.improved, `${path}.improved`, ctx) !== undefined ? { improved: optionalBoolean(value.improved, `${path}.improved`, ctx) } : {})
    };
  }
  if (kind === "battleOutcome") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "cowardMacro", "sound", "message"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx)
    };
  }
  if (kind === "improvedBattleOutcome") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "sound", "message", "cowardMacro"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx)
    };
  }
  if (kind === "causeRout") {
    allowKeys(value, path, ["kind", "monsters"], ctx);
    const monsters = parseRefArray(value.monsters, `${path}.monsters`, ctx) ?? [];
    if (monsters.length < 1) ctx.errors.push(`${path}.monsters must contain at least one monster reference.`);
    if (monsters.length > 5) ctx.errors.push(`${path}.monsters can contain at most five monster references.`);
    return { kind, monsters };
  }
  if (kind === "battleMacroCriteria") {
    allowKeys(value, path, ["kind", "mode", "roundOrPercent", "repeatMode", "macroLow", "macroHigh"], ctx);
    const mode = requireInteger(value.mode, `${path}.mode`, ctx);
    const roundOrPercent = requireInteger(value.roundOrPercent, `${path}.roundOrPercent`, ctx);
    const repeatMode = requireInteger(value.repeatMode, `${path}.repeatMode`, ctx);
    const macroHigh = optionalRef(value.macroHigh, `${path}.macroHigh`, ctx);
    checkIntegerRange(mode, `${path}.mode`, 0, 2, ctx);
    checkIntegerRange(roundOrPercent, `${path}.roundOrPercent`, 0, 32767, ctx);
    checkIntegerRange(repeatMode, `${path}.repeatMode`, 0, 2, ctx);
    if (repeatMode === 2 && macroHigh === undefined) ctx.errors.push(`${path}.macroHigh is required when repeatMode is 2 (random macro).`);
    return { kind, mode: (mode === 1 ? 1 : mode === 2 ? 2 : 0), roundOrPercent: roundOrPercent ?? 0, repeatMode: (repeatMode === 1 ? 1 : repeatMode === 2 ? 2 : 0), macroLow: requireRef(value.macroLow, `${path}.macroLow`, ctx), ...(macroHigh !== undefined ? { macroHigh } : {}) };
  }
  if (kind === "spawnMonsters") {
    allowKeys(value, path, ["kind", "monster", "countOrRandomLimit", "sound", "traitorOverride"], ctx);
    const countOrRandomLimit = requireInteger(value.countOrRandomLimit, `${path}.countOrRandomLimit`, ctx);
    const traitorOverride = optionalInteger(value.traitorOverride, `${path}.traitorOverride`, ctx);
    checkIntegerRange(countOrRandomLimit, `${path}.countOrRandomLimit`, -32768, 32767, ctx);
    checkIntegerRange(traitorOverride, `${path}.traitorOverride`, 0, 127, ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx), countOrRandomLimit: countOrRandomLimit ?? 0, ...optionalRefField(value, "sound", path, ctx), ...(traitorOverride !== undefined ? { traitorOverride } : {}) };
  }
  if (kind === "destroyRelatedMonsters") {
    allowKeys(value, path, ["kind", "monster", "maxCount", "includeTraitorSide"], ctx);
    const maxCount = optionalInteger(value.maxCount, `${path}.maxCount`, ctx);
    const includeTraitorSide = optionalBoolean(value.includeTraitorSide, `${path}.includeTraitorSide`, ctx);
    checkIntegerRange(maxCount, `${path}.maxCount`, 0, 32767, ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx), ...(maxCount !== undefined ? { maxCount } : {}), ...(includeTraitorSide !== undefined ? { includeTraitorSide } : {}) };
  }
  if (kind === "continueIfMonsterPresent") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "alterTimedEncounter") {
    allowKeys(value, path, ["kind", "timedEncounter", "percent", "increment", "resetFromCurrentDay", "daysUntilNext"], ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    const increment = optionalInteger(value.increment, `${path}.increment`, ctx);
    const resetFromCurrentDay = optionalBoolean(value.resetFromCurrentDay, `${path}.resetFromCurrentDay`, ctx);
    const daysUntilNext = optionalInteger(value.daysUntilNext, `${path}.daysUntilNext`, ctx);
    checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
    checkIntegerRange(increment, `${path}.increment`, 0, 32767, ctx);
    checkIntegerRange(daysUntilNext, `${path}.daysUntilNext`, 0, 32767, ctx);
    if (resetFromCurrentDay && daysUntilNext === undefined) ctx.errors.push(`${path}.daysUntilNext is required when resetFromCurrentDay is true.`);
    if (!resetFromCurrentDay && daysUntilNext !== undefined) ctx.errors.push(`${path}.daysUntilNext is only valid when resetFromCurrentDay is true.`);
    return { kind, timedEncounter: requireRef(value.timedEncounter, `${path}.timedEncounter`, ctx), ...(percent !== undefined ? { percent } : {}), ...(increment !== undefined ? { increment } : {}), ...(resetFromCurrentDay !== undefined ? { resetFromCurrentDay } : {}), ...(daysUntilNext !== undefined ? { daysUntilNext } : {}) };
  }
  if (kind === "branchOnQuest") {
    allowKeys(value, path, ["kind", "quest", "test", "branchMode", "target", "code"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), ...optionalNumberField(value, "test", path, ctx), ...optionalNumberField(value, "branchMode", path, ctx), ...optionalRefField(value, "target", path, ctx), ...optionalNumberField(value, "code", path, ctx) };
  }
  if (kind === "setQuestFlag") {
    allowKeys(value, path, ["kind", "quest", "questId"], ctx);
    return { kind, quest: requireRef(value.quest ?? value.questId, `${path}.quest`, ctx) };
  }
  if (kind === "questValue") {
    allowKeys(value, path, ["kind", "quest", "amount", "branchType", "threshold", "target"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0, ...optionalNumberField(value, "branchType", path, ctx), ...optionalNumberField(value, "threshold", path, ctx), ...optionalRefField(value, "target", path, ctx) };
  }
  if (kind === "branchOnQuestValue") {
    allowKeys(value, path, ["kind", "quest", "testValue", "branchType", "lessThanTarget", "equalOrGreaterTarget"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), ...optionalNumberField(value, "testValue", path, ctx), ...optionalNumberField(value, "branchType", path, ctx), ...optionalRefField(value, "lessThanTarget", path, ctx), ...optionalRefField(value, "equalOrGreaterTarget", path, ctx) };
  }
  if (kind === "branchOnRandom") {
    allowKeys(value, path, ["kind", "mode", "low", "high", "sound", "message"], ctx);
    return { kind, ...optionalNumberField(value, "mode", path, ctx), low: requireInteger(value.low, `${path}.low`, ctx) ?? 0, high: requireInteger(value.high, `${path}.high`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx) };
  }
  if (kind === "branchOnPercent") {
    allowKeys(value, path, ["kind", "percent", "successBehavior", "branchMode", "target", "code"], ctx);
    return { kind, percent: requireInteger(value.percent, `${path}.percent`, ctx) ?? 0, ...optionalNumberField(value, "successBehavior", path, ctx), ...optionalNumberField(value, "branchMode", path, ctx), ...optionalRefField(value, "target", path, ctx), ...optionalNumberField(value, "code", path, ctx) };
  }
  if (kind === "changeTile") {
    allowKeys(value, path, ["kind", "level", "x", "y", "tile", "dungeon"], ctx);
    return { kind, ...optionalNumberField(value, "level", path, ctx), x: requireInteger(value.x, `${path}.x`, ctx) ?? 0, y: requireInteger(value.y, `${path}.y`, ctx) ?? 0, tile: requireInteger(value.tile, `${path}.tile`, ctx) ?? 0, ...(optionalBoolean(value.dungeon, `${path}.dungeon`, ctx) !== undefined ? { dungeon: optionalBoolean(value.dungeon, `${path}.dungeon`, ctx) } : {}) };
  }
  if (kind === "healHurtParty") {
    allowKeys(value, path, ["kind", "multiplier", "low", "high", "sound", "message", "picked"], ctx);
    return { kind, multiplier: requireInteger(value.multiplier, `${path}.multiplier`, ctx) ?? 0, low: requireInteger(value.low, `${path}.low`, ctx) ?? 0, high: requireInteger(value.high, `${path}.high`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx), ...(optionalBoolean(value.picked, `${path}.picked`, ctx) !== undefined ? { picked: optionalBoolean(value.picked, `${path}.picked`, ctx) } : {}) };
  }
  if (kind === "takeGold") {
    allowKeys(value, path, ["kind", "amount", "failureMarker"], ctx);
    return { kind, amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0, ...optionalNumberField(value, "failureMarker", path, ctx) };
  }
  if (kind === "giveCondition") {
    allowKeys(value, path, ["kind", "who", "condition", "duration", "sound"], ctx);
    return { kind, ...optionalNumberField(value, "who", path, ctx), condition: requireInteger(value.condition, `${path}.condition`, ctx) ?? 0, duration: requireInteger(value.duration, `${path}.duration`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx) };
  }
  if (kind === "awardRandomItems") {
    allowKeys(value, path, ["kind", "count", "lowItem", "highItem"], ctx);
    return { kind, count: requireInteger(value.count, `${path}.count`, ctx) ?? 0, lowItem: requireRef(value.lowItem, `${path}.lowItem`, ctx), highItem: requireRef(value.highItem, `${path}.highItem`, ctx) };
  }
  if (kind === "branchOnItem") {
    allowKeys(value, path, ["kind", "item", "targetKind", "possessedTarget", "missingBehavior", "missingTarget"], ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const missingBehavior = optionalItemMissingBehavior(value.missingBehavior, `${path}.missingBehavior`, ctx);
    const missingTarget = optionalRef(value.missingTarget, `${path}.missingTarget`, ctx);
    if ((missingBehavior === "branch" || missingBehavior === "message") && missingTarget === undefined) {
      ctx.errors.push(`${path}.missingTarget is required when missingBehavior is ${missingBehavior}.`);
    }
    if ((missingBehavior === undefined || missingBehavior === "continue") && missingTarget !== undefined) {
      ctx.errors.push(`${path}.missingTarget is only valid when missingBehavior is branch or message.`);
    }
    return {
      kind,
      item: requireRef(value.item, `${path}.item`, ctx),
      ...(targetKind !== undefined ? { targetKind } : {}),
      possessedTarget: requireRef(value.possessedTarget, `${path}.possessedTarget`, ctx),
      ...(missingBehavior !== undefined ? { missingBehavior } : {}),
      ...(missingTarget !== undefined ? { missingTarget } : {})
    };
  }
  if (kind === "branchOnItemCharges") {
    allowKeys(value, path, ["kind", "item", "minimumCharges", "targetKind", "enoughTarget", "insufficientTarget"], ctx);
    const minimumCharges = requireInteger(value.minimumCharges, `${path}.minimumCharges`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const enoughTarget = optionalRef(value.enoughTarget, `${path}.enoughTarget`, ctx);
    const insufficientTarget = optionalRef(value.insufficientTarget, `${path}.insufficientTarget`, ctx);
    checkIntegerRange(minimumCharges, `${path}.minimumCharges`, 0, 32767, ctx);
    if (enoughTarget === undefined && insufficientTarget === undefined) ctx.errors.push(`${path} must provide enoughTarget, insufficientTarget, or both.`);
    return {
      kind,
      item: requireRef(value.item, `${path}.item`, ctx),
      minimumCharges: minimumCharges ?? 0,
      ...(targetKind !== undefined ? { targetKind } : {}),
      ...(enoughTarget !== undefined ? { enoughTarget } : {}),
      ...(insufficientTarget !== undefined ? { insufficientTarget } : {})
    };
  }
  if (kind === "dropItems") {
    allowKeys(value, path, ["kind", "item", "count"], ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "changeItemCharges") {
    allowKeys(value, path, ["kind", "item", "amount", "count"], ctx);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(amount, `${path}.amount`, -32768, 32767, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), amount: amount ?? 0, ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "replaceItems") {
    allowKeys(value, path, ["kind", "item", "replacementItem", "count"], ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), replacementItem: requireRef(value.replacementItem, `${path}.replacementItem`, ctx), ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "branchOnPartyCondition") {
    allowKeys(value, path, ["kind", "condition", "when", "targetKind", "target"], ctx);
    const condition = requirePartyCondition(value.condition, `${path}.condition`, ctx);
    const when = optionalPresenceTest(value.when, `${path}.when`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    return { kind, condition, ...(when !== undefined ? { when } : {}), ...(targetKind !== undefined ? { targetKind } : {}), target: requireRef(value.target, `${path}.target`, ctx) };
  }
  if (kind === "branchOnCharacterCondition") {
    allowKeys(value, path, ["kind", "condition", "selector", "successTarget", "failureTarget"], ctx);
    const condition = requireInteger(value.condition, `${path}.condition`, ctx);
    const selector = optionalCharacterSelector(value.selector, `${path}.selector`, ctx);
    checkIntegerRange(condition, `${path}.condition`, 0, 39, ctx);
    return {
      kind,
      condition: condition ?? 0,
      ...(selector !== undefined ? { selector } : {}),
      successTarget: requireRef(value.successTarget, `${path}.successTarget`, ctx),
      failureTarget: requireRef(value.failureTarget, `${path}.failureTarget`, ctx)
    };
  }
  if (kind === "branchOnTileParameter") {
    allowKeys(value, path, ["kind", "test", "tile", "targetKind", "falseTarget", "trueTarget"], ctx);
    const test = requireTileParameter(value.test, `${path}.test`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const falseTarget = optionalRef(value.falseTarget, `${path}.falseTarget`, ctx);
    const trueTarget = optionalRef(value.trueTarget, `${path}.trueTarget`, ctx);
    checkIntegerRange(tile, `${path}.tile`, 0, 200, ctx);
    if (test === "tileId" && tile === undefined) ctx.errors.push(`${path}.tile is required when test is tileId.`);
    if (test !== "tileId" && tile !== undefined) ctx.errors.push(`${path}.tile is only valid when test is tileId.`);
    if (falseTarget === undefined && trueTarget === undefined) ctx.errors.push(`${path} must provide falseTarget, trueTarget, or both.`);
    if (falseTarget === 0) ctx.errors.push(`${path}.falseTarget cannot be 0 because Realmz uses zero as the no-branch sentinel.`);
    if (trueTarget === 0) ctx.errors.push(`${path}.trueTarget cannot be 0 because Realmz uses zero as the no-branch sentinel.`);
    return {
      kind,
      test,
      ...(tile !== undefined ? { tile } : {}),
      ...(targetKind !== undefined ? { targetKind } : {}),
      ...(falseTarget !== undefined ? { falseTarget } : {}),
      ...(trueTarget !== undefined ? { trueTarget } : {})
    };
  }
  if (kind === "copyActionPointSteps") {
    allowKeys(value, path, ["kind", "source"], ctx);
    const source = requireRef(value.source, `${path}.source`, ctx);
    if (typeof source === "number") checkIntegerRange(source, `${path}.source`, 0, 99, ctx);
    return { kind, source };
  }
  if (kind === "enableActionPoint") {
    allowKeys(value, path, ["kind", "target", "level", "percent"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    checkIntegerRange(percent, `${path}.percent`, 1, 100, ctx);
    validateActionPointTargetFields(target, level, undefined, path, ctx);
    if (target === 0) ctx.errors.push(`${path}.target cannot be Action Point 0 because opcode 13 treats zero as no single target.`);
    return { kind, target, ...(level !== undefined ? { level } : {}), ...(percent !== undefined ? { percent } : {}) };
  }
  if (kind === "disableActionPoint") {
    allowKeys(value, path, ["kind", "target", "level"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    validateActionPointTargetFields(target, level, undefined, path, ctx);
    if (target === 0) ctx.errors.push(`${path}.target cannot be Action Point 0 because opcode 13 treats zero as no single target.`);
    return { kind, target, ...(level !== undefined ? { level } : {}) };
  }
  if (kind === "patchActionPoint") {
    allowKeys(value, path, ["kind", "target", "source", "level", "levelType"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const source = requireRef(value.source, `${path}.source`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    validateActionPointTargetFields(target, level, levelType, path, ctx, true);
    return { kind, target, source, ...(level !== undefined ? { level } : {}), ...(levelType !== undefined ? { levelType } : {}) };
  }
  if (kind === "setDarkLevel") {
    allowKeys(value, path, ["kind", "dark", "stopIfUnchanged"], ctx);
    return { kind, dark: requireBoolean(value.dark, `${path}.dark`, ctx), ...(optionalBoolean(value.stopIfUnchanged, `${path}.stopIfUnchanged`, ctx) !== undefined ? { stopIfUnchanged: optionalBoolean(value.stopIfUnchanged, `${path}.stopIfUnchanged`, ctx) } : {}) };
  }
  if (kind === "alterGameTime") {
    allowKeys(value, path, ["kind", "mode", "days", "hours", "minutes"], ctx);
    const mode = requireTimeMode(value.mode, `${path}.mode`, ctx);
    const days = optionalInteger(value.days, `${path}.days`, ctx);
    const hours = optionalInteger(value.hours, `${path}.hours`, ctx);
    const minutes = optionalInteger(value.minutes, `${path}.minutes`, ctx);
    if (mode === "set") {
      checkIntegerRange(days, `${path}.days`, -1, 32767, ctx);
      checkIntegerRange(hours, `${path}.hours`, -1, 23, ctx);
      checkIntegerRange(minutes, `${path}.minutes`, -1, 59, ctx);
    } else {
      checkIntegerRange(days, `${path}.days`, -32768, 32767, ctx);
      checkIntegerRange(hours, `${path}.hours`, -32768, 32767, ctx);
      checkIntegerRange(minutes, `${path}.minutes`, -32768, 32767, ctx);
    }
    return { kind, mode, ...(days !== undefined ? { days } : {}), ...(hours !== undefined ? { hours } : {}), ...(minutes !== undefined ? { minutes } : {}) };
  }
  if (kind === "branchOnGameTime") {
    allowKeys(value, path, ["kind", "dayAtMost", "hourAtMost", "successMacro", "failureMacro"], ctx);
    const dayAtMost = optionalInteger(value.dayAtMost, `${path}.dayAtMost`, ctx);
    const hourAtMost = optionalInteger(value.hourAtMost, `${path}.hourAtMost`, ctx);
    checkIntegerRange(dayAtMost, `${path}.dayAtMost`, -1, 32767, ctx);
    checkIntegerRange(hourAtMost, `${path}.hourAtMost`, -1, 23, ctx);
    return { kind, ...(dayAtMost !== undefined ? { dayAtMost } : {}), ...(hourAtMost !== undefined ? { hourAtMost } : {}), successMacro: requireRef(value.successMacro, `${path}.successMacro`, ctx), failureMacro: requireRef(value.failureMacro, `${path}.failureMacro`, ctx) };
  }
  if (kind === "boatCampStatus") {
    allowKeys(value, path, ["kind", "continueBoat", "continueCamping", "setBoat"], ctx);
    const continueBoat = optionalBoatStatus(value.continueBoat, `${path}.continueBoat`, ctx);
    const continueCamping = optionalCampingStatus(value.continueCamping, `${path}.continueCamping`, ctx);
    const setBoat = optionalBoatStatus(value.setBoat, `${path}.setBoat`, ctx);
    if (continueBoat === undefined && continueCamping === undefined && setBoat === undefined) ctx.errors.push(`${path} must provide a boat/camping check or setBoat.`);
    return { kind, ...(continueBoat !== undefined ? { continueBoat } : {}), ...(continueCamping !== undefined ? { continueCamping } : {}), ...(setBoat !== undefined ? { setBoat } : {}) };
  }
  if (kind === "alterFatigue") {
    allowKeys(value, path, ["kind", "mode", "percent"], ctx);
    const mode = requireFatigueMode(value.mode, `${path}.mode`, ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
    if (mode === "percent" && percent === undefined) ctx.errors.push(`${path}.percent is required when mode is percent.`);
    if (mode !== "percent" && percent !== undefined) ctx.errors.push(`${path}.percent is only valid when mode is percent.`);
    return { kind, mode, ...(percent !== undefined ? { percent } : {}) };
  }
  if (kind === "changeSpellPoints") {
    allowKeys(value, path, ["kind", "rolls", "low", "high", "take", "sound", "message"], ctx);
    const rolls = requireInteger(value.rolls, `${path}.rolls`, ctx);
    const low = requireInteger(value.low, `${path}.low`, ctx);
    const high = requireInteger(value.high, `${path}.high`, ctx);
    checkIntegerRange(rolls, `${path}.rolls`, 1, 32767, ctx);
    checkIntegerRange(low, `${path}.low`, 0, 32767, ctx);
    checkIntegerRange(high, `${path}.high`, 0, 32767, ctx);
    if (low !== null && high !== null && low > high) ctx.errors.push(`${path}.low must not exceed ${path}.high.`);
    return { kind, rolls: rolls ?? 1, low: low ?? 0, high: high ?? 0, ...(optionalBoolean(value.take, `${path}.take`, ctx) !== undefined ? { take: optionalBoolean(value.take, `${path}.take`, ctx) } : {}), ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx) };
  }
  if (kind === "branchOnSpellPoints") {
    allowKeys(value, path, ["kind", "scope", "minimum", "onFailure", "successMacro"], ctx);
    const scope = requireSpellPointScope(value.scope, `${path}.scope`, ctx);
    const minimum = requireInteger(value.minimum, `${path}.minimum`, ctx);
    const onFailure = optionalSpellFailure(value.onFailure, `${path}.onFailure`, ctx);
    checkIntegerRange(minimum, `${path}.minimum`, 0, 32767, ctx);
    return { kind, scope, minimum: minimum ?? 0, ...(onFailure !== undefined ? { onFailure } : {}), successMacro: requireRef(value.successMacro, `${path}.successMacro`, ctx) };
  }
  if (kind === "castSpell") {
    allowKeys(value, path, ["kind", "scope", "spell", "power", "saveModifier", "noSave"], ctx);
    const scope = value.scope === "party" ? "party" : value.scope === "picked" ? "picked" : null;
    if (scope === null) ctx.errors.push(`${path}.scope must be picked or party.`);
    const spell = requireInteger(value.spell, `${path}.spell`, ctx);
    const power = requireInteger(value.power, `${path}.power`, ctx);
    const saveModifier = optionalInteger(value.saveModifier, `${path}.saveModifier`, ctx);
    checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
    checkIntegerRange(power, `${path}.power`, 0, 32767, ctx);
    checkIntegerRange(saveModifier, `${path}.saveModifier`, -32768, 32767, ctx);
    return { kind, scope: scope ?? "party", spell: spell ?? 0, power: power ?? 0, ...(saveModifier !== undefined ? { saveModifier } : {}), ...(optionalBoolean(value.noSave, `${path}.noSave`, ctx) !== undefined ? { noSave: optionalBoolean(value.noSave, `${path}.noSave`, ctx) } : {}) };
  }
  if (kind === "takeVictoryPoints") {
    allowKeys(value, path, ["kind", "amount", "scope"], ctx);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    const scope = value.scope === undefined || value.scope === "each" || value.scope === "picked" || value.scope === "spread" ? value.scope : null;
    if (scope === null) ctx.errors.push(`${path}.scope must be each, picked, or spread.`);
    checkIntegerRange(amount, `${path}.amount`, 0, 32767, ctx);
    return { kind, amount: amount ?? 0, ...(scope !== undefined && scope !== null ? { scope } : {}) };
  }
  if (kind === "alterPicked") {
    allowKeys(value, path, ["kind", "attribute", "amount"], ctx);
    const attribute = requireString(value.attribute, `${path}.attribute`, ctx);
    if (attribute !== null && !Object.prototype.hasOwnProperty.call(ALTER_PICKED_ATTRIBUTE_CODES, attribute)) ctx.errors.push(`${path}.attribute is not a supported picked-character attribute.`);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    checkIntegerRange(amount, `${path}.amount`, -32768, 32767, ctx);
    return { kind, attribute: (attribute && Object.prototype.hasOwnProperty.call(ALTER_PICKED_ATTRIBUTE_CODES, attribute) ? attribute : "stamina") as keyof typeof ALTER_PICKED_ATTRIBUTE_CODES, amount: amount ?? 0 };
  }
  if (["clericTurning", "compass", "randomBattles", "allies"].includes(kind ?? "")) {
    allowKeys(value, path, ["kind", "enabled"], ctx);
    return { kind, enabled: requireBoolean(value.enabled, `${path}.enabled`, ctx) } as ScenarioSeedStep;
  }
  if (["dropAllEquipment", "endBattle", "backUpParty", "levelUpPicked"].includes(kind ?? "")) {
    allowKeys(value, path, ["kind"], ctx);
    return { kind } as ScenarioSeedStep;
  }
  if (kind === "faceDirection") {
    allowKeys(value, path, ["kind", "direction"], ctx);
    const direction = requireString(value.direction, `${path}.direction`, ctx);
    if (direction !== null && !Object.prototype.hasOwnProperty.call(DIRECTION_CODES, direction)) ctx.errors.push(`${path}.direction must be north, east, south, west, or random.`);
    return { kind, direction: (direction && Object.prototype.hasOwnProperty.call(DIRECTION_CODES, direction) ? direction : "north") as keyof typeof DIRECTION_CODES };
  }
  if (kind === "dungeonView") {
    allowKeys(value, path, ["kind", "mode"], ctx);
    const mode = value.mode === "force3d" || value.mode === "allow2d" ? value.mode : null;
    if (mode === null) ctx.errors.push(`${path}.mode must be force3d or allow2d.`);
    return { kind, mode: mode ?? "allow2d" };
  }
  if (kind === "alterRandomEncounterRectangle") {
    allowKeys(value, path, ["kind", "level", "rectangle", "encounterRate", "battleLow", "battleHigh", "dungeon"], ctx);
    const level = requireInteger(value.level, `${path}.level`, ctx);
    const rectangle = requireInteger(value.rectangle, `${path}.rectangle`, ctx);
    const encounterRate = requireInteger(value.encounterRate, `${path}.encounterRate`, ctx);
    const battleLow = optionalRef(value.battleLow, `${path}.battleLow`, ctx);
    const battleHigh = optionalRef(value.battleHigh, `${path}.battleHigh`, ctx);
    const dungeon = optionalBoolean(value.dungeon, `${path}.dungeon`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, 32767, ctx);
    checkIntegerRange(rectangle, `${path}.rectangle`, 0, 19, ctx);
    checkIntegerRange(encounterRate, `${path}.encounterRate`, -1, 10000, ctx);
    if ((battleLow === undefined) !== (battleHigh === undefined)) ctx.errors.push(`${path}.battleLow and ${path}.battleHigh must be provided together.`);
    return { kind, level: level ?? 0, rectangle: rectangle ?? 0, encounterRate: encounterRate ?? 0, ...(battleLow !== undefined ? { battleLow } : {}), ...(battleHigh !== undefined ? { battleHigh } : {}), ...(dungeon !== undefined ? { dungeon } : {}) };
  }
  if (kind === "alterRandomRectangle") {
    allowKeys(value, path, ["kind", "level", "rectangle", "encounterPercentDelta", "dungeon", "shape"], ctx);
    const level = requireInteger(value.level, `${path}.level`, ctx);
    const rectangle = requireInteger(value.rectangle, `${path}.rectangle`, ctx);
    const encounterPercentDelta = optionalInteger(value.encounterPercentDelta, `${path}.encounterPercentDelta`, ctx);
    const dungeon = optionalBoolean(value.dungeon, `${path}.dungeon`, ctx);
    const shape = parseRandomRectangleShape(value.shape, `${path}.shape`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, 32767, ctx);
    checkIntegerRange(rectangle, `${path}.rectangle`, 0, 19, ctx);
    checkIntegerRange(encounterPercentDelta, `${path}.encounterPercentDelta`, -10000, 10000, ctx);
    return { kind, level: level ?? 0, rectangle: rectangle ?? 0, ...(encounterPercentDelta !== undefined ? { encounterPercentDelta } : {}), ...(dungeon !== undefined ? { dungeon } : {}), shape };
  }
  if (kind === "enterExitDungeon") {
    allowKeys(value, path, ["kind", "mode", "level", "x", "y", "heading"], ctx);
    return { kind, mode: requireInteger(value.mode, `${path}.mode`, ctx) ?? 0, level: requireInteger(value.level, `${path}.level`, ctx) ?? 0, x: requireInteger(value.x, `${path}.x`, ctx) ?? 0, y: requireInteger(value.y, `${path}.y`, ctx) ?? 0, heading: requireInteger(value.heading, `${path}.heading`, ctx) ?? 0 };
  }
  if (kind === "edcd") {
    allowKeys(value, path, ["kind", "opcode", "values"], ctx);
    const values = parseIntegerArray(value.values, `${path}.values`, ctx) ?? [];
    if (values.length > 5) ctx.errors.push(`${path}.values can contain at most five EDCD values.`);
    return { kind, opcode: requireInteger(value.opcode, `${path}.opcode`, ctx) ?? 0, values };
  }
  if (kind === "raw") {
    allowKeys(value, path, ["kind", "rawCode", "id"], ctx);
    return { kind, rawCode: requireInteger(value.rawCode, `${path}.rawCode`, ctx) ?? 0, id: requireInteger(value.id, `${path}.id`, ctx) ?? 0 };
  }
  ctx.errors.push(`${path}.kind is not a supported scenario seed step.`);
  return null;
}

function createBuildContext(baseTemplate = "blank", libraryCatalog: LibraryCatalog | null = null): BuildContext {
  return {
    errors: [],
    warnings: [],
    diagnostics: [],
    allocations: {
      baseTemplate,
      messages: [],
      quests: [],
      battles: [],
      monsters: [],
      treasures: [],
      shops: [],
      items: [],
      assets: [],
      simpleEncounters: [],
      complexEncounters: [],
      thiefEncounters: [],
      timedEncounters: [],
      spells: [],
      races: [],
      castes: [],
      actionPoints: [],
      extraActionPoints: [],
      maps: [],
      regions: []
    },
    messages: new Map(),
    quests: new Map(),
    battles: new Map(),
    monsters: new Map(),
    treasures: new Map(),
    shops: new Map(),
    items: new Map(),
    assets: new Map(),
    simpleEncounters: new Map(),
    complexEncounters: new Map(),
    thiefEncounters: new Map(),
    timedEncounters: new Map(),
    spells: new Map(),
    races: new Map(),
    castes: new Map(),
    actionPoints: new Map(),
    actionPointTargets: new Map(),
    extraActionPoints: new Map(),
    maps: new Map(),
    regions: new Map(),
    libraryCatalog
  };
}

function allocateSeedIds(seed: ScenarioSeed, context: BuildContext) {
  allocateRecordIds(seed.messages ?? [], "message", context.messages, context.allocations.messages, context);
  allocateRecordIds(seed.quests ?? [], "quest", context.quests, context.allocations.quests, context);
  allocateRecordIds(seed.battles ?? [], "battle", context.battles, context.allocations.battles, context);
  allocateRecordIds(seed.monsters ?? [], "monster", context.monsters, context.allocations.monsters, context);
  allocateRecordIds(seed.treasures ?? [], "treasure", context.treasures, context.allocations.treasures, context);
  allocateRecordIds(seed.shops ?? [], "shop", context.shops, context.allocations.shops, context);
  allocateItemIds(seed.items ?? [], context);
  allocateRecordIds(seed.simpleEncounters ?? [], "simple encounter", context.simpleEncounters, context.allocations.simpleEncounters, context);
  allocateRecordIds(seed.complexEncounters ?? [], "complex encounter", context.complexEncounters, context.allocations.complexEncounters, context);
  allocateRecordIds(seed.thiefEncounters ?? [], "Rogue encounter", context.thiefEncounters, context.allocations.thiefEncounters, context, 1);
  allocateRecordIds(seed.timedEncounters ?? [], "timed encounter", context.timedEncounters, context.allocations.timedEncounters, context);
  allocateRecordIds(seed.spells ?? [], "spell override", context.spells, context.allocations.spells, context);
  allocateRecordIds(seed.races ?? [], "race override", context.races, context.allocations.races, context);
  allocateRecordIds(seed.castes ?? [], "caste override", context.castes, context.allocations.castes, context);
  allocateRecordIds(seed.extraActionPoints ?? [], "extra action point", context.extraActionPoints, context.allocations.extraActionPoints, context);
  for (const [index, map] of (seed.maps ?? []).entries()) {
    const levelType = map.levelType ?? "land";
    const levelIndex = map.index ?? index;
    if (map.key) {
      addKey(context.maps, map.key, { levelType, index: levelIndex }, "map", context);
      context.allocations.maps.push({ key: map.key, levelType, index: levelIndex, explicit: map.index !== undefined });
    }
    context.maps.set(`${levelType}:${levelIndex}`, { levelType, index: levelIndex });
    for (const region of map.regions ?? []) {
      addKey(context.regions, region.key, { levelType, index: levelIndex, x: region.x, y: region.y }, "region", context);
      context.allocations.regions.push({ key: region.key, ...(map.key ? { mapKey: map.key } : {}), levelType, index: levelIndex, x: region.x, y: region.y });
    }
  }
  for (const [index, actionPoint] of (seed.actionPoints ?? []).entries()) {
    const recordIndex = actionPoint.recordIndex ?? index;
    if (actionPoint.key) {
      addKey(context.actionPoints, actionPoint.key, recordIndex, "action point", context);
      addKey(context.actionPointTargets, actionPoint.key, actionPointTargetForSeed(actionPoint, recordIndex, context), "action point target", context);
      context.allocations.actionPoints.push({ key: actionPoint.key, id: recordIndex, explicit: actionPoint.recordIndex !== undefined });
    }
  }
}

function actionPointTargetForSeed(actionPoint: ScenarioSeedActionPoint, recordIndex: number, context: BuildContext): ActionPointTarget {
  const mapTarget = actionPoint.map === undefined
    ? undefined
    : typeof actionPoint.map === "number"
      ? { levelType: "land" as const, index: actionPoint.map }
      : context.maps.get(actionPoint.map);
  const regionTarget = typeof actionPoint.at === "string" ? context.regions.get(actionPoint.at) : undefined;
  return {
    levelType: actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land",
    levelIndex: actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0,
    recordIndex
  };
}

function allocateRecordIds<T extends { id?: number; key?: string }>(records: T[], label: string, keys: Map<string, number>, allocationEntries: ScenarioSeedAllocationEntry[], context: BuildContext, minimumId = 0) {
  const used = new Set(records.map((record) => record.id).filter((id): id is number => id !== undefined));
  for (const record of records) {
    const explicit = record.id !== undefined;
    if (record.id === undefined) {
      record.id = nextOpenId(used, minimumId);
      used.add(record.id);
    }
    if (record.key) {
      addKey(keys, record.key, record.id, label, context);
      allocationEntries.push({ key: record.key, id: record.id, explicit });
    }
  }
}

function allocateItemIds(records: ScenarioSeedItem[], context: BuildContext) {
  const usedRows = new Set<number>();
  const usedItemIds = new Set<number>();
  for (const item of records) {
    if (item.id !== undefined) usedRows.add(item.id);
    if (item.itemId !== undefined) usedItemIds.add(item.itemId);
  }
  for (const item of records) {
    const explicit = item.id !== undefined || item.itemId !== undefined;
    if (item.id === undefined && item.itemId !== undefined) item.id = item.itemId - SCENARIO_ITEM_ID_BASE;
    if (item.id === undefined) {
      item.id = nextOpenId(usedRows);
      usedRows.add(item.id);
    }
    if (item.itemId === undefined) item.itemId = SCENARIO_ITEM_ID_BASE + item.id;
    if (item.id < 0 || item.id >= SCENARIO_ITEM_RECORD_COUNT || item.itemId < SCENARIO_ITEM_ID_BASE || item.itemId >= SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT) {
      addDiagnostic(context, "error", "invalid-item-id", `Item "${item.key ?? item.itemId}" must use scenario item IDs ${SCENARIO_ITEM_ID_BASE}-${SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT - 1}.`, "item", item.key);
      continue;
    }
    if (item.itemId !== SCENARIO_ITEM_ID_BASE + item.id) {
      addDiagnostic(context, "error", "invalid-item-id", `Item "${item.key ?? item.itemId}" itemId must equal ${SCENARIO_ITEM_ID_BASE} + id.`, "item", item.key);
      continue;
    }
    if (usedItemIds.has(item.itemId) && !explicit) {
      addDiagnostic(context, "error", "duplicate-item-id", `Duplicate item ID ${item.itemId}.`, "item", item.key);
      continue;
    }
    usedItemIds.add(item.itemId);
    if (item.key) {
      addKey(context.items, item.key, item.itemId, "item", context);
      context.allocations.items.push({ key: item.key, id: item.itemId, explicit });
    }
  }
}

function nextOpenId(used: Set<number>, minimumId = 0) {
  let id = minimumId;
  while (used.has(id)) id++;
  return id;
}

function addKey<T>(map: Map<string, T>, key: string, value: T, label: string, context: BuildContext) {
  if (map.has(key)) {
    addDiagnostic(context, "error", "duplicate-key", `Duplicate ${label} key "${key}".`, label, key);
    return;
  }
  map.set(key, value);
}

function resolveRef(ref: ScenarioSeedRef, keys: Map<string, number>, label: string, context: BuildContext) {
  if (typeof ref === "number") return ref;
  const resolved = keys.get(ref);
  if (resolved !== undefined) return resolved;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown ${label} reference "${ref}".`, label, ref);
  return 0;
}

function resolveItemRef(ref: ScenarioSeedRef, context: BuildContext) {
  return resolveRef(ref, context.items, "item", context);
}

function resolveMonsterRef(ref: ScenarioSeedRef, context: BuildContext) {
  return resolveRef(ref, context.monsters, "monster", context);
}

function branchTargetKindCode(kind: ScenarioSeedBranchTargetKind) {
  return kind === "simpleEncounter" ? 1 : kind === "complexEncounter" ? 2 : 0;
}

function resolveBranchTarget(ref: ScenarioSeedRef, kind: ScenarioSeedBranchTargetKind, context: BuildContext) {
  if (kind === "simpleEncounter") return resolveRef(ref, context.simpleEncounters, "simple encounter", context);
  if (kind === "complexEncounter") return resolveRef(ref, context.complexEncounters, "complex encounter", context);
  return resolveRef(ref, context.actionPoints, "action point", context);
}

function resolveNonzeroBranchTarget(ref: ScenarioSeedRef, kind: ScenarioSeedBranchTargetKind, field: string, context: BuildContext) {
  const resolved = resolveBranchTarget(ref, kind, context);
  if (resolved === 0) {
    addDiagnostic(context, "error", "zero-sentinel-target", `Tile parameter ${field} resolves to ID 0, which Realmz reserves as no branch.`, "action point");
  }
  return resolved;
}

function resolveSameMapActionPoint(ref: ScenarioSeedRef, scope: ActionBuildScope, context: BuildContext) {
  if (scope.kind !== "map") {
    addDiagnostic(context, "error", "invalid-action-point-context", "copyActionPointSteps can only be authored inside a map Action Point.", "action point");
    return typeof ref === "number" ? ref : 0;
  }
  if (typeof ref === "number") return ref;
  const target = context.actionPointTargets.get(ref);
  if (!target) {
    addDiagnostic(context, "error", "unresolved-reference", `Unknown action point reference "${ref}".`, "action point", ref);
    return 0;
  }
  if (target.levelType !== scope.levelType || target.levelIndex !== scope.levelIndex) {
    addDiagnostic(context, "error", "different-map-action-point", `copyActionPointSteps source "${ref}" is not on the current ${scope.levelType} level ${scope.levelIndex}.`, "action point", ref);
  }
  return target.recordIndex;
}

function resolveActionPointStateTarget(ref: ScenarioSeedRef, level: number | undefined, scope: ActionBuildScope, context: BuildContext): ActionPointTarget {
  const fallbackType = scope.kind === "map" ? scope.levelType : "land";
  const target = typeof ref === "number"
    ? { levelType: fallbackType, levelIndex: level ?? 0, recordIndex: ref }
    : resolveKeyedActionPointTarget(ref, context);
  if (scope.kind !== "map") {
    addDiagnostic(context, "error", "invalid-action-point-context", "enableActionPoint and disableActionPoint require a map Action Point context so Realmz knows whether to load land or dungeon data.", "action point");
  } else if (target.levelType !== scope.levelType) {
    addDiagnostic(context, "error", "different-level-type", `Action Point state target uses ${target.levelType}, but opcode 13 inherits ${scope.levelType} from the executing script.`, "action point", typeof ref === "string" ? ref : undefined);
  }
  if (target.recordIndex === 0) {
    addDiagnostic(context, "error", "zero-sentinel-target", "Opcode 13 cannot mutate Action Point 0 through its single-target field because Realmz treats zero as no target.", "action point", typeof ref === "string" ? ref : undefined);
  }
  return target;
}

function resolvePatchActionPointTarget(ref: ScenarioSeedRef, level: number | undefined, levelType: LevelType | undefined, context: BuildContext): ActionPointTarget {
  if (typeof ref === "number") return { levelType: levelType ?? "land", levelIndex: level ?? 0, recordIndex: ref };
  return resolveKeyedActionPointTarget(ref, context);
}

function resolveKeyedActionPointTarget(key: string, context: BuildContext): ActionPointTarget {
  const target = context.actionPointTargets.get(key);
  if (target) return target;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown action point reference "${key}".`, "action point", key);
  return { levelType: "land", levelIndex: 0, recordIndex: 0 };
}

function partyConditionCode(condition: ScenarioSeedPartyCondition) {
  return typeof condition === "number" ? condition : PARTY_CONDITION_CODES[condition];
}

function characterSelectorCode(selector: ScenarioSeedCharacterSelector) {
  return selector === "party" ? 0 : selector === "picked" ? -1 : selector;
}

function tileParameterCode(parameter: ScenarioSeedTileParameter) {
  return TILE_PARAMETER_CODES[parameter];
}

function randomRectangleShapeCode(shape: ScenarioSeedRandomRectangleShape) {
  return shape.mode === "unchanged" ? -1 : shape.mode === "absolute" ? 0 : shape.mode === "offset" ? 1 : 2;
}

function randomRectangleShapeValues(shape: ScenarioSeedRandomRectangleShape) {
  if (shape.mode === "unchanged") return [0, 0, 0, 0, 0];
  if (shape.mode === "absolute") return [shape.left, shape.right, shape.top, shape.bottom, 0];
  if (shape.mode === "offset") return [shape.x, shape.y, 0, 0, 0];
  return [shape.left, shape.right, shape.top, shape.bottom, 0];
}

function numericRef(ref: ScenarioSeedRef, label: string, context: BuildContext) {
  if (typeof ref === "number") return ref;
  const parsed = Number(ref);
  if (Number.isInteger(parsed)) return parsed;
  addDiagnostic(context, "error", "non-numeric-reference", `${label} reference "${ref}" must be numeric in this seed version.`, label, ref);
  return 0;
}

function resolveSeedAssetRef(ref: ScenarioSeedRef, expectedKind: ManagedAssetKind, label: string, context: BuildContext) {
  if (typeof ref === "number") return ref;
  const asset = context.assets.get(ref);
  if (!asset) return numericRef(ref, label, context);
  if (asset.kind !== expectedKind) {
    addDiagnostic(context, "error", "asset-kind-mismatch", `Asset "${ref}" is ${asset.kind}, but this ${label} field requires ${expectedKind}.`, "asset", ref);
  }
  return asset.resourceId;
}

function resolveMapTarget(ref: ScenarioSeedRef, context: BuildContext): MapTarget | null {
  if (typeof ref === "number") return { levelType: "land", index: ref };
  const resolved = context.maps.get(ref);
  if (resolved) return resolved;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown map reference "${ref}".`, "map", ref);
  return null;
}

function resolveRegionTarget(ref: ScenarioSeedRef, context: BuildContext): (MapTarget & { x: number; y: number }) | null {
  if (typeof ref !== "string") {
    addDiagnostic(context, "error", "invalid-region-reference", "Region reference must be a key string.", "region");
    return null;
  }
  const resolved = context.regions.get(ref);
  if (resolved) return resolved;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown region reference "${ref}".`, "region", ref);
  return null;
}

function addDiagnostic(context: BuildContext, severity: "error" | "warning", code: string, message: string, family?: string, key?: string) {
  context.diagnostics.push({ severity, code, message, ...(family ? { family } : {}), ...(key ? { key } : {}) });
  if (severity === "error") context.errors.push(message);
  else context.warnings.push(message);
}

function buildMap(seed: ScenarioSeedMap, fallbackIndex: number): MapEntity {
  const levelType = seed.levelType ?? "land";
  const index = seed.index ?? fallbackIndex;
  const source = levelType === "land" ? "Data LD" : "Data D";
  const landlook = seed.landlook ?? 0;
  const fillTile = seed.fillTile ?? landlookBaseTile(landlook) ?? 1;
  const tiles = seed.tiles ? [...seed.tiles] : new Array(MAP_SIZE * MAP_SIZE).fill(fillTile);
  for (const operation of seed.operations ?? []) applyMapOperation(tiles, operation, { landlook, mapSeed: `${levelType}:${index}` });
  return {
    id: `${levelType}:${index}`,
    levelType,
    source,
    index,
    name: seed.name ?? canonicalMapLevelName(levelType, index),
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles,
    render: { tilesetId: `landlook-${landlook}`, landlook, mode: levelType === "land" ? "outdoor-landlook" : "dungeon-landlook" },
    provenance: authoredProvenance(source, index, index * FIELD_BYTES, FIELD_BYTES)
  };
}

function buildRandomLevel(seed: ScenarioSeedMap, fallbackIndex: number): RandomLevel {
  const levelType = seed.levelType ?? "land";
  const index = seed.index ?? fallbackIndex;
  return {
    id: `${levelType}:${index}:randlevel`,
    source: "Data RD",
    levelType,
    levelIndex: index,
    landlook: seed.landlook ?? 0,
    isDark: seed.isDark ?? false,
    useLos: seed.useLos ?? false,
    rects: [],
    rawValues: new Array(RANDOM_LEVEL_BYTES / 2).fill(0),
    provenance: authoredProvenance("Data RD", index, index * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function applyMapOperation(tiles: number[], operation: ScenarioSeedMapOperation, mapContext: { landlook: number; mapSeed: string }) {
  if (operation.kind === "fill") {
    tiles.fill(operation.tile);
    return;
  }
  if (operation.kind === "rect") {
    for (let y = operation.y; y < operation.y + operation.height; y++) {
      for (let x = operation.x; x < operation.x + operation.width; x++) setTile(tiles, x, y, operation.tile);
    }
    return;
  }
  if (operation.kind === "line") {
    drawLine(tiles, operation.x1, operation.y1, operation.x2, operation.y2, operation.tile);
    return;
  }
  if (operation.kind === "path") {
    drawPath(tiles, operation.points, operation.tile, 1);
    return;
  }
  if (operation.kind === "border") {
    const thickness = operation.thickness ?? 1;
    for (let inset = 0; inset < thickness; inset++) {
      const left = operation.x + inset;
      const top = operation.y + inset;
      const right = operation.x + operation.width - inset - 1;
      const bottom = operation.y + operation.height - inset - 1;
      drawLine(tiles, left, top, right, top, operation.tile);
      drawLine(tiles, left, bottom, right, bottom, operation.tile);
      drawLine(tiles, left, top, left, bottom, operation.tile);
      drawLine(tiles, right, top, right, bottom, operation.tile);
    }
    return;
  }
  if (operation.kind === "room") {
    for (let y = operation.y; y < operation.y + operation.height; y++) {
      for (let x = operation.x; x < operation.x + operation.width; x++) setTile(tiles, x, y, operation.floorTile);
    }
    applyMapOperation(tiles, { kind: "border", x: operation.x, y: operation.y, width: operation.width, height: operation.height, tile: operation.wallTile }, mapContext);
    for (const door of operation.doors ?? []) {
      const x = door.side === "west" ? operation.x : door.side === "east" ? operation.x + operation.width - 1 : operation.x + door.offset;
      const y = door.side === "north" ? operation.y : door.side === "south" ? operation.y + operation.height - 1 : operation.y + door.offset;
      setTile(tiles, x, y, door.tile);
    }
    return;
  }
  if (operation.kind === "road" || operation.kind === "river") {
    drawPath(tiles, operation.points, operation.tile, operation.width ?? 1);
    return;
  }
  if (operation.kind === "stamp") {
    for (let row = 0; row < operation.tiles.length; row++) {
      for (let column = 0; column < operation.tiles[row].length; column++) {
        setTile(tiles, operation.x + column, operation.y + row, operation.tiles[row][column]);
      }
    }
    return;
  }
  if (operation.kind === "terrainGroup") {
    applyTerrainGroup(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "landSecret") {
    const index = operation.y * MAP_SIZE + operation.x;
    tiles[index] = setLandCellSecretState(tiles[index], operation.state, false);
    return;
  }
  if (operation.kind === "hiddenWalkable") {
    const index = operation.y * MAP_SIZE + operation.x;
    tiles[index] = setLandCellSecretState(operation.tile ?? defaultStockHiddenWalkableTile(mapContext.landlook) ?? 169, landCellSecretState(tiles[index]), false);
    return;
  }
  if (operation.kind === "combatClearing") {
    const index = operation.y * MAP_SIZE + operation.x;
    tiles[index] = setLandCellSecretState(operation.tile ?? defaultStockCombatClearingTile(mapContext.landlook) ?? 180, landCellSecretState(tiles[index]), false);
    return;
  }
  if (operation.kind === "dungeonPassage") {
    const directions = new Set(operation.directions);
    const index = operation.y * MAP_SIZE + operation.x;
    tiles[index] = setDungeonCellFlags(tiles[index], {
      allowMoveNorth: directions.has("north"),
      allowMoveEast: directions.has("east"),
      allowMoveSouth: directions.has("south"),
      allowMoveWest: directions.has("west")
    });
  }
}

function applyTerrainGroup(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "terrainGroup" }>,
  mapContext: { landlook: number; mapSeed: string }
) {
  const profile = GENERATED_SMART_TERRAIN_PROFILES.find((entry) => entry.landlook === mapContext.landlook);
  if (!profile) return;
  const cells = terrainGeometryCells(operation.geometry);
  const maskSet = new Set(cells.map(({ x, y }) => `${x}:${y}`));
  for (const cell of cells) {
    const context = terrainShapeContext(cell.x, cell.y, maskSet);
    const role = terrainRoleFromContext(context);
    const mask = terrainNeighborMask(context);
    const tile = semanticTerrainTile(tiles, cell.x, cell.y, operation.terrain, role, mask, maskSet, profile, mapContext.mapSeed);
    setTile(tiles, cell.x, cell.y, tile);
  }
}

function terrainGeometryCells(geometry: ScenarioSeedTerrainGeometry) {
  const cells = new Map<string, ScenarioSeedPoint>();
  const addSquare = (centerX: number, centerY: number, width: number) => {
    const before = Math.floor((width - 1) / 2);
    const after = width - before - 1;
    for (let y = centerY - before; y <= centerY + after; y++) {
      for (let x = centerX - before; x <= centerX + after; x++) cells.set(`${x}:${y}`, { x, y });
    }
  };
  if (geometry.kind === "rect") {
    for (let y = geometry.y; y < geometry.y + geometry.height; y++) {
      for (let x = geometry.x; x < geometry.x + geometry.width; x++) cells.set(`${x}:${y}`, { x, y });
    }
  } else {
    for (let index = 1; index < geometry.points.length; index++) {
      for (const point of linePoints(geometry.points[index - 1], geometry.points[index])) addSquare(point.x, point.y, geometry.width ?? 1);
    }
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

function linePoints(start: ScenarioSeedPoint, end: ScenarioSeedPoint) {
  const points: ScenarioSeedPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ x, y });
    if (x === end.x && y === end.y) return points;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

type TerrainShapeContext = { n: boolean; e: boolean; s: boolean; w: boolean; ne: boolean; se: boolean; sw: boolean; nw: boolean };

function terrainShapeContext(x: number, y: number, maskSet: Set<string>): TerrainShapeContext {
  const has = (xx: number, yy: number) => maskSet.has(`${xx}:${yy}`);
  return { n: has(x, y - 1), e: has(x + 1, y), s: has(x, y + 1), w: has(x - 1, y), ne: has(x + 1, y - 1), se: has(x + 1, y + 1), sw: has(x - 1, y + 1), nw: has(x - 1, y - 1) };
}

function terrainNeighborMask(context: TerrainShapeContext) {
  return (context.n ? 1 : 0) | (context.e ? 2 : 0) | (context.s ? 4 : 0) | (context.w ? 8 : 0)
    | (context.ne ? 16 : 0) | (context.se ? 32 : 0) | (context.sw ? 64 : 0) | (context.nw ? 128 : 0);
}

function terrainRoleFromContext(context: TerrainShapeContext): SmartBrushRole {
  const outside = [!context.n ? "north" : null, !context.s ? "south" : null, !context.e ? "east" : null, !context.w ? "west" : null].filter((value): value is "north" | "south" | "east" | "west" => value !== null);
  if (outside.length === 0) return "center";
  if (outside.length === 1) return outside[0];
  if (outside.length === 2) {
    if (!context.n && !context.s) return "lineHorizontal";
    if (!context.e && !context.w) return "lineVertical";
    if (!context.n && !context.e) return "northEast";
    if (!context.n && !context.w) return "northWest";
    if (!context.s && !context.e) return "southEast";
    if (!context.s && !context.w) return "southWest";
  }
  if (outside.length === 3) {
    if (context.n) return "capNorth";
    if (context.s) return "capSouth";
    if (context.e) return "capEast";
    if (context.w) return "capWest";
  }
  return "single";
}

function semanticTerrainTile(
  tiles: number[], x: number, y: number, terrain: SmartBrushPreset, role: SmartBrushRole, mask: number,
  maskSet: Set<string>, profile: SmartBrushProfile, mapSeed: string
) {
  const terrainProfile = profile.presets[terrain];
  if (terrainDistanceToBoundary(x, y, maskSet) >= 2) return seededTerrainPick(terrainProfile.center, mapSeed, terrain, x, y, "center");
  const curatedMask = terrainProfile.curatedMasks?.[String(mask)] ?? [];
  if (curatedMask.length > 0) return seededTerrainPick(curatedMask, mapSeed, terrain, x, y, `curated-mask:${mask}`);
  const curatedRoleTable = terrain === "mountains" && terrainTouchesWater(tiles, x, y, maskSet)
    ? terrainProfile.curatedWaterRoles
    : terrainProfile.curatedRoles;
  const curated = curatedRoleTable?.[role] ?? [];
  if (curated.length > 0) return seededTerrainPick(curated, mapSeed, terrain, x, y, `curated:${role}`);
  const exact = terrainProfile.maskCandidates?.[String(mask)]?.tiles ?? [];
  const roleCandidates = terrainProfile.roleCandidates?.[role] ?? [];
  let candidates = [...new Set([...roleCandidates, ...exact])].filter((tile) => !terrainProfile.center.includes(tile));
  if (terrain === "mountains") {
    const waterEdge = terrainTouchesWater(tiles, x, y, maskSet);
    const narrowed = candidates.filter((tile) => waterEdge ? tile >= 86 && tile <= 93 : tile >= 61 && tile <= 85);
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (terrain === "forest") candidates = candidates.filter((tile) => tile >= 121 && tile <= 129);
  const fallback = terrainProfile.fallbackRoles[role] ?? terrainProfile.center[0] ?? terrainProfile.family[0];
  return candidates.length > 0 ? seededTerrainPick(candidates, mapSeed, terrain, x, y, `${role}:${mask}`) : fallback;
}

function terrainDistanceToBoundary(x: number, y: number, maskSet: Set<string>) {
  for (let distance = 1; distance <= 2; distance++) {
    for (let yy = y - distance; yy <= y + distance; yy++) {
      for (let xx = x - distance; xx <= x + distance; xx++) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) === distance && !maskSet.has(`${xx}:${yy}`)) return distance - 1;
      }
    }
  }
  return 2;
}

function terrainTouchesWater(tiles: number[], x: number, y: number, maskSet: Set<string>) {
  const neighbors = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
  return neighbors.some(([xx, yy]) => !maskSet.has(`${xx}:${yy}`) && xx >= 0 && yy >= 0 && xx < MAP_SIZE && yy < MAP_SIZE && isWaterTerrainTile(tiles[yy * MAP_SIZE + xx]));
}

function isWaterTerrainTile(tile: number) {
  const normalized = Math.abs(tile) % 1000;
  return (normalized >= 1 && normalized <= 60) || (normalized >= 105 && normalized <= 112);
}

function seededTerrainPick(candidates: number[], mapSeed: string, terrain: SmartBrushPreset, x: number, y: number, salt: string) {
  if (candidates.length === 0) return 1;
  const source = `${mapSeed}:${terrain}:${x}:${y}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return candidates[(hash >>> 0) % candidates.length];
}

function syncActionPointMarkers(maps: MapEntity[], triggers: TriggerRecord[]) {
  const coordinates = new Map<string, Set<number>>();
  for (const trigger of triggers) {
    if (!trigger.active || !trigger.coordinate || trigger.levelType === null || trigger.levelIndex === null) continue;
    const key = `${trigger.levelType}:${trigger.levelIndex}`;
    const set = coordinates.get(key) ?? new Set<number>();
    set.add(trigger.coordinate.y * MAP_SIZE + trigger.coordinate.x);
    coordinates.set(key, set);
  }
  return maps.map((map) => {
    const marked = coordinates.get(`${map.levelType}:${map.index}`) ?? new Set<number>();
    const tiles = map.tiles.map((value, index) => {
      const cleared = clearActionPointMarker(value, map.levelType);
      return marked.has(index) ? ensureActionPointMarker(cleared, map.levelType) : cleared;
    });
    return { ...map, tiles };
  });
}

function drawPath(tiles: number[], points: ScenarioSeedPoint[], tile: number, width: number) {
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const next = points[i];
    drawLine(tiles, previous.x, previous.y, next.x, next.y, tile, width);
  }
}

function drawLine(tiles: number[], x1: number, y1: number, x2: number, y2: number, tile: number, width = 1) {
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    paintSquare(tiles, x, y, tile, width);
    if (x === x2 && y === y2) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function paintSquare(tiles: number[], centerX: number, centerY: number, tile: number, width: number) {
  const before = Math.floor((width - 1) / 2);
  const after = width - before - 1;
  for (let y = centerY - before; y <= centerY + after; y++) {
    for (let x = centerX - before; x <= centerX + after; x++) setTile(tiles, x, y, tile);
  }
}

function setTile(tiles: number[], x: number, y: number, tile: number) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
  tiles[y * MAP_SIZE + x] = tile;
}

function buildTilesets(maps: MapEntity[]): TilesetAsset[] {
  const landlooks = [...new Set(maps.map((map) => map.render.landlook ?? 0))].sort((a, b) => a - b);
  return landlooks.map((landlook) => {
    const pictId = landlookPictId(landlook);
    const imagePath = browserReferenceAtlasUrl(pictId);
    return {
      id: `landlook-${landlook}`,
      landlook,
      name: landlookName(landlook),
      source: imagePath ? "Scenario seed: bundled Realmz reference PICT" : "Scenario seed: missing reference atlas",
      available: hasBrowserReferenceAtlas(pictId),
      imagePath: null,
      pictId,
      tileWidth: 32,
      tileHeight: 32,
      columns: 20,
      rows: 10,
      baseTile: landlookBaseTile(landlook),
      custom: landlook >= 6 && landlook <= 8
    };
  });
}

function buildSeedAssets(seedAssets: ScenarioSeedAsset[], customAssets: ManagedAsset[], context: BuildContext): ManagedAsset[] {
  const projectAssets: ManagedAsset[] = [];
  for (const seedAsset of seedAssets) {
    if (seedAsset.source === "stock") {
      const resolved = {
        kind: seedAsset.kind ?? managedAssetKindForResourceType(seedAsset.resourceType),
        resourceType: seedAsset.resourceType,
        resourceId: seedAsset.resourceId,
        bundled: false
      };
      context.assets.set(seedAsset.key, resolved);
      context.allocations.assets.push({ key: seedAsset.key, source: seedAsset.source, resourceType: resolved.resourceType, resourceId: resolved.resourceId, bundled: false });
      continue;
    }

    const source = customAssets.find((asset) => asset.id === seedAsset.assetId);
    if (!source) {
      addDiagnostic(context, "error", "unresolved-asset-reference", `Custom Library asset "${seedAsset.assetId}" was not provided to the scenario seed compiler.`, "asset", seedAsset.key);
      continue;
    }
    if (source.libraryScope !== "custom-library") {
      addDiagnostic(context, "error", "invalid-asset-source", `Asset "${seedAsset.assetId}" is not a Custom Library asset.`, "asset", seedAsset.key);
      continue;
    }
    const resourceId = seedAsset.resourceId ?? nextResourceId(projectAssets, source.kind);
    validateScenarioAssetResourceId(source.kind, resourceId, seedAsset.key, context);
    if (projectAssets.some((asset) => asset.resourceType === source.resourceType && asset.resourceId === resourceId)) {
      addDiagnostic(context, "error", "duplicate-asset-resource", `Asset "${seedAsset.key}" duplicates ${source.resourceType} resource ID ${resourceId}.`, "asset", seedAsset.key);
      continue;
    }
    const managed: ManagedAsset = {
      ...source,
      id: `asset:seed:${slugify(seedAsset.key)}`,
      resourceId,
      libraryScope: "scenario",
      linkedEntity: source.kind === "special-land-tile" ? `special-land-tile:${resourceId}` : source.linkedEntity,
      provenance: `${source.provenance}; copied from Providence Custom Library by scenario seed`
    };
    projectAssets.push(managed);
    context.assets.set(seedAsset.key, { kind: managed.kind, resourceType: managed.resourceType, resourceId, bundled: true });
    context.allocations.assets.push({ key: seedAsset.key, source: seedAsset.source, resourceType: managed.resourceType, resourceId, bundled: true });
  }
  return projectAssets;
}

function managedAssetKindForResourceType(resourceType: string): ManagedAssetKind {
  const normalized = resourceType.trim().toLowerCase();
  if (normalized === "pict") return "picture";
  if (normalized === "cicn") return "icon";
  if (normalized === "snd") return "sound";
  if (normalized === "text" || normalized === "str#" || normalized === "styl") return "text";
  return "other";
}

function validateScenarioAssetResourceId(kind: ManagedAssetKind, resourceId: number, key: string, context: BuildContext) {
  const valid = kind === "picture"
    ? resourceId >= 30000 && resourceId <= 30128
    : kind === "sound"
      ? resourceId >= 200 && resourceId <= 500
      : kind === "special-land-tile"
        ? resourceId < 0
        : true;
  if (!valid) addDiagnostic(context, "error", "invalid-scenario-asset-id", `Asset "${key}" uses resource ID ${resourceId}, which is outside the scenario range for ${kind} assets.`, "asset", key);
}

function buildBattle(seed: ScenarioSeedBattle, context: BuildContext): BattleRecord {
  const id = seed.id ?? 0;
  const grid = padArray(seed.grid ?? [], 13 * 13, 0);
  for (const placement of seed.placements ?? []) {
    const monsterId = resolveMonsterRef(placement.monster, context);
    grid[placement.y * 13 + placement.x] = placement.friendly ? -monsterId : monsterId;
  }
  return {
    id,
    grid,
    dist: seed.dist ?? 0,
    messageBefore: seed.messageBefore ?? 0,
    messageAfter: seed.messageAfter ?? 0,
    battleMacro: seed.battleMacro ?? 0,
    rawBytes: new Array(BATTLE_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data BD", id, id * BATTLE_BYTES, BATTLE_BYTES)
  };
}

function resolveMonsterLibraryEntry(seed: ScenarioSeedMonster, context: BuildContext): { record: MonsterRecord; description: string } | null {
  if (seed.libraryEntry === undefined) return null;
  const entry = context.libraryCatalog?.entities.find((candidate) => candidate.id === seed.libraryEntry);
  if (!entry) {
    addDiagnostic(context, "error", "unresolved-monster-library-entry", `Monster Library entry "${seed.libraryEntry}" was not provided to the scenario seed compiler.`, "monster", seed.key ?? seed.libraryEntry);
    return null;
  }
  const record = monsterLibraryEntryTemplate(entry);
  if (!record) {
    addDiagnostic(context, "error", "invalid-monster-library-entry", `Monster Library entry "${seed.libraryEntry}" does not contain a reusable monster record.`, "monster", seed.key ?? seed.libraryEntry);
    return null;
  }
  return { record, description: monsterLibraryEntryDescription(entry) };
}

function buildMonster(seed: ScenarioSeedMonster, context: BuildContext, template: MonsterRecord | undefined): MonsterRecord {
  const id = seed.id ?? 0;
  return {
    id,
    hitDice: seed.hitDice ?? template?.hitDice ?? 1,
    staminaBonus: seed.staminaBonus ?? template?.staminaBonus ?? 0,
    agility: seed.agility ?? template?.agility ?? 10,
    nameId: seed.nameId ?? (id & 0xff),
    movementMax: seed.movementMax ?? template?.movementMax ?? 10,
    armor: seed.armor ?? template?.armor ?? 0,
    magicResistance: seed.magicResistance ?? template?.magicResistance ?? 0,
    distance: seed.distance ?? template?.distance ?? 0,
    traitor: seed.traitor ?? template?.traitor ?? 0,
    size: seed.size ?? template?.size ?? 1,
    typeFlags: padArray(seed.typeFlags ?? template?.typeFlags ?? [], 8, 0),
    attackCount: seed.attackCount ?? (seed.attacks ? Math.max(1, Math.min(5, seed.attacks.length)) : template?.attackCount ?? 1),
    magicAttackCount: seed.magicAttackCount ?? template?.magicAttackCount ?? 0,
    attacks: padNestedNumberArrays(seed.attacks ?? template?.attacks ?? [[0, 0, 0, 0]], 5, 4, 0),
    damageBonus: seed.damageBonus ?? template?.damageBonus ?? 0,
    castPercent: seed.castPercent ?? template?.castPercent ?? 0,
    runPercent: seed.runPercent ?? template?.runPercent ?? 0,
    surrenderPercent: seed.surrenderPercent ?? template?.surrenderPercent ?? 0,
    missilePercent: seed.missilePercent ?? template?.missilePercent ?? 0,
    canSummon: seed.canSummon ?? template?.canSummon ?? 0,
    saves: padArray(seed.saves ?? template?.saves ?? [], 6, 0),
    spellImmunities: padArray(seed.spellImmunities ?? template?.spellImmunities ?? [], 6, 0),
    money: padArray(seed.money ?? template?.money ?? [], 3, 0),
    spells: padArray(seed.spells ?? template?.spells ?? [], 10, 0),
    items: seed.items === undefined ? padArray(template?.items ?? [], 6, 0) : padArray(seed.items.map((item) => resolveItemRef(item, context)), 6, 0),
    weapon: seed.weapon === undefined ? template?.weapon ?? 0 : resolveItemRef(seed.weapon, context),
    iconId: seed.iconId ?? (seed.icon === undefined ? template?.iconId ?? 0 : resolveSeedAssetRef(seed.icon, "icon", "monster icon", context)),
    spellPoints: seed.spellPoints ?? template?.spellPoints ?? 0,
    exp: seed.exp ?? template?.exp ?? 0,
    stamina: seed.stamina ?? template?.stamina ?? 0,
    staminaMax: seed.staminaMax ?? template?.staminaMax ?? 0,
    underneath: padArray(seed.underneath ?? template?.underneath ?? [], 4, 0),
    target: seed.target ?? template?.target ?? 0,
    guarding: seed.guarding ?? template?.guarding ?? 0,
    notOnMenu: seed.notOnMenu ?? template?.notOnMenu ?? false,
    beenAttacked: seed.beenAttacked ?? template?.beenAttacked ?? 0,
    movement: seed.movement ?? template?.movement ?? 0,
    magicToHit: seed.magicToHit ?? template?.magicToHit ?? 0,
    conditions: padArray(seed.conditions ?? template?.conditions ?? [], 40, 0),
    lr: seed.lr ?? template?.lr ?? 0,
    up: seed.up ?? template?.up ?? 0,
    attackNum: seed.attackNum ?? template?.attackNum ?? 0,
    bonusAttack: seed.bonusAttack ?? template?.bonusAttack ?? 0,
    deathMacro: seed.deathMacro === undefined ? template?.deathMacro ?? 0 : resolveRef(seed.deathMacro, context.actionPoints, "action point", context),
    maxSpellPoints: seed.maxSpellPoints ?? template?.maxSpellPoints ?? 0,
    displayName: seed.displayName ?? seed.name ?? template?.displayName ?? `Monster ${id}`,
    rawBytes: new Array(MONSTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data MD", id, id * MONSTER_BYTES, MONSTER_BYTES)
  };
}

function buildMonsterDescription(seed: ScenarioSeedMonster, templateDescription?: string): MonsterDescriptionRecord | null {
  const description = seed.description ?? templateDescription;
  if (description === undefined || description.length === 0) return null;
  const id = seed.id ?? 0;
  return {
    id,
    text: description,
    rawBytes: new Array(MONSTER_DESCRIPTION_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data DES", id, id * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  };
}

function buildTreasure(seed: ScenarioSeedTreasure, context: BuildContext): TreasureRecord {
  const id = seed.id ?? 0;
  return {
    id,
    itemIds: padArray((seed.itemIds ?? []).map((itemId) => resolveItemRef(itemId, context)), 20, 0),
    exp: seed.exp ?? 0,
    gold: seed.gold ?? 0,
    gems: seed.gems ?? 0,
    jewelry: seed.jewelry ?? 0,
    rawBytes: new Array(TREASURE_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data TD", id, id * TREASURE_BYTES, TREASURE_BYTES)
  };
}

function buildShop(seed: ScenarioSeedShop, context: BuildContext): ShopRecord {
  const id = seed.id ?? 0;
  const itemIds = new Array(1000).fill(0);
  const quantities = new Array(1000).fill(0);
  for (const [index, stock] of (seed.stock ?? []).entries()) {
    itemIds[index] = resolveItemRef(stock.itemId, context);
    quantities[index] = stock.quantity ?? 1;
  }
  return {
    id,
    itemIds,
    quantities,
    inflation: seed.inflation ?? 0,
    rawBytes: new Array(SHOP_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data SD", id, id * SHOP_BYTES, SHOP_BYTES)
  };
}

function buildItem(seed: ScenarioSeedItem, context: BuildContext): ScenarioItemRecord {
  const id = seed.id ?? 0;
  return {
    id,
    itemId: seed.itemId ?? SCENARIO_ITEM_ID_BASE + id,
    iconId: seed.iconId ?? (seed.icon === undefined ? 0 : resolveSeedAssetRef(seed.icon, "icon", "item icon", context)),
    type: seed.type ?? (seed.typeName === undefined ? 0 : SCENARIO_ITEM_TYPE_CODES[seed.typeName]),
    st: seed.st ?? 0,
    blunt: seed.blunt ?? 0,
    hands: seed.hands ?? 0,
    lu: seed.lu ?? 0,
    movement: seed.movement ?? 0,
    ac: seed.ac ?? 0,
    magicResistance: seed.magicResistance ?? 0,
    damage: seed.damage ?? 0,
    spellPoints: seed.spellPoints ?? 0,
    sound: seed.sound ?? 0,
    weight: seed.weight ?? 0,
    cost: seed.cost ?? 0,
    charge: seed.charge ?? 0,
    cursedItemId: seed.cursedItemId ?? 0,
    magical: seed.magical ?? 0,
    itemCat0: seed.itemCat0 ?? 0,
    itemCat1: seed.itemCat1 ?? 0,
    raceRestrictions: seed.raceRestrictions ?? 0,
    casteRestrictions: seed.casteRestrictions ?? 0,
    specificRace: seed.specificRace ?? 0,
    specificCaste: seed.specificCaste ?? 0,
    raceClassOnly: seed.raceClassOnly ?? 0,
    casteClassOnly: seed.casteClassOnly ?? 0,
    spare2: new Array(7).fill(0),
    vSmall: seed.vSmall ?? 0,
    vLarge: seed.vLarge ?? 0,
    heat: seed.heat ?? 0,
    cold: seed.cold ?? 0,
    electric: seed.electric ?? 0,
    vsUndead: seed.vsUndead ?? 0,
    vsDemonDevil: seed.vsDemonDevil ?? 0,
    vsEvil: seed.vsEvil ?? 0,
    special1: seed.special1 ?? 0,
    special2: seed.special2 ?? 0,
    special3: seed.special3 ?? 0,
    special4: seed.special4 ?? 0,
    special5: seed.special5 ?? 0,
    weightPerCharge: seed.weightPerCharge ?? 0,
    dropOnEmpty: seed.dropOnEmpty ?? 0,
    rawBytes: new Array(ITEM_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data NI", id, id * ITEM_BYTES, ITEM_BYTES)
  };
}

function buildItemText(seed: ScenarioSeedItem): ItemTextRecord | null {
  if (seed.unidentifiedName === undefined && seed.identifiedName === undefined && seed.description === undefined) return null;
  const id = seed.itemId ?? SCENARIO_ITEM_ID_BASE + (seed.id ?? 0);
  return {
    id,
    itemId: id,
    unidentifiedName: seed.unidentifiedName ?? seed.identifiedName ?? "",
    identifiedName: seed.identifiedName ?? seed.unidentifiedName ?? "",
    description: seed.description ?? "",
    authored: true,
    provenance: authoredProvenance("Data ID.rsrc", id, 0, 0)
  };
}

function buildSimpleEncounters(seeds: ScenarioSeedSimpleEncounter[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { records: SimpleEncounterRecord[]; extracodes: ExtraCodeRow[] } {
  let nextEdcdId = initialExtracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  const allocateEdcdId = () => nextEdcdId++;
  const records = seeds.map((seed) => buildSimpleEncounter(seed, context, allocateEdcdId, extracodes));
  return { records, extracodes };
}

function buildSimpleEncounter(
  seed: ScenarioSeedSimpleEncounter,
  context: BuildContext,
  nextEdcdId: () => number,
  extracodes: ExtraCodeRow[]
): SimpleEncounterRecord {
  const id = seed.id ?? 0;
  const semanticActions = (seed.options ?? []).flatMap((option, optionIndex) => {
    const result = (optionIndex + 1) as ScenarioSeedComplexResultNumber;
    const scope: ActionBuildScope = { kind: "encounter", encounterType: "simple", recordIndex: id, result };
    return option.steps.map((step, stepIndex): EncounterActionRow => {
      const action = buildAction(step, optionIndex * 8 + stepIndex, context, nextEdcdId, extracodes, scope);
      return { slot: action.slot, rawCode: action.rawCode, id: action.id };
    });
  });
  const actions = (seed.actions ?? []).length > 0
    ? (seed.actions ?? []).map((action, index): EncounterActionRow => ({
        slot: action.slot ?? index,
        rawCode: action.rawCode,
        id: action.id
      }))
    : semanticActions;
  return {
    id,
    actions,
    choiceResults: seed.options
      ? padArray(seed.options.map((_, index) => index + 1), 4, 0)
      : padArray(seed.choiceResults ?? [], 4, 0),
    canBackOut: seed.canBackOut ?? false,
    maxTimes: seed.maxTimes ?? 0,
    casteSuccess: seed.casteSuccess ?? 0,
    prompt: seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
    texts: padStringArray(seed.options?.map((option) => option.label) ?? seed.texts ?? [], 4, ""),
    rawBytes: new Array(SIMPLE_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data ED", id, id * SIMPLE_ENCOUNTER_BYTES, SIMPLE_ENCOUNTER_BYTES)
  };
}

function buildThiefEncounter(seed: ScenarioSeedThiefEncounter, context: BuildContext): ThiefEncounterRecord {
  const id = seed.id ?? 1;
  const typeFlags = new Array<boolean>(10).fill(false);
  const modifiers = new Array<number>(8).fill(0);
  const successCodes = new Array<number>(8).fill(0);
  const failureCodes = new Array<number>(8).fill(0);
  const successText = new Array<number>(8).fill(0);
  const failureText = new Array<number>(8).fill(0);
  const successSounds = new Array<number>(8).fill(0);
  const failureSounds = new Array<number>(8).fill(0);

  for (const action of seed.actions ?? []) {
    const slot = ROGUE_ACTION_SLOTS[action.kind];
    typeFlags[slot] = true;
    modifiers[slot] = action.modifier ?? 0;
    successCodes[slot] = action.success.result ?? 0;
    failureCodes[slot] = action.failure.result ?? 0;
    successText[slot] = action.success.message === undefined ? 0 : resolveRef(action.success.message, context.messages, "message", context);
    failureText[slot] = action.failure.message === undefined ? 0 : resolveRef(action.failure.message, context.messages, "message", context);
    successSounds[slot] = action.success.sound === undefined ? 0 : resolveSeedAssetRef(action.success.sound, "sound", "sound", context);
    failureSounds[slot] = action.failure.sound === undefined ? 0 : resolveSeedAssetRef(action.failure.sound, "sound", "sound", context);
  }

  typeFlags[8] = seed.trap?.rogueOnly ?? false;
  typeFlags[9] = seed.trap?.armed ?? false;
  return {
    id,
    typeFlags,
    modifiers,
    successCodes,
    failureCodes,
    successText,
    failureText,
    successSounds,
    failureSounds,
    spell: seed.trap?.spell ?? 0,
    lowDamage: seed.trap?.damage?.low ?? 0,
    highDamage: seed.trap?.damage?.high ?? 0,
    tumblers: seed.lock?.tumblers ?? 0,
    prompts: [
      seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
      seed.trap?.sound === undefined ? 0 : resolveSeedAssetRef(seed.trap.sound, "sound", "sound", context),
      seed.trap?.spellPower ?? 0
    ],
    promptSounds: [0, seed.lock?.openChancePerLevel ?? 0, seed.trap?.disarmChancePerLevel ?? 0],
    rawBytes: new Array(THIEF_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data TD2", id, id * THIEF_ENCOUNTER_BYTES, THIEF_ENCOUNTER_BYTES)
  };
}

function buildComplexEncounters(seeds: ScenarioSeedComplexEncounter[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { records: ComplexEncounterRecord[]; extracodes: ExtraCodeRow[] } {
  let nextEdcdId = initialExtracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  const allocateEdcdId = () => nextEdcdId++;
  const records = seeds.map((seed) => buildComplexEncounter(seed, context, allocateEdcdId, extracodes));
  return { records, extracodes };
}

function buildComplexEncounter(
  seed: ScenarioSeedComplexEncounter,
  context: BuildContext,
  nextEdcdId: () => number,
  extracodes: ExtraCodeRow[]
): ComplexEncounterRecord {
  const id = seed.id ?? 0;
  const physicalActions = padStringArray(seed.physicalActions ?? [], 8, "");
  const requiredPhysicalActions = new Set(seed.requiredPhysicalActions ?? []);
  const semanticActions = (seed.results ?? []).flatMap((result) => {
    const scope: ActionBuildScope = { kind: "encounter", encounterType: "complex", recordIndex: id, result: result.result };
    return result.steps.map((step, index): EncounterActionRow => {
      const action = buildAction(step, (result.result - 1) * 8 + index, context, nextEdcdId, extracodes, scope);
      return { slot: action.slot, rawCode: action.rawCode, id: action.id };
    });
  });
  const actions = (seed.actions ?? []).length > 0
    ? (seed.actions ?? []).map((action, index): EncounterActionRow => ({ slot: action.slot ?? index, rawCode: action.rawCode, id: action.id }))
    : semanticActions;
  const spellIds = padArray((seed.spells ?? []).map((response) => response.spell), 10, MAGIC_RESPONSE_BLANK_SPELL_ID);
  const spellResults = padArray((seed.spells ?? []).map((response) => response.result), 10, 0);
  const itemIds = padArray((seed.items ?? []).map((response) => resolveItemRef(response.item, context)), 5, 0);
  const itemResults = padArray((seed.items ?? []).map((response) => response.result), 5, 0);
  return {
    id,
    actions,
    actionResult: seed.physicalResult ?? 0,
    wordResult: seed.word?.result ?? 0,
    groups: Array.from({ length: 8 }, (_, index) => requiredPhysicalActions.has(index + 1) ? 1 : 0),
    spellIds,
    spellResults,
    itemIds,
    itemResults,
    choiceResults: [seed.physicalResult ?? 0, 0, 0, 0],
    wordResults: [seed.word?.result ?? 0, 0, 0, 0],
    canBackOut: seed.canBackOut ?? false,
    thief: Boolean(seed.thief),
    maxTimes: seed.maxTimes ?? 0,
    casteSuccess: seed.casteSuccess ?? 0,
    thiefSuccess: seed.thief === undefined ? 0 : resolveRef(seed.thief.encounter, context.thiefEncounters, "Rogue encounter", context),
    thiefFail: 0,
    prompt: seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
    texts: [...physicalActions, seed.word?.text ?? ""],
    rawBytes: new Array(COMPLEX_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data ED2", id, id * COMPLEX_ENCOUNTER_BYTES, COMPLEX_ENCOUNTER_BYTES)
  };
}

function buildTimedEncounter(seed: ScenarioSeedTimedEncounter, context: BuildContext): TimedEncounterRecord {
  const id = seed.id ?? 0;
  const location = seed.location ?? { kind: "any" as const };
  return {
    id,
    day: seed.day,
    increment: seed.increment ?? 0,
    percent: seed.percent ?? 100,
    door: resolveRef(seed.macro, context.extraActionPoints, "extra action point", context),
    requiredLevel: location.kind === "any" ? -1 : location.level,
    requiredRandomRect: location.kind === "any" ? -1 : location.randomRectangle ?? -1,
    requiredX: location.kind === "any" ? -1 : location.x ?? -1,
    requiredY: location.kind === "any" ? -1 : location.y ?? -1,
    requiredItem: seed.requiredItem === undefined ? -1 : resolveItemRef(seed.requiredItem, context),
    requiredQuest: seed.requiredQuest === undefined ? -1 : resolveRef(seed.requiredQuest, context.quests, "quest", context),
    locationKind: location.kind,
    stuff: [location.kind === "land" ? 1 : location.kind === "dungeon" ? 2 : 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    rawBytes: new Array(TIMED_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data TD3", id, id * TIMED_ENCOUNTER_BYTES, TIMED_ENCOUNTER_BYTES)
  };
}

function buildTriggers(actionPoints: ScenarioSeedActionPoint[], extraActionPoints: ScenarioSeedExtraActionPoint[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { triggers: TriggerRecord[]; extracodes: ExtraCodeRow[] } {
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  let nextEdcdId = extracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const allocateEdcdId = () => nextEdcdId++;
  const triggers = actionPoints.map((actionPoint, index): TriggerRecord => {
    const mapTarget = actionPoint.map !== undefined ? resolveMapTarget(actionPoint.map, context) : null;
    const regionTarget = actionPoint.at !== undefined ? resolveRegionTarget(actionPoint.at, context) : null;
    const levelType = actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land";
    const levelIndex = actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0;
    const recordIndex = actionPoint.recordIndex ?? index;
    const x = actionPoint.x ?? regionTarget?.x ?? mapTarget?.x ?? 0;
    const y = actionPoint.y ?? regionTarget?.y ?? mapTarget?.y ?? 0;
    const scope: ActionBuildScope = { kind: "map", levelType, levelIndex, recordIndex };
    const actions = actionPoint.steps.map((step, slot) => buildAction(step, slot, context, allocateEdcdId, extracodes, scope));
    return {
      id: actionPoint.id ?? `${levelType}:${levelIndex}:ap:${recordIndex}`,
      source: levelType === "land" ? "Data DD" : "Data DDD",
      levelType,
      levelIndex,
      recordIndex,
      active: true,
      doorid: levelIndex * 10000 + y * 100 + x,
      percent: actionPoint.percent ?? 100,
      coordinate: { x, y },
      actions,
      landid: levelIndex,
      targetX: x,
      targetY: y,
      provenance: authoredProvenance(levelType === "land" ? "Data DD" : "Data DDD", recordIndex, (levelIndex * 100 + recordIndex) * DOOR_BYTES, DOOR_BYTES)
    };
  });
  const macros = extraActionPoints.map((extraActionPoint): TriggerRecord => {
    const recordIndex = extraActionPoint.id ?? 0;
    const scope: ActionBuildScope = { kind: "extra", recordIndex };
    return {
      id: `Data ED3:macro:${recordIndex}`,
      source: "Data ED3",
      levelType: null,
      levelIndex: null,
      recordIndex,
      active: true,
      doorid: 0,
      landid: 0,
      targetX: 0,
      targetY: 0,
      percent: 100,
      coordinate: null,
      actions: extraActionPoint.steps.map((step, slot) => buildAction(step, slot, context, allocateEdcdId, extracodes, scope)),
      provenance: authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_BYTES, DOOR_BYTES)
    };
  });
  return { triggers: [...triggers, ...macros], extracodes };
}

function buildAction(step: ScenarioSeedStep, slot: number, context: BuildContext, nextEdcdId: () => number, extracodes: ExtraCodeRow[], scope: ActionBuildScope): Action {
  if (step.kind === "message") return describeAction(slot, 1, resolveRef(step.message, context.messages, "message", context));
  if (step.kind === "simpleEncounter") return describeAction(slot, 4, resolveRef(step.encounter, context.simpleEncounters, "simple encounter", context));
  if (step.kind === "complexEncounter") return describeAction(slot, 5, resolveRef(step.encounter, context.complexEncounters, "complex encounter", context));
  if (step.kind === "shop") return describeAction(slot, 6, resolveRef(step.shop, context.shops, "shop", context));
  if (step.kind === "treasure") return describeAction(slot, 10, resolveRef(step.treasure, context.treasures, "treasure", context));
  if (step.kind === "sound") return describeAction(slot, 9, resolveSeedAssetRef(step.sound, "sound", "sound", context));
  if (step.kind === "picture") return describeAction(slot, 27, resolveSeedAssetRef(step.picture, "picture", "picture", context));
  if (step.kind === "scrollingText") return describeAction(slot, 62, resolveSeedAssetRef(step.text, "text", "scrolling text", context));
  if (step.kind === "victoryPoints") return describeAction(slot, 11, step.amount);
  if (step.kind === "temple") return describeAction(slot, 32, step.inflation);
  if (step.kind === "banking") return describeAction(slot, 49, step.shop === undefined ? 0 : resolveRef(step.shop, context.shops, "shop", context));
  if (step.kind === "displayMap") return describeAction(slot, 29, step.map);
  if (step.kind === "pickCharacters") return describeAction(slot, step.inverse ? -14 : 14, step.count);
  if (step.kind === "returnGosub") return describeAction(slot, 111, 0);
  if (step.kind === "popStack") return describeAction(slot, 112, 0);
  if (step.kind === "addSpecialCharacter") return describeAction(slot, 89, resolveMonsterRef(step.monster, context));
  if (step.kind === "dropSpecialCharacter") return describeAction(slot, 88, resolveMonsterRef(step.monster, context));
  if (step.kind === "setQuestFlag") return describeAction(slot, 47, resolveRef(step.quest, context.quests, "quest", context));
  if (step.kind === "raw") return describeAction(slot, step.rawCode, step.id);
  if (step.kind === "battle") {
    return buildEdcdAction(slot, 2, [
      resolveRef(step.battle, context.battles, "battle", context),
      step.battleHigh === undefined ? resolveRef(step.battle, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
      step.reviveParty ? 10 : 0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "teleport") {
    return buildEdcdAction(slot, step.teleportOnly ? 45 : 20, [
      step.landLevel ?? -1,
      step.x ?? -1,
      step.y ?? -1,
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "randomMessage") return buildEdcdAction(slot, 19, [resolveRef(step.low, context.messages, "message", context), resolveRef(step.high, context.messages, "message", context), 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "selectiveBattle") {
    const opcode = step.improved ? 107 : 48;
    return buildEdcdAction(slot, opcode, [
      resolveRef(step.battleLow, context.battles, "battle", context),
      step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
      step.improved ? (step.cowardMacro === undefined ? 0 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context)) : (step.treasure === undefined ? 0 : resolveRef(step.treasure, context.treasures, "treasure", context))
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "battleOutcome") return buildEdcdAction(slot, 56, [
    resolveRef(step.battleLow, context.battles, "battle", context),
    step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
    step.cowardMacro === undefined ? -1 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context),
    step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
    step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "improvedBattleOutcome") return buildEdcdAction(slot, 107, [
    resolveRef(step.battleLow, context.battles, "battle", context),
    step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
    step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
    step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
    step.cowardMacro === undefined ? 0 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "causeRout") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "causeRout can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 123, step.monsters.map((monster) => resolveMonsterRef(monster, context)), nextEdcdId, extracodes);
  }
  if (step.kind === "battleMacroCriteria") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "battleMacroCriteria can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 126, [
      step.mode,
      step.roundOrPercent,
      step.repeatMode,
      resolveRef(step.macroLow, context.extraActionPoints, "extra action point", context),
      step.macroHigh === undefined ? 0 : resolveRef(step.macroHigh, context.extraActionPoints, "extra action point", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "spawnMonsters") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "spawnMonsters can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 124, [0, resolveMonsterRef(step.monster, context), step.countOrRandomLimit, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.traitorOverride ?? 0], nextEdcdId, extracodes);
  }
  if (step.kind === "destroyRelatedMonsters") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "destroyRelatedMonsters can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 125, [resolveMonsterRef(step.monster, context), step.maxCount ?? 0, 0, 0, step.includeTraitorSide ? 1 : 0], nextEdcdId, extracodes);
  }
  if (step.kind === "continueIfMonsterPresent") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "continueIfMonsterPresent can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return describeAction(slot, 127, resolveMonsterRef(step.monster, context));
  }
  if (step.kind === "alterTimedEncounter") return buildEdcdAction(slot, 54, [
    resolveRef(step.timedEncounter, context.timedEncounters, "timed encounter", context),
    step.percent ?? -1,
    step.increment ?? -1,
    step.resetFromCurrentDay ? 1 : 0,
    step.resetFromCurrentDay ? step.daysUntilNext ?? 0 : -1
  ], nextEdcdId, extracodes);
  if (step.kind === "branchOnQuest") return buildEdcdAction(slot, 46, [resolveRef(step.quest, context.quests, "quest", context), step.test ?? 0, step.branchMode ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context), step.code ?? 0], nextEdcdId, extracodes);
  if (step.kind === "questValue") return buildEdcdAction(slot, 76, [resolveRef(step.quest, context.quests, "quest", context), step.amount, step.branchType ?? 0, step.threshold ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnQuestValue") return buildEdcdAction(slot, 77, [resolveRef(step.quest, context.quests, "quest", context), step.testValue ?? 0, step.branchType ?? 0, step.lessThanTarget === undefined ? 0 : resolveRef(step.lessThanTarget, context.actionPoints, "action point", context), step.equalOrGreaterTarget === undefined ? 0 : resolveRef(step.equalOrGreaterTarget, context.actionPoints, "action point", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnRandom") return buildEdcdAction(slot, 85, [step.mode ?? 0, step.low, step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnPercent") return buildEdcdAction(slot, 42, [step.percent, step.successBehavior ?? 0, step.branchMode ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context), step.code ?? 0], nextEdcdId, extracodes);
  if (step.kind === "changeTile") return buildEdcdAction(slot, 12, [step.level ?? 0, step.x, step.y, step.tile, step.dungeon ? 1 : 0], nextEdcdId, extracodes);
  if (step.kind === "healHurtParty") return buildEdcdAction(slot, step.picked ? 15 : 16, [step.multiplier, step.low, step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "takeGold") return buildEdcdAction(slot, 33, [step.amount, step.failureMarker ?? 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "giveCondition") return buildEdcdAction(slot, 43, [step.who ?? 0, step.condition, step.duration, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), 0], nextEdcdId, extracodes);
  if (step.kind === "awardRandomItems") return buildEdcdAction(slot, 65, [step.count, resolveItemRef(step.lowItem, context), resolveItemRef(step.highItem, context), 0, 0], nextEdcdId, extracodes);
  if (step.kind === "branchOnItem") {
    const targetKind = step.targetKind ?? "actionPoint";
    const missingBehavior = step.missingBehavior ?? "continue";
    return buildEdcdAction(slot, 21, [
      resolveItemRef(step.item, context),
      branchTargetKindCode(targetKind),
      missingBehavior === "branch" ? 0 : missingBehavior === "message" ? 2 : 1,
      resolveBranchTarget(step.possessedTarget, targetKind, context),
      step.missingTarget === undefined ? 0 : missingBehavior === "message" ? resolveRef(step.missingTarget, context.messages, "message", context) : resolveBranchTarget(step.missingTarget, targetKind, context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "branchOnItemCharges") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 67, [
      resolveItemRef(step.item, context),
      branchTargetKindCode(targetKind),
      step.minimumCharges,
      step.enoughTarget === undefined ? -1 : resolveBranchTarget(step.enoughTarget, targetKind, context),
      step.insufficientTarget === undefined ? -1 : resolveBranchTarget(step.insufficientTarget, targetKind, context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "dropItems") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 1, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "changeItemCharges") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 2, step.amount, 0], nextEdcdId, extracodes);
  if (step.kind === "replaceItems") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 3, 0, resolveItemRef(step.replacementItem, context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnPartyCondition") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 40, [
      step.when === "absent" ? 2 : 1,
      branchTargetKindCode(targetKind) + 1,
      resolveBranchTarget(step.target, targetKind, context),
      partyConditionCode(step.condition),
      0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "branchOnCharacterCondition") return buildEdcdAction(slot, 81, [
    step.condition,
    characterSelectorCode(step.selector ?? "party"),
    0,
    resolveRef(step.successTarget, context.actionPoints, "action point", context),
    resolveRef(step.failureTarget, context.actionPoints, "action point", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "branchOnTileParameter") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 78, [
      tileParameterCode(step.test),
      step.test === "tileId" ? step.tile ?? 0 : 0,
      branchTargetKindCode(targetKind),
      step.falseTarget === undefined ? 0 : resolveNonzeroBranchTarget(step.falseTarget, targetKind, "falseTarget", context),
      step.trueTarget === undefined ? 0 : resolveNonzeroBranchTarget(step.trueTarget, targetKind, "trueTarget", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "copyActionPointSteps") {
    const source = resolveSameMapActionPoint(step.source, scope, context);
    return describeAction(slot, 8, source);
  }
  if (step.kind === "enableActionPoint" || step.kind === "disableActionPoint") {
    const target = resolveActionPointStateTarget(step.target, step.level, scope, context);
    return buildEdcdAction(slot, 13, [target.levelIndex, target.recordIndex, step.kind === "disableActionPoint" ? -1 : step.percent ?? 100, 0, 0], nextEdcdId, extracodes);
  }
  if (step.kind === "patchActionPoint") {
    const target = resolvePatchActionPointTarget(step.target, step.level, step.levelType, context);
    return buildEdcdAction(slot, 7, [
      target.levelIndex,
      target.recordIndex,
      resolveRef(step.source, context.extraActionPoints, "extra action point", context),
      target.levelType === "dungeon" ? 2 : 1,
      0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "setDarkLevel") return buildEdcdAction(slot, 106, [step.dark ? 2 : 1, step.stopIfUnchanged ? 1 : 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterGameTime") return buildEdcdAction(slot, 63, [step.mode === "set" ? 1 : 2, step.mode === "set" ? step.days ?? -1 : step.days ?? 0, step.mode === "set" ? step.hours ?? -1 : step.hours ?? 0, step.mode === "set" ? step.minutes ?? -1 : step.minutes ?? 0, 0], nextEdcdId, extracodes);
  if (step.kind === "branchOnGameTime") return buildEdcdAction(slot, 64, [step.dayAtMost ?? -1, step.hourAtMost ?? -1, 0, resolveRef(step.successMacro, context.extraActionPoints, "extra action point", context), resolveRef(step.failureMacro, context.extraActionPoints, "extra action point", context)], nextEdcdId, extracodes);
  if (step.kind === "boatCampStatus") return buildEdcdAction(slot, 103, [boatStatusCode(step.continueBoat), campingStatusCode(step.continueCamping), step.setBoat === undefined ? 0 : step.setBoat === "inBoat" ? 1 : 2, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterFatigue") return buildEdcdAction(slot, 68, [step.mode === "maximum" ? 1 : step.mode === "minimum" ? 2 : 3, 0, step.percent ?? 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "changeSpellPoints") return buildEdcdAction(slot, 74, [step.take ? -step.rolls : step.rolls, step.sound === undefined ? step.low : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnSpellPoints") return buildEdcdAction(slot, 75, [step.scope === "picked" ? 1 : 2, step.minimum, step.onFailure === "exitSave" ? 1 : 0, 0, resolveRef(step.successMacro, context.extraActionPoints, "extra action point", context)], nextEdcdId, extracodes);
  if (step.kind === "castSpell") return buildEdcdAction(slot, step.scope === "picked" ? 17 : 18, [step.spell, step.power, step.saveModifier ?? 0, step.noSave ? 1 : 0, 0], nextEdcdId, extracodes);
  if (step.kind === "takeVictoryPoints") return buildEdcdAction(slot, 90, [step.amount, step.scope === "picked" ? 1 : step.scope === "spread" ? 2 : 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterPicked") return buildEdcdAction(slot, 108, [ALTER_PICKED_ATTRIBUTE_CODES[step.attribute], step.amount, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "clericTurning") return describeAction(slot, step.enabled ? 83 : 82, 0);
  if (step.kind === "dropAllEquipment") return describeAction(slot, 91, 0);
  if (step.kind === "compass") return describeAction(slot, step.enabled ? 93 : 94, 0);
  if (step.kind === "faceDirection") return describeAction(slot, 95, DIRECTION_CODES[step.direction]);
  if (step.kind === "dungeonView") return describeAction(slot, step.mode === "force3d" ? 96 : 97, 0);
  if (step.kind === "endBattle") return describeAction(slot, 100, 0);
  if (step.kind === "backUpParty") return describeAction(slot, 101, 0);
  if (step.kind === "levelUpPicked") return describeAction(slot, 102, 0);
  if (step.kind === "randomBattles") return describeAction(slot, 104, step.enabled ? 1 : 0);
  if (step.kind === "allies") return describeAction(slot, 105, step.enabled ? 2 : 1);
  if (step.kind === "alterRandomEncounterRectangle") return buildEdcdAction(slot, step.dungeon ? -23 : 23, [step.level, step.rectangle, step.encounterRate, step.battleLow === undefined ? -1 : resolveRef(step.battleLow, context.battles, "battle", context), step.battleHigh === undefined ? -1 : resolveRef(step.battleHigh, context.battles, "battle", context)], nextEdcdId, extracodes);
  if (step.kind === "alterRandomRectangle") {
    const firstId = nextEdcdId();
    pushEdcdRow(firstId, [step.level, step.rectangle, step.dungeon ? 1 : 0, step.encounterPercentDelta ?? 0, randomRectangleShapeCode(step.shape)], extracodes);
    const secondId = nextEdcdId();
    pushEdcdRow(secondId, randomRectangleShapeValues(step.shape), extracodes);
    return describeAction(slot, 92, firstId);
  }
  if (step.kind === "enterExitDungeon") return buildEdcdAction(slot, 37, [step.mode, step.level, step.x, step.y, step.heading], nextEdcdId, extracodes);
  if (step.kind === "edcd") return buildEdcdAction(slot, step.opcode, padArray(step.values, 5, 0), nextEdcdId, extracodes);
  return describeAction(slot, 0, 0);
}

function buildEdcdAction(slot: number, opcode: number, values: number[], nextEdcdId: () => number, extracodes: ExtraCodeRow[]) {
  const id = nextEdcdId();
  pushEdcdRow(id, values, extracodes);
  return describeAction(slot, opcode, id);
}

function pushEdcdRow(id: number, values: number[], extracodes: ExtraCodeRow[]) {
  extracodes.push({ id, values: padArray(values, 5, 0), provenance: authoredProvenance("Data EDCD", id, id * EXTRACODE_BYTES, EXTRACODE_BYTES) });
}

function describeAction(slot: number, rawCode: number, id: number): Action {
  const code = normalizeStepOpcode(rawCode);
  const option = actionOptionFor(rawCode);
  return {
    slot,
    rawCode,
    code,
    id,
    label: option.shortLabel,
    category: option.category,
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23
  };
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return { sourceFile, recordIndex, byteOffset, byteLength, confidence: "inferred" };
}

function canonicalMapLevelName(levelType: LevelType, index: number) {
  return `${levelType === "land" ? "Land" : "Dungeon"} ${index}`;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-scenario";
}

function padArray(values: number[], length: number, fill: number) {
  return [...values.slice(0, length), ...new Array(Math.max(0, length - values.length)).fill(fill)];
}

function padStringArray(values: string[], length: number, fill: string) {
  return [...values.slice(0, length), ...new Array(Math.max(0, length - values.length)).fill(fill)];
}

function padNestedNumberArrays(values: number[][], length: number, rowLength: number, fill: number) {
  const rows = values.slice(0, length).map((row) => padArray(row, rowLength, fill));
  while (rows.length < length) rows.push(new Array(rowLength).fill(fill));
  return rows;
}

function validateMaps(maps: ScenarioSeedMap[] | undefined, ctx: ParseContext) {
  const seen = new Set<string>();
  const keys = new Set<string>();
  for (const [index, map] of (maps ?? []).entries()) {
    const levelType = map.levelType ?? "land";
    const levelIndex = map.index ?? index;
    const key = `${levelType}:${levelIndex}`;
    if (seen.has(key)) ctx.errors.push(`$.maps contains duplicate map ${key}.`);
    seen.add(key);
    if (map.key) {
      if (keys.has(map.key)) ctx.errors.push(`$.maps contains duplicate key ${map.key}.`);
      keys.add(map.key);
    }
  }
}

function validateUniqueIds(values: Array<{ id?: number; key?: string }> | undefined, label: string, ctx: ParseContext) {
  const seen = new Set<number>();
  const keys = new Set<string>();
  for (const value of values ?? []) {
    if (value.id !== undefined) {
      if (seen.has(value.id)) ctx.errors.push(`$.${label} contains duplicate id ${value.id}.`);
      seen.add(value.id);
    }
    if (value.key) {
      if (keys.has(value.key)) ctx.errors.push(`$.${label} contains duplicate key ${value.key}.`);
      keys.add(value.key);
    }
  }
}

function validateItems(items: ScenarioSeedItem[] | undefined, ctx: ParseContext) {
  const itemIds = new Set<number>();
  const rows = new Set<number>();
  for (const item of items ?? []) {
    const row = item.id ?? (item.itemId === undefined ? undefined : item.itemId - SCENARIO_ITEM_ID_BASE);
    const itemId = item.itemId ?? (item.id === undefined ? undefined : SCENARIO_ITEM_ID_BASE + item.id);
    if (row !== undefined) {
      if (rows.has(row)) ctx.errors.push(`$.items contains duplicate scenario item row ${row}.`);
      rows.add(row);
    }
    if (itemId !== undefined) {
      if (itemIds.has(itemId)) ctx.errors.push(`$.items contains duplicate itemId ${itemId}.`);
      itemIds.add(itemId);
    }
  }
}

function validateMaxArrayLength(values: unknown[] | undefined, path: string, length: number, ctx: ParseContext) {
  if (values && values.length > length) ctx.errors.push(`${path} can contain at most ${length} entries.`);
}

function optionalNumberField<T extends string>(value: ObjectValue, key: T, path: string, ctx: ParseContext): Partial<Record<T, number>> {
  const parsed = optionalInteger(value[key], `${path}.${key}`, ctx);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, number>>;
}

function optionalRefField<T extends string>(value: ObjectValue, key: T, path: string, ctx: ParseContext): Partial<Record<T, ScenarioSeedRef>> {
  const parsed = optionalRef(value[key], `${path}.${key}`, ctx);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, ScenarioSeedRef>>;
}

function parseArray<T>(input: unknown, path: string, ctx: ParseContext, parse: (input: unknown, path: string, ctx: ParseContext) => T | null): T[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    ctx.errors.push(`${path} must be an array.`);
    return undefined;
  }
  const values: T[] = [];
  input.forEach((item, index) => {
    const parsed = parse(item, `${path}[${index}]`, ctx);
    if (parsed) values.push(parsed);
  });
  return values;
}

function parseIntegerArray(input: unknown, path: string, ctx: ParseContext): number[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    ctx.errors.push(`${path} must be an array of integers.`);
    return undefined;
  }
  const values: number[] = [];
  input.forEach((item, index) => {
    const parsed = requireInteger(item, `${path}[${index}]`, ctx);
    if (parsed !== null) values.push(parsed);
  });
  return values;
}

function optionalFixedIntegerArray(input: unknown, path: string, length: number, ctx: ParseContext) {
  const values = parseIntegerArray(input, path, ctx);
  if (values && values.length !== length) ctx.errors.push(`${path} must contain exactly ${length} entries.`);
  return values;
}

function optionalFixedIntegerMatrix(input: unknown, path: string, rows: number, columns: number, ctx: ParseContext) {
  const values = parseArray(input, path, ctx, (row, rowPath, rowContext) => optionalFixedIntegerArray(row, rowPath, columns, rowContext) ?? null);
  if (values && values.length !== rows) ctx.errors.push(`${path} must contain exactly ${rows} rows.`);
  return values;
}

function optionalStringProperty<T extends string>(value: ObjectValue, key: T, path: string, ctx: ParseContext): Partial<Record<T, string>> {
  const parsed = optionalString(value[key], `${path}.${key}`, ctx);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, string>>;
}

function parseStringArray(input: unknown, path: string, ctx: ParseContext): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    ctx.errors.push(`${path} must be an array of strings.`);
    return undefined;
  }
  const values: string[] = [];
  input.forEach((item, index) => {
    const parsed = optionalString(item, `${path}[${index}]`, ctx);
    if (parsed !== undefined) values.push(parsed);
  });
  return values;
}

function parseRefArray(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRef[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    ctx.errors.push(`${path} must be an array of integer IDs or key strings.`);
    return undefined;
  }
  const values: ScenarioSeedRef[] = [];
  input.forEach((item, index) => {
    values.push(requireRef(item, `${path}[${index}]`, ctx));
  });
  return values;
}

function requireRef(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRef {
  if (typeof input === "string" && input.trim().length > 0) return input;
  if (Number.isInteger(input)) return input as number;
  ctx.errors.push(`${path} must be an integer ID or non-empty key string.`);
  return 0;
}

function optionalRef(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRef | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string" && input.trim().length > 0) return input;
  if (Number.isInteger(input)) return input as number;
  ctx.errors.push(`${path} must be an integer ID or non-empty key string.`);
  return undefined;
}

function requireObject(input: unknown, path: string, ctx: ParseContext): ObjectValue | null {
  if (isObject(input)) return input;
  ctx.errors.push(`${path} must be an object.`);
  return null;
}

function allowKeys(value: ObjectValue, path: string, keys: string[], ctx: ParseContext) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) ctx.errors.push(`${path}.${key} is not a supported scenario seed field.`);
  }
}

function requireString(input: unknown, path: string, ctx: ParseContext): string | null {
  if (typeof input === "string" && input.trim().length > 0) return input;
  ctx.errors.push(`${path} must be a non-empty string.`);
  return null;
}

function optionalString(input: unknown, path: string, ctx: ParseContext): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") return input;
  ctx.errors.push(`${path} must be a string.`);
  return undefined;
}

function requireInteger(input: unknown, path: string, ctx: ParseContext): number | null {
  if (Number.isInteger(input)) return input as number;
  ctx.errors.push(`${path} must be an integer.`);
  return null;
}

function requireMapTile(input: unknown, path: string, ctx: ParseContext): number | null {
  const tile = requireInteger(input, path, ctx);
  checkIntegerRange(tile, path, MAP_TILE_MIN, MAP_TILE_MAX, ctx);
  return tile;
}

function optionalInteger(input: unknown, path: string, ctx: ParseContext): number | undefined {
  if (input === undefined) return undefined;
  if (Number.isInteger(input)) return input as number;
  ctx.errors.push(`${path} must be an integer.`);
  return undefined;
}

function optionalBoolean(input: unknown, path: string, ctx: ParseContext): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "boolean") return input;
  ctx.errors.push(`${path} must be a boolean.`);
  return undefined;
}

function optionalManagedAssetKind(input: unknown, path: string, ctx: ParseContext): ManagedAssetKind | undefined {
  if (input === undefined) return undefined;
  if (input === "picture" || input === "icon" || input === "special-land-tile" || input === "sound" || input === "text" || input === "other") return input;
  ctx.errors.push(`${path} must be picture, icon, special-land-tile, sound, text, or other.`);
  return undefined;
}

function optionalScenarioItemTypeName(input: unknown, path: string, ctx: ParseContext): ScenarioSeedItemTypeName | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(SCENARIO_ITEM_TYPE_CODES, input)) {
    return input as ScenarioSeedItemTypeName;
  }
  ctx.errors.push(`${path} must be a supported semantic item type name.`);
  return undefined;
}

function optionalMonsterVariantMode(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMonster["variants"] | undefined {
  if (input === undefined) return undefined;
  if (input === "normalOnly" || input === "copyAll" || input === "generated") return input;
  ctx.errors.push(`${path} must be normalOnly, copyAll, or generated.`);
  return undefined;
}

function optionalLevelType(input: unknown, path: string, ctx: ParseContext): LevelType | undefined {
  if (input === undefined) return undefined;
  if (input === "land" || input === "dungeon") return input;
  ctx.errors.push(`${path} must be "land" or "dungeon".`);
  return undefined;
}

function validateActionPointTargetFields(
  target: ScenarioSeedRef,
  level: number | undefined,
  levelType: LevelType | undefined,
  path: string,
  ctx: ParseContext,
  requireLevelType = false
) {
  if (typeof target === "number") {
    checkIntegerRange(target, `${path}.target`, 0, 99, ctx);
    if (level === undefined) ctx.errors.push(`${path}.level is required when target is a numeric Action Point ID.`);
    if (requireLevelType && levelType === undefined) ctx.errors.push(`${path}.levelType is required when target is a numeric Action Point ID.`);
    return;
  }
  if (level !== undefined || levelType !== undefined) ctx.errors.push(`${path}.level and levelType must be omitted when target is a keyed Action Point.`);
}

function optionalBranchTargetKind(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBranchTargetKind | undefined {
  if (input === undefined) return undefined;
  if (input === "actionPoint" || input === "simpleEncounter" || input === "complexEncounter") return input;
  ctx.errors.push(`${path} must be actionPoint, simpleEncounter, or complexEncounter.`);
  return undefined;
}

function optionalItemMissingBehavior(input: unknown, path: string, ctx: ParseContext): "branch" | "continue" | "message" | undefined {
  if (input === undefined) return undefined;
  if (input === "branch" || input === "continue" || input === "message") return input;
  ctx.errors.push(`${path} must be branch, continue, or message.`);
  return undefined;
}

function requireBoolean(input: unknown, path: string, ctx: ParseContext): boolean {
  if (typeof input === "boolean") return input;
  ctx.errors.push(`${path} must be a boolean.`);
  return false;
}

function requireTimeMode(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTimeMode {
  if (input === "set" || input === "offset") return input;
  ctx.errors.push(`${path} must be set or offset.`);
  return "set";
}

function optionalBoatStatus(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBoatStatus | undefined {
  if (input === undefined) return undefined;
  if (input === "inBoat" || input === "notInBoat") return input;
  ctx.errors.push(`${path} must be inBoat or notInBoat.`);
  return undefined;
}

function optionalCampingStatus(input: unknown, path: string, ctx: ParseContext): "camping" | "notCamping" | undefined {
  if (input === undefined) return undefined;
  if (input === "camping" || input === "notCamping") return input;
  ctx.errors.push(`${path} must be camping or notCamping.`);
  return undefined;
}

function requireFatigueMode(input: unknown, path: string, ctx: ParseContext): "maximum" | "minimum" | "percent" {
  if (input === "maximum" || input === "minimum" || input === "percent") return input;
  ctx.errors.push(`${path} must be maximum, minimum, or percent.`);
  return "maximum";
}

function requireSpellPointScope(input: unknown, path: string, ctx: ParseContext): "picked" | "alive" {
  if (input === "picked" || input === "alive") return input;
  ctx.errors.push(`${path} must be picked or alive.`);
  return "picked";
}

function optionalSpellFailure(input: unknown, path: string, ctx: ParseContext): "continue" | "exitSave" | undefined {
  if (input === undefined) return undefined;
  if (input === "continue" || input === "exitSave") return input;
  ctx.errors.push(`${path} must be continue or exitSave.`);
  return undefined;
}

function parseRandomRectangleShape(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRandomRectangleShape {
  const value = requireObject(input, path, ctx);
  if (!value) return { mode: "unchanged" };
  const mode = requireString(value.mode, `${path}.mode`, ctx);
  if (mode === "unchanged") {
    allowKeys(value, path, ["mode"], ctx);
    return { mode };
  }
  if (mode === "absolute") {
    allowKeys(value, path, ["mode", "left", "right", "top", "bottom"], ctx);
    const left = requireInteger(value.left, `${path}.left`, ctx);
    const right = requireInteger(value.right, `${path}.right`, ctx);
    const top = requireInteger(value.top, `${path}.top`, ctx);
    const bottom = requireInteger(value.bottom, `${path}.bottom`, ctx);
    checkIntegerRange(left, `${path}.left`, 0, 89, ctx);
    checkIntegerRange(right, `${path}.right`, 0, 89, ctx);
    checkIntegerRange(top, `${path}.top`, 0, 89, ctx);
    checkIntegerRange(bottom, `${path}.bottom`, 0, 89, ctx);
    if (left !== null && right !== null && left > right) ctx.errors.push(`${path}.left must not exceed ${path}.right.`);
    if (top !== null && bottom !== null && top > bottom) ctx.errors.push(`${path}.top must not exceed ${path}.bottom.`);
    return { mode, left: left ?? 0, right: right ?? 0, top: top ?? 0, bottom: bottom ?? 0 };
  }
  if (mode === "offset") {
    allowKeys(value, path, ["mode", "x", "y"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    checkIntegerRange(x, `${path}.x`, -89, 89, ctx);
    checkIntegerRange(y, `${path}.y`, -89, 89, ctx);
    return { mode, x: x ?? 0, y: y ?? 0 };
  }
  if (mode === "warp") {
    allowKeys(value, path, ["mode", "left", "right", "top", "bottom"], ctx);
    const left = requireInteger(value.left, `${path}.left`, ctx);
    const right = requireInteger(value.right, `${path}.right`, ctx);
    const top = requireInteger(value.top, `${path}.top`, ctx);
    const bottom = requireInteger(value.bottom, `${path}.bottom`, ctx);
    checkIntegerRange(left, `${path}.left`, -89, 89, ctx);
    checkIntegerRange(right, `${path}.right`, -89, 89, ctx);
    checkIntegerRange(top, `${path}.top`, -89, 89, ctx);
    checkIntegerRange(bottom, `${path}.bottom`, -89, 89, ctx);
    return { mode, left: left ?? 0, right: right ?? 0, top: top ?? 0, bottom: bottom ?? 0 };
  }
  ctx.errors.push(`${path}.mode must be unchanged, absolute, offset, or warp.`);
  return { mode: "unchanged" };
}

function boatStatusCode(status: ScenarioSeedBoatStatus | undefined) {
  return status === undefined ? 0 : status === "inBoat" ? 1 : 2;
}

function campingStatusCode(status: "camping" | "notCamping" | undefined) {
  return status === undefined ? 0 : status === "camping" ? 1 : 2;
}

function requirePartyCondition(input: unknown, path: string, ctx: ParseContext): ScenarioSeedPartyCondition {
  if (Number.isInteger(input)) {
    const condition = input as number;
    checkIntegerRange(condition, path, 0, 8, ctx);
    return condition;
  }
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(PARTY_CONDITION_CODES, input)) return input as Exclude<ScenarioSeedPartyCondition, number>;
  ctx.errors.push(`${path} must be a party condition name or integer from 0 through 8.`);
  return 0;
}

function optionalPresenceTest(input: unknown, path: string, ctx: ParseContext): "present" | "absent" | undefined {
  if (input === undefined) return undefined;
  if (input === "present" || input === "absent") return input;
  ctx.errors.push(`${path} must be present or absent.`);
  return undefined;
}

function optionalCharacterSelector(input: unknown, path: string, ctx: ParseContext): ScenarioSeedCharacterSelector | undefined {
  if (input === undefined) return undefined;
  if (input === "party" || input === "picked") return input;
  if (Number.isInteger(input)) {
    const selector = input as number;
    checkIntegerRange(selector, path, 1, 6, ctx);
    return selector;
  }
  ctx.errors.push(`${path} must be party, picked, or a character position from 1 through 6.`);
  return undefined;
}

function requireTileParameter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTileParameter {
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(TILE_PARAMETER_CODES, input)) return input as ScenarioSeedTileParameter;
  ctx.errors.push(`${path} must be shoreline, boatRequired, path, blocksLos, flyFloatRequired, forest, or tileId.`);
  return "path";
}

function checkIntegerRange(value: number | null | undefined, path: string, min: number | null, max: number | null, ctx: ParseContext) {
  if (value === null || value === undefined) return;
  if (min !== null && value < min) ctx.errors.push(`${path} must be greater than or equal to ${min}.`);
  if (max !== null && value > max) ctx.errors.push(`${path} must be less than or equal to ${max}.`);
}

function isObject(input: unknown): input is ObjectValue {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
