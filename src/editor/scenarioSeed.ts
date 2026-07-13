import {
  BattleRecord,
  ItemTextRecord,
  LandCellSecretState,
  LevelType,
  LibraryCatalog,
  ManagedAsset,
  ManagedAssetKind,
  MessageRecord,
  MonsterDescriptionRecord,
  MonsterRecord,
  Project,
  QuestLabel,
  ShopRecord,
  ScenarioItemRecord,
  ScenarioRaceOverride,
  ScenarioCasteOverride,
  ScenarioSpellOverride,
  SmartBrushPreset,
  TreasureRecord
} from "./types";
import { nextResourceId } from "./mediaAssets";
import { createBrowserProject, validateBrowserProject } from "./browser/project";
import type { ScenarioSeedNamedStampName } from "./map/namedLandStamps";
import type { ScenarioSeedNamedTileName } from "./map/namedLandTiles";
import { monsterLibraryEntryDescription, monsterLibraryEntryTemplate } from "./monsterLibrary";
import { copyCurrentMonsterToAllSets, generateMonsterVariants } from "./projectCommands/targetRecordCommands";
import { createCasteOverride, createRaceOverride, createSpellOverride } from "./projectCommands/scenarioRulesCommands";
import {
  allowKeys,
  parseArray,
  requireInteger,
  requireObject,
  requireString,
  type ParseContext
} from "./scenarioSeed/parsePrimitives";
import {
  addScenarioSeedDiagnostic as addDiagnostic,
  createScenarioSeedCompilerContext,
  type ScenarioSeedCompilerContext,
  type ScenarioSeedResolvedAsset
} from "./scenarioSeed/compilerContext";
import { parseAsset } from "./scenarioSeed/assetParser";
import {
  parseActionPoint,
  parseExtraActionPoint
} from "./scenarioSeed/actionPointParser";
import {
  parseComplexEncounter,
  parseSimpleEncounter,
  parseThiefEncounter
} from "./scenarioSeed/encounterParser";
import {
  allocateScenarioSeed,
  resolveRef,
  SCENARIO_ITEM_ID_BASE,
  SCENARIO_ITEM_RECORD_COUNT
} from "./scenarioSeed/allocation";
import {
  addScenarioSeedMapPlacementDiagnostics,
  addScenarioSeedTopologyDiagnostics
} from "./scenarioSeed/diagnostics";
import {
  parseBattle,
  parseItem,
  parseMessage,
  parseMonster,
  parseQuest,
  parseShop,
  parseTreasure
} from "./scenarioSeed/coreRecordParser";
import {
  compileScenarioSeedMaps,
  scenarioSeedOperationRegions
} from "./scenarioSeed/mapCompiler";
import { applyScenarioSeedMapOperation } from "./scenarioSeed/mapOperationCompiler";
import { requireMapTile } from "./scenarioSeed/mapOperationParser";
import { parseMap } from "./scenarioSeed/mapParser";
import { SCENARIO_ITEM_TYPE_CODES } from "./scenarioSeed/recordContracts";
import {
  authoredProvenance,
  padArray,
  padNestedNumberArrays
} from "./scenarioSeed/recordEncoding";
import {
  resolveItemRef,
  resolveMonsterRef,
  resolveSeedAssetRef
} from "./scenarioSeed/referenceResolver";
import {
  compileScenarioSeedScripts,
  syncActionPointMarkers
} from "./scenarioSeed/scriptCompiler";
import { parseCaste, parseRace, parseSpell } from "./scenarioSeed/rulesParser";
import { parseScenario } from "./scenarioSeed/scenarioParser";
import { parseTimedEncounter } from "./scenarioSeed/timedEncounterParser";
import { validateMaxArrayLength, validateScenarioSeed } from "./scenarioSeed/validation";

export const SCENARIO_SEED_SCHEMA_VERSION = 1;

const PROJECT_SCHEMA_VERSION = 4;
const MESSAGE_BYTES = 256;
const BATTLE_BYTES = 346;
const MONSTER_BYTES = 210;
const MONSTER_DESCRIPTION_BYTES = 256;
const TREASURE_BYTES = 48;
const SHOP_BYTES = 3002;
const ITEM_BYTES = 100;

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
  start?: ScenarioSeedStart;
  author?: string;
  version?: string;
  date?: string;
  email?: string;
  web?: string;
  description?: string;
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

type BuildContext = ScenarioSeedCompilerContext;

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

  validateScenarioSeed(seed, ctx);

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
  allocateScenarioSeed(seed, buildContext, { operationRegions: scenarioSeedOperationRegions });
  addScenarioSeedTopologyDiagnostics(seed, buildContext);
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
      ? {
          ...scenarioShell,
          ...(seed.scenario.start
            ? {
                landLevel: seed.scenario.start.landLevel,
                lookX: seed.scenario.start.x,
                lookY: seed.scenario.start.y
              }
            : {}),
          sourceFile: seed.scenario.name,
          authored: true
        }
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
    const mapCompilation = compileScenarioSeedMaps(seed.maps, buildContext, { applyOperation: applyScenarioSeedMapOperation });
    project.maps = mapCompilation.maps;
    addScenarioSeedMapPlacementDiagnostics(seed, project.maps, buildContext);
    project.randomLevels = mapCompilation.randomLevels;
    project.assetCatalog = {
      ...project.assetCatalog,
      tilesets: mapCompilation.tilesets
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
  const scriptCompilation = compileScenarioSeedScripts(seed, buildContext, project.extracodes);
  if (seed.simpleEncounters !== undefined) project.simpleEncounters = scriptCompilation.simpleEncounters;
  if (seed.thiefEncounters !== undefined) project.thiefEncounters = scriptCompilation.thiefEncounters;
  if (seed.complexEncounters !== undefined) project.complexEncounters = scriptCompilation.complexEncounters;
  if (seed.timedEncounters !== undefined) project.timedEncounters = scriptCompilation.timedEncounters;
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

  const generatedMapTriggers = scriptCompilation.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const generatedExtraActionPoints = scriptCompilation.triggers.filter((trigger) => trigger.source === "Data ED3");
  project.triggers = [
    ...(seed.actionPoints === undefined ? baseMapTriggers : generatedMapTriggers),
    ...(seed.extraActionPoints === undefined ? baseExtraActionPoints : generatedExtraActionPoints)
  ];
  project.maps = syncActionPointMarkers(project.maps, project.triggers);
  project.extracodes = scriptCompilation.extracodes;
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

function createBuildContext(baseTemplate = "blank", libraryCatalog: LibraryCatalog | null = null): BuildContext {
  return createScenarioSeedCompilerContext(baseTemplate, libraryCatalog);
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

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-scenario";
}
