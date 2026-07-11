export type LevelType = "land" | "dungeon";
export type EditorTab =
  | "maps"
  | "player-maps"
  | "scripts"
  | "scenario"
  | "encounters"
  | "combat"
  | "economy"
  | "rules"
  | "assets"
  | "text"
  | "records"
  | "linter"
  | "export";
export type ActiveWorkbench = "project" | "library";
export type AssetWorkbenchSection = "project" | "custom" | "realmz" | "divinity" | "records" | "advanced";
export type AssetSearchHint = {
  query: string;
  nonce: number;
  section?: AssetWorkbenchSection;
  kindFilter?: ManagedAssetKind | "all";
  selectedEntityId?: string | null;
};
export type EditorTool = "select" | "paint" | "stamp" | "dungeon-draw" | "trigger" | "random" | "sample" | "pan";
export type MapWorkbenchMode = "canvas" | "land-layout" | "land-tiles" | "random-areas";
export type MapPaintMode = "brush" | "clear" | "smart";
export type MapPaintVariation = "single" | "cycle-group" | "random-group";
export type MapRegionSelection = { left: number; top: number; right: number; bottom: number };
export type SmartBrushPreset = "mountains" | "water" | "forest";
export type SmartBrushMaskCell = { x: number; y: number };
export type SmartBrushRole =
  | "center"
  | "single"
  | "north"
  | "south"
  | "east"
  | "west"
  | "northEast"
  | "northWest"
  | "southEast"
  | "southWest"
  | "lineHorizontal"
  | "lineVertical"
  | "capNorth"
  | "capSouth"
  | "capEast"
  | "capWest"
  | "notchNorthEast"
  | "notchNorthWest"
  | "notchSouthEast"
  | "notchSouthWest";
export type SmartBrushProfileConfidence = "corpus-ranked" | "pixel-ranked" | "curated-fallback" | "unsupported";
export type SmartBrushCandidateEvidence = {
  tiles: number[];
  samples: number;
  confidence: "high" | "medium" | "low" | "fallback";
};
export type SmartBrushProfile = {
  landlook: number;
  presets: Record<SmartBrushPreset, {
    family: number[];
    excluded?: number[];
    detail?: number[];
    center: number[];
    candidates: number[];
    sampleCount?: number;
    confidence?: "high" | "medium" | "low" | "fallback";
    maskCandidates?: Record<string, SmartBrushCandidateEvidence>;
    roleCandidates?: Partial<Record<SmartBrushRole, number[]>>;
    curatedRoles?: Partial<Record<SmartBrushRole, number[]>>;
    curatedWaterRoles?: Partial<Record<SmartBrushRole, number[]>>;
    curatedMasks?: Record<string, number[]>;
    fallbackRoles: Partial<Record<SmartBrushRole, number>>;
  }>;
};
export type SmartBrushPreviewCell = SmartBrushMaskCell & { index: number; from: number; to: number; role: SmartBrushRole; score?: number | null; neighborMask?: number; source?: string; samples?: number | null };
export type SmartBrushPlan = {
  cells: SmartBrushPreviewCell[];
  skipped: SmartBrushMaskCell[];
  changedCount: number;
  skippedCount: number;
  profileConfidence: SmartBrushProfileConfidence;
  reason: string | null;
};
export type PaintTileResolver = (cell: { x: number; y: number; index: number; tile: number }, sequence: number) => number;
export type MapPaintIntent = {
  selectedTile: number;
  selectedTileset: TilesetAsset | null;
  variation: MapPaintVariation;
  activeGroupId: string;
  variationTiles?: number[] | null;
  seed: number;
};
export type RegionPaintPlan = {
  changes: PaintCellChange[];
  effectiveVariation: MapPaintVariation;
  groupTileCount: number;
};
export type MapHudAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type MapPreviewMode = "off" | "los" | "darkness" | "both";
export type MapPreviewFocalPoint = { x: number; y: number };
export type FocusedPanel = "main" | "tool-sidebar" | "outliner" | "inspector" | "canvas" | "docs";
export type ScriptDetailSurface = "docked" | "floating";
export type ScriptInventoryFilter =
  | "current-map"
  | "all"
  | "active"
  | "reusable"
  | "warnings"
  | "macros"
  | "ed3-battle"
  | "ed3-monster"
  | "ed3-unlinked"
  | "ed3-padding"
  | "ed3-runtime"
  | "ed3-orphan"
  | "ed3-needs-trace";
export type SidePanelMode = "auto" | "hidden" | "compact" | "wide";
export type OverlayPreset = "authoring" | "inspection" | "clean" | "diagnostic";
export type MapViewFlag =
  | "showRealTiles"
  | "showDecodedColors"
  | "showRealmzCoordinates"
  | "showTriggers"
  | "showRandomRects"
  | "showMapRecords"
  | "showEncounterOverlays"
  | "showQuestOverlays"
  | "showMapOverlays"
  | "showBattleOverlays"
  | "showTextOverlays"
  | "showUnknownOverlays"
  | "showSecretOverlays"
  | "showCombatClearingOverlays";

export type MapViewOptions = Record<MapViewFlag, boolean>;

export type PaintCellChange = { x: number; y: number; index: number; from: number; to: number };
export type BattleGridCellChange = { index: number; from: number; to: number };
export type ManagedAssetKind = "picture" | "icon" | "special-land-tile" | "sound" | "text" | "other";
export type ManagedAssetExportState = "ready" | "blocked" | "preview-only";
export type ManagedAssetLibraryScope = "scenario" | "custom-library";
export type AssetImportTarget = "scenario-picture" | "custom-landlook-atlas" | "icon" | "special-land-tile" | "sound" | "text" | "raw-resource";
export type ImageFitMode = "fit" | "crop" | "stretch";
export type ImageScaleMode = "smooth" | "crisp";
export type ImageMatte = "transparent" | "white" | "black";
export type PaletteMode = "adaptive-256";
export type DitherMode = "none" | "floyd-steinberg";

export type ManagedAssetConversion = {
  target: AssetImportTarget;
  fitMode: ImageFitMode | null;
  scaleMode: ImageScaleMode | null;
  matte: ImageMatte | null;
  paletteMode: PaletteMode | null;
  ditherMode: DitherMode | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  sourceDurationMs?: number | null;
  sourceSampleRate?: number | null;
  sourceChannels?: number | null;
  finalWidth: number | null;
  finalHeight: number | null;
  warnings: string[];
};
export type ResourcePreviewStatus =
  | "preview-ready"
  | "playable"
  | "text-ready"
  | "metadata-only"
  | "unsupported-variant"
  | "malformed"
  | "missing-fallback";

export type ResourcePreviewDiagnostic = {
  severity: string;
  code: string;
  message: string;
  decoder: string;
  offset?: number;
  opcode?: string;
  variant?: string;
  hint?: string;
};

export type WorkbenchDescriptor = {
  id: ActiveWorkbench;
  label: string;
  description: string;
};

export type DomainDescriptor = {
  id: EditorTab;
  label: string;
  shortLabel: string;
  description: string;
  help: string;
  tools: EditorToolDescriptor[];
};

export type EditorToolDescriptor = {
  id: string;
  label: string;
  description: string;
  iconLabel: string;
  workbench: "project" | "library" | "both";
  entityTypes?: string[];
  defaultInspector?: "semantic" | "resource" | "map" | "validation" | "export";
};

export type PanelDescriptor = {
  id: string;
  title: string;
  region: FocusedPanel;
  collapsible: boolean;
};

export type OutlinerItem = {
  id: string;
  label: string;
  kind: string;
  subtitle?: string;
  count?: number;
  selected?: boolean;
  blocked?: boolean;
};

export type InspectorField = {
  label: string;
  value: string | number | boolean | null;
  tone?: "normal" | "success" | "warning" | "danger";
};

export type InspectorSection = {
  id: string;
  title: string;
  fields: InspectorField[];
  collapsed?: boolean;
};

export type ValidationIssueView = {
  id: string;
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  detail?: string;
  target?: string | null;
};

export type RealmzStepDescriptor = {
  id: string;
  opcode: number;
  label: string;
  category: string;
  summary: string;
  edcdShape?: string;
  editable: boolean;
  targetType?: RealmzTargetRecordKind;
  compatibility?: "realmz-writable" | "preserved-imported-bytes" | "inspect-only" | "dispatcher-noop" | "needs-manual-verification";
};

export type DecodedResourcePreview = {
  status: ResourcePreviewStatus;
  mimeType: string;
  dataUrl: string | null;
  summary: Record<string, string>;
  diagnostics: ResourcePreviewDiagnostic[];
};

export type ManagedAsset = {
  id: string;
  label: string;
  kind: ManagedAssetKind;
  resourceType: string;
  resourceId: number;
  fileName: string;
  originalPath: string;
  previewPath: string;
  resourcePath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  exportState: ManagedAssetExportState;
  libraryScope?: ManagedAssetLibraryScope;
  provenance: string;
  linkedEntity: string | null;
  conversion?: ManagedAssetConversion | null;
};

export type StampPaletteItem = {
  id: string;
  label: string;
  tileValue: number;
  resourceId: number | null;
  source: "project" | "library" | "used-map" | "raw";
  previewPath: string | null;
  compatibility: string;
};

export type TileAttributeConfidence = "source-backed" | "inferred" | "unknown" | "preserved";
export type TileAttributeSourceKind = "mapstats" | "data-solids" | "inferred" | "preserved" | "unknown";
export type TileAttributeFlag =
  | "walkable"
  | "solid"
  | "path"
  | "visual-path"
  | "shore"
  | "boat-required"
  | "fly-float-required"
  | "blocks-los"
  | "forest"
  | "combat-build"
  | "special-icon"
  | "unknown-metadata";

export type TileAttributeProfile = {
  tile: number;
  landlook: number | null;
  solidType: number | null;
  movementSoundId: number | null;
  movementCost: number | null;
  shore?: boolean | null;
  boatRequirement?: number | null;
  pathFlag?: boolean | null;
  blocksLos?: boolean | null;
  flyFloatRequired?: boolean | null;
  forestType?: number | null;
  spare?: number | null;
  combatBuild?: number[][];
  clearLandId?: number | null;
  baseTile?: number | null;
  baseScale?: number | null;
  editableScope?: "built-in-reference" | "scenario-custom" | "special-tile" | "unknown";
  flags: TileAttributeFlag[];
  confidence: TileAttributeConfidence;
  sourceKind?: TileAttributeSourceKind;
  source: string;
  rawByte: number | null;
};

export type MapstatsRecord = {
  tile: number;
  sound: number;
  time: number;
  solid: number;
  shore: number;
  needBoat: number;
  isPath: number;
  los: number;
  flyFloat: number;
  forest: number;
  spare: number;
  combatBuild: number[][];
  clearLandId: number;
};

export type LandlookRangeSlot = {
  slot: number;
  label: string;
  firstTile: number;
  lastTile: number;
  reserved: number;
};

export type LandlookWriterGate = {
  metadataWriterStatus: string;
  atlasWriterStatus: string;
  writableFields: string[];
  preserveOnlyFields: string[];
  evidence: string[];
};

export type CustomLandlookMetadata = {
  landlook: number;
  sourceFile: string;
  records: MapstatsRecord[];
  baseTile: number;
  baseScale: number;
  rangeSlots: LandlookRangeSlot[];
  trailingBytes: number[];
  rawBytes: number[];
  writerGate: LandlookWriterGate;
  authored: boolean;
};

export type CustomLandlookAtlasArtifact = {
  landlook: number;
  pictId: number;
  resourceFile: string | null;
  available: boolean;
  previewable: boolean;
  writerStatus: string;
  role: string;
};

export type CustomLandlookAtlasWriterGate = {
  writerStatus: string;
  requiredWidth: number;
  requiredHeight: number;
  tileWidth: number;
  tileHeight: number;
  resourceType: string;
  supportedRoute: string;
  evidence: string[];
};

export type CustomLandlookUsage = {
  landlook: number;
  pictId: number;
  metadataFile: string;
  mapIds: string[];
  mapCount: number;
};

export type RulesCoverageEntry = {
  fileName: "Data Spell" | "Data Race" | "Data Caste";
  family: "spell" | "race" | "caste";
  bytes: number;
  expectedBytes: number;
  recordBytes: number;
  expectedRecords: number;
  records: number;
  trailingBytes: number;
  status: string;
  writerStatus: string;
};

export type RuleResourceLink = {
  resourceFile: string;
  type: string;
  id: number;
  name: string | null;
  dataLength: number;
  ownership: string;
  writerStatus: string;
  previewStatus: string;
  likelyLinkage: string | null;
};

export type RuleWriterGate = {
  spellRecords: string;
  spellTail: string;
  spellResources: string;
  raceRecords: string;
  casteRecords: string;
  raceCasteNames: string;
};

export type RulePackageTail = {
  start: number;
  endExclusive: number | null;
  status: string;
  field: string;
  reason?: string;
};

export type RuleNameSlotMapping = {
  resourceId: number;
  levelIndex: number;
  slotIndex: number;
  customId: number;
  packedSpellId: number;
  name: string;
  byteLength: number;
};

export type RuleNameWriterGate = {
  family: "spell" | "race" | "caste";
  verdict: string;
  writerStatus: string;
  evidence: string[];
};

export type RuleNameResourceAudit = {
  resourceFile: string;
  type: "STR#";
  id: number;
  name: string | null;
  byteLength: number;
  stringCount: number;
  slots: RuleNameSlotMapping[];
  writerStatus: string;
};

export type TilePaletteCategory =
  | "all"
  | "landlook"
  | "special"
  | "super"
  | "custom"
  | "used"
  | "attributes"
  | "raw";

export type TileRenderResolution = {
  raw: number;
  terrainTile: number;
  iconCandidates: number[];
  iconId: number | null;
  iconAvailable: boolean;
  fallbackReason: string | null;
  confidence: TileAttributeConfidence;
};

export type EditorDisplayName = {
  label: string;
  source: "user" | "generated";
  updatedAt: string;
};

export type EditorMetadata = {
  displayNames: Record<string, EditorDisplayName>;
  tilePalettes: TilePalette[];
  mapStamps: CustomMapStamp[];
  questThreads: QuestThread[];
  questContextSources: QuestContextSource[];
};

export type TilePalette = {
  id: string;
  name: string;
  tiles: number[];
  createdAt: string;
  updatedAt: string;
};

export type CustomMapStampCell = {
  x: number;
  y: number;
  tile: number;
};

export type CustomMapStamp = {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: CustomMapStampCell[];
  createdAt: string;
  updatedAt: string;
};

export type QuestThread = {
  id: string;
  name: string;
  description: string;
  questIds: number[];
  contextRefs?: QuestContextRef[];
  createdAt: string;
  updatedAt: string;
  source?: "user" | "bundled";
};

export type QuestContextSourceType = "bundled-hint-guide" | "bundled-scenario-context" | "web-guide" | "manual";

export type QuestContextSection = {
  id: string;
  title: string;
  snippet: string;
  terms: string[];
};

export type QuestContextSource = {
  id: string;
  title: string;
  sourceType: QuestContextSourceType;
  scenarioSlug?: string;
  sourceUrl?: string;
  sourcePath?: string;
  fetchedAt?: string;
  contentHash: string;
  sections: QuestContextSection[];
};

export type QuestContextRef = {
  sourceId: string;
  sectionId?: string;
  label: string;
  snippet?: string;
  terms?: string[];
};

export type RealmzActionSlotDraft = {
  triggerId: string;
  slot: number;
  rawCode: number;
  code: number;
  id: number;
  label: string;
  gosub: boolean;
};

export type RealmzStepKind =
  | "empty"
  | "message"
  | "sound"
  | "picture"
  | "battle"
  | "simpleEncounter"
  | "complexEncounter"
  | "shop"
  | "treasure"
  | "teleport"
  | "branch"
  | "setQuestFlag"
  | "returnGosub"
  | "raw";

export type RealmzScriptDraft = {
  triggerId: string;
  label: string;
  kind: "action-point" | "macro";
  percent: number;
  landid: number;
  targetX: number;
  targetY: number;
  coordinate: { x: number; y: number } | null;
  slots: RealmzActionSlotDraft[];
};

export type ScenarioShell = {
  sourceFile: string;
  recLevel: number;
  maxLevel: number;
  landLevel: number;
  lookX: number;
  lookY: number;
  creatorUser: string;
  codeseg1: number[];
  codeseg2: number[];
  trailingBytes: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioSupportFile = {
  sourceFile: string;
  divinityStringEditorSlot?: number | null;
  divinityStringSoundId?: number | null;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioContactInfo = {
  scenarioName: string;
  version: string;
  date: string;
  author: string;
  email: string;
  web: string;
  fee: string;
  payInfo: string[];
  titles: string[];
  description: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioRestrictions = {
  description: string;
  maxPartyCharacters: number;
  maxPartyLevel: number;
  bannedRaces: number[];
  bannedCastes: number[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type GlobalMacroHook = {
  slot: number;
  label: string;
  door: number;
  sourceBacked: boolean;
  runtimeConsumer: string;
};

export type ScenarioGlobalMacroHooks = {
  slots: GlobalMacroHook[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioMeta = {
  id?: string;
  name: string;
  projectPath: string;
  importedAt: string;
  shell?: ScenarioShell | null;
  supportFile?: ScenarioSupportFile | null;
  contactInfo?: ScenarioContactInfo | null;
  restrictions?: ScenarioRestrictions | null;
  globalMacroHooks?: ScenarioGlobalMacroHooks | null;
  securityBackup?: ScenarioShell | null;
};

export type ScenarioStartupFields = Partial<ScenarioMeta>;
export type RealmzTargetRecordKind = "message" | "battle" | "monster" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter" | "questLabel";

export type MessageRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type OptionLabelRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type BattleRecord = {
  id: number;
  grid: number[];
  dist: number;
  messageBefore: number;
  messageAfter: number;
  battleMacro: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type MonsterRecord = {
  id: number;
  hitDice: number;
  staminaBonus: number;
  agility: number;
  nameId: number;
  movementMax: number;
  armor: number;
  magicResistance: number;
  distance: number;
  traitor: number;
  size: number;
  typeFlags: number[];
  attackCount: number;
  magicAttackCount: number;
  attacks: number[][];
  damageBonus: number;
  castPercent: number;
  runPercent: number;
  surrenderPercent: number;
  missilePercent: number;
  canSummon: number;
  saves: number[];
  spellImmunities: number[];
  money: number[];
  spells: number[];
  items: number[];
  weapon: number;
  iconId: number;
  spellPoints: number;
  exp: number;
  stamina: number;
  staminaMax: number;
  underneath: number[];
  target: number;
  guarding: number;
  notOnMenu: boolean;
  beenAttacked: number;
  movement: number;
  magicToHit: number;
  conditions: number[];
  lr: number;
  up: number;
  attackNum: number;
  bonusAttack: number;
  deathMacro: number;
  maxSpellPoints: number;
  displayName: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type MonsterSetId = 0 | 1 | -1;

export type MonsterSet = {
  sourceFile: string;
  setId: MonsterSetId;
  monsters: MonsterRecord[];
};

export type TreasureRecord = {
  id: number;
  itemIds: number[];
  exp: number;
  gold: number;
  gems: number;
  jewelry: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ShopRecord = {
  id: number;
  itemIds: number[];
  quantities: number[];
  inflation: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type MonsterDescriptionRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioItemRecord = {
  id: number;
  itemId: number;
  iconId: number;
  type: number;
  st: number;
  blunt: number;
  hands: number;
  lu: number;
  movement: number;
  ac: number;
  magicResistance: number;
  damage: number;
  spellPoints: number;
  sound: number;
  weight: number;
  cost: number;
  charge: number;
  cursedItemId: number;
  magical: number;
  itemCat0: number;
  itemCat1: number;
  raceRestrictions: number;
  casteRestrictions: number;
  specificRace: number;
  specificCaste: number;
  raceClassOnly: number;
  casteClassOnly: number;
  spare2?: number[];
  vSmall: number;
  vLarge: number;
  heat: number;
  cold: number;
  electric: number;
  vsUndead: number;
  vsDemonDevil: number;
  vsEvil: number;
  special1: number;
  special2: number;
  special3: number;
  special4: number;
  special5: number;
  weightPerCharge: number;
  dropOnEmpty: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type EncounterActionRow = {
  slot: number;
  rawCode: number;
  id: number;
};

export type SimpleEncounterRecord = {
  id: number;
  actions: EncounterActionRow[];
  choiceResults: number[];
  canBackOut: boolean;
  maxTimes: number;
  casteSuccess: number;
  prompt: number;
  texts: string[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ComplexEncounterRecord = {
  id: number;
  actions: EncounterActionRow[];
  actionResult: number;
  wordResult: number;
  groups: number[];
  spellIds: number[];
  spellResults: number[];
  itemIds: number[];
  itemResults: number[];
  choiceResults: number[];
  wordResults: number[];
  canBackOut: boolean;
  thief: boolean;
  maxTimes: number;
  casteSuccess: number;
  thiefSuccess: number;
  thiefFail: number;
  prompt: number;
  texts: string[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type TimedEncounterLocationKind = "any" | "land" | "dungeon";

export type TimedEncounterRecord = {
  id: number;
  day: number;
  increment: number;
  percent: number;
  door: number;
  requiredLevel: number;
  requiredRandomRect: number;
  requiredX: number;
  requiredY: number;
  requiredItem: number;
  requiredQuest: number;
  locationKind: TimedEncounterLocationKind;
  stuff: number[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ThiefEncounterRecord = {
  id: number;
  typeFlags: boolean[];
  modifiers: number[];
  successCodes: number[];
  failureCodes: number[];
  successText: number[];
  failureText: number[];
  successSounds: number[];
  failureSounds: number[];
  spell: number;
  lowDamage: number;
  highDamage: number;
  tumblers: number;
  prompts: number[];
  promptSounds: number[];
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type QuestLabel = {
  id: number;
  label: string;
  note?: string;
};

export type ScenarioSpellOverride = {
  id: number;
  range1: number;
  range2: number;
  queueIcon: number;
  toHitBonus: number;
  saveBonus: number;
  fixedTargetNum: number;
  canRotate: number;
  saveAdjust: number;
  cannot: number;
  resistAdjust: number;
  cost: number;
  damage1: number;
  damage2: number;
  powerDamage1: number;
  powerDamage2: number;
  duration1: number;
  duration2: number;
  powerDuration1: number;
  powerDuration2: number;
  spellLook1: number;
  spellLook2: number;
  sound1: number;
  sound2: number;
  targetType: number;
  size: number;
  special: number;
  damageType: number;
  spellClass: number;
  inCombat: boolean;
  inCamp: boolean;
  displayName?: string;
  description?: string;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioRaceOverride = {
  id: number;
  displayName?: string;
  plusMinusToHit: number[];
  specialAbility: number[];
  drvBonus: number[];
  attBonus: number[];
  minMax: number[];
  conditions: number[];
  maxAge: number;
  doesNotDie: number;
  baseMove: number;
  magRes: number;
  twoHand: number;
  missile: number;
  numOfAttacks: number[];
  canCaste: number[];
  ageRange: number[][];
  ageChange: number[][];
  canRegenerate: number;
  defaultIconSet: number;
  itemTypes: number[];
  descriptors: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioCasteOverride = {
  id: number;
  displayName?: string;
  specialAbility: number[][];
  drvBonus: number[];
  attBonus: number[];
  spellcasters: number[][];
  minMax: number[];
  conditions: number[];
  canUseMissile: number;
  getsMissileBonus: number;
  stamina: number[];
  strength: number[];
  dodge: number[];
  toHit: number[];
  missile: number[];
  hand2Hand: number[];
  casteClass: number;
  minimumAgeGroup: number;
  moveBonus: number;
  magRes: number;
  twoHand: number;
  maxStaminaBonus: number;
  bonusAttacks: number;
  maxAttacks: number;
  victory: number[];
  startMoney: number;
  startItems: number[];
  attacks: number[];
  itemTypes: number[];
  defaultIcon: number;
  maxSpellsAttacks: number;
  spellsSoFar: number;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type RuleNames = {
  sourceFile: string;
  raceNames: string[];
  casteNames: string[];
  authored: boolean;
  provenance?: Provenance;
};

export type MapMarker = {
  iconId: number;
  x: number;
  y: number;
};

export type MapRecord = {
  id: number;
  markers?: MapMarker[];
  startX: number;
  startY: number;
  level: number;
  pictId: number;
  iconSize: number;
  show: number;
  isDungeon: boolean;
  rect: { top: number; left: number; bottom: number; right: number };
  note: string;
  name?: string;
  primaryName?: string;
  secondaryName?: string;
  nameSource?: string;
  mapNameAuthored?: boolean;
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ItemTextRecord = {
  id: number;
  itemId: number;
  unidentifiedName: string;
  identifiedName: string;
  description: string;
  authored?: boolean;
  provenance?: Provenance;
};

export type DungeonCellFlag =
  | "wall"
  | "horizontalDoor"
  | "verticalDoor"
  | "stairs"
  | "column"
  | "unmapped"
  | "allowMoveNorth"
  | "allowMoveEast"
  | "allowMoveSouth"
  | "allowMoveWest"
  | "archway"
  | "noWallInBattle";

export type DungeonCellFlagState = "on" | "off" | "mixed";

export type LandCellSecretState = "normal" | "hidden" | "revealed";

export type ProjectCommand =
  | { kind: "paintTiles"; mapId: string; label: string; cells: PaintCellChange[] }
  | {
      kind: "updateDungeonCellFlags";
      mapId: string;
      label: string;
      flags: Partial<Record<DungeonCellFlag, boolean>>;
      cells: Array<{ x: number; y: number; index: number; from: number }>;
    }
  | { kind: "paintBattleGridCells"; battleId: number; label: string; cells: BattleGridCellChange[] }
  | { kind: "createMap"; label: string; levelType: LevelType }
  | { kind: "duplicateMap"; label: string; mapId: string }
  | { kind: "createMapRecord"; label: string; id?: number; template?: Partial<MapRecord> }
  | { kind: "createMacro"; label: string; displayName?: string }
  | { kind: "createStartupTestMacro"; label: string; complexEncounterId?: number }
  | { kind: "deleteMacro"; label: string; triggerId: string }
  | { kind: "deleteTrigger"; label: string; triggerId: string }
  | { kind: "duplicateTrigger"; label: string; triggerId: string; displayName?: string }
  | {
      kind: "createActionPoint";
      label: string;
      levelType: LevelType;
      levelIndex: number;
      x: number;
      y: number;
      displayName?: string;
    }
  | {
      kind: "moveActionPoint";
      label: string;
      triggerId: string;
      levelType: LevelType;
      levelIndex: number;
      x: number;
      y: number;
    }
  | {
      kind: "setLandCellSecretState";
      label: string;
      mapId: string;
      x: number;
      y: number;
      state: LandCellSecretState;
    }
  | {
      kind: "updateTriggerHeader";
      label: string;
      triggerId: string;
      fields: Partial<Pick<TriggerRecord, "doorid" | "coordinate" | "percent" | "landid" | "targetX" | "targetY" | "active">>;
    }
  | {
      kind: "updateRandomLevelSettings";
      label: string;
      levelType: LevelType;
      levelIndex: number;
      fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>;
    }
  | {
      kind: "updateMapRecord";
      label: string;
      id: number;
      changes: Partial<Pick<MapRecord, "markers" | "startX" | "startY" | "level" | "pictId" | "iconSize" | "show" | "isDungeon" | "rect" | "note">>;
    }
  | {
      kind: "updateMapRecordNames";
      label: string;
      id: number;
      changes: Partial<Pick<MapRecord, "name" | "primaryName" | "secondaryName">>;
    }
  | { kind: "createLandLayout"; label: string }
  | { kind: "updateLandLayoutCell"; label: string; row: number; col: number; value: number }
  | { kind: "clearLandLayout"; label: string }
  | { kind: "createTilePalette"; label: string; name: string; id?: string; tiles?: number[] }
  | { kind: "renameTilePalette"; label: string; paletteId: string; name: string }
  | { kind: "deleteTilePalette"; label: string; paletteId: string }
  | { kind: "updateTilePaletteTiles"; label: string; paletteId: string; tiles: number[] }
  | { kind: "addTileToPalette"; label: string; paletteId: string; tile: number }
  | { kind: "removeTileFromPalette"; label: string; paletteId: string; tile: number }
  | { kind: "createMapStamp"; label: string; id?: string; name: string; width: number; height: number; cells?: CustomMapStampCell[] }
  | { kind: "renameMapStamp"; label: string; stampId: string; name: string }
  | { kind: "deleteMapStamp"; label: string; stampId: string }
  | { kind: "duplicateMapStamp"; label: string; stampId: string; id?: string; name?: string }
  | { kind: "updateMapStamp"; label: string; stampId: string; changes: Partial<Pick<CustomMapStamp, "name" | "width" | "height" | "cells">> }
  | {
      kind: "updateCustomLandTileAttributes";
      label: string;
      landlook: number;
      tile: number;
      changes: Partial<Pick<MapstatsRecord, "sound" | "time" | "solid" | "shore" | "needBoat" | "isPath" | "los" | "flyFloat" | "forest" | "clearLandId">>;
    }
  | { kind: "updateSpecialTileSolidity"; label: string; tile: number; solid: boolean }
  | { kind: "createCustomLandlookFromSource"; label: string; sourceLandlook: number; targetLandlook: number; assignMapId?: string | null }
  | { kind: "updateCustomLandTileCombatBuild"; label: string; landlook: number; tile: number; row: number; col: number; value: number }
  | { kind: "updateCustomLandlookBase"; label: string; landlook: number; baseTile?: number; baseScale?: number }
  | { kind: "updateCustomLandlookRangeSlot"; label: string; landlook: number; slot: number; firstTile?: number; lastTile?: number }
  | { kind: "replaceCustomLandlookAtlas"; label: string; landlook: number; asset: ManagedAsset }
  | {
      kind: "createRandomRect";
      label: string;
      levelType: LevelType;
      levelIndex: number;
      rect: Omit<RandomRect, "rectIndex"> & { rectIndex?: number };
    }
  | {
      kind: "updateRandomRect";
      label: string;
      levelType: LevelType;
      levelIndex: number;
      rectIndex: number;
      fields: Partial<Omit<RandomRect, "rectIndex">>;
    }
  | {
      kind: "clearRandomRect";
      label: string;
      levelType: LevelType;
      levelIndex: number;
      rectIndex: number;
    }
  | {
      kind: "updateActionSlot";
      label: string;
      triggerId: string;
      slot: number;
      rawCode: number;
      id: number;
    }
  | {
      kind: "swapActionSlots";
      label: string;
      triggerId: string;
      fromSlot: number;
      toSlot: number;
    }
  | {
      kind: "duplicateActionSlot";
      label: string;
      triggerId: string;
      fromSlot: number;
      toSlot: number;
    }
  | {
      kind: "deleteActionSlot";
      label: string;
      triggerId: string;
      slot: number;
    }
  | {
      kind: "updateEdcdRow";
      label: string;
      rowId: number;
      values: number[];
    }
  | {
      kind: "deleteEdcdRow";
      label: string;
      rowId: number;
    }
  | { kind: "createTargetRecord"; label: string; recordType: RealmzTargetRecordKind; id?: number }
  | { kind: "deleteTargetRecord"; label: string; recordType: RealmzTargetRecordKind; id: number }
  | { kind: "duplicateMessageRecord"; label: string; fromId: number; toId?: number }
  | { kind: "updateMessageRecord"; label: string; id: number; changes: Partial<Pick<MessageRecord, "text">> }
  | { kind: "updateStringSound"; label: string; messageId: number; soundId: number }
  | { kind: "bulkUpdateMessageRecords"; label: string; updates: Array<{ id: number; text: string }> }
  | { kind: "createOptionLabel"; label: string; id?: number }
  | { kind: "clearOptionLabel"; label: string; id: number }
  | { kind: "duplicateOptionLabel"; label: string; fromId: number; toId?: number }
  | { kind: "updateOptionLabel"; label: string; id: number; changes: Partial<Pick<OptionLabelRecord, "text">> }
  | { kind: "updateBattleRecord"; label: string; id: number; changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">> }
  | { kind: "createMonsterFromTemplate"; label: string; id: number; template: MonsterRecord; description?: string; setId?: MonsterSetId }
  | { kind: "createMonstersFromTemplates"; label: string; entries: Array<{ id: number; template: MonsterRecord; description?: string; setId?: MonsterSetId }> }
  | { kind: "updateMonsterRecord"; label: string; id: number; changes: Partial<MonsterRecord>; setId?: MonsterSetId }
  | { kind: "clearMonsterRecord"; label: string; id: number; setId: MonsterSetId }
  | { kind: "createMonsterVariantFromNormal"; label: string; id: number; setId: Exclude<MonsterSetId, 0> }
  | { kind: "copyCurrentMonsterToAllSets"; label: string; id: number; sourceSetId: MonsterSetId }
  | { kind: "switchMonsterRecords"; label: string; setId: MonsterSetId; fromId: number; toId: number }
  | { kind: "generateMonsterVariants"; label: string; id: number }
  | { kind: "generateMonsterVariantsForAll"; label: string; ids: number[] }
  | { kind: "rewriteBattleMonsterReferences"; label: string; rewrite: { mode: "clear"; monsterId: number } | { mode: "replace"; fromId: number; toId: number } | { mode: "swap"; fromId: number; toId: number } }
  | { kind: "upsertMonsterIconOverride"; label: string; override: MonsterIconOverride }
  | { kind: "deleteMonsterIconOverride"; label: string; targetBaseIconId: number }
  | { kind: "upsertScenarioIconResource"; label: string; resource: ScenarioIconResource }
  | { kind: "deleteScenarioIconResource"; label: string; resourceId: number }
  | { kind: "upsertMonsterDescription"; label: string; id: number; text: string }
  | { kind: "updateScenarioItemRecord"; label: string; id: number; changes: Partial<ScenarioItemRecord> }
  | { kind: "clearScenarioItemRecord"; label: string; id: number }
  | { kind: "updateItemTextRecord"; label: string; itemId: number; changes: Partial<Pick<ItemTextRecord, "unidentifiedName" | "identifiedName" | "description">> }
  | { kind: "updateTreasureRecord"; label: string; id: number; changes: Partial<Pick<TreasureRecord, "itemIds" | "exp" | "gold" | "gems" | "jewelry">> }
  | { kind: "updateShopRecord"; label: string; id: number; changes: Partial<Pick<ShopRecord, "itemIds" | "quantities" | "inflation">> }
  | { kind: "updateSimpleEncounterRecord"; label: string; id: number; changes: Partial<Pick<SimpleEncounterRecord, "actions" | "choiceResults" | "canBackOut" | "maxTimes" | "casteSuccess" | "prompt" | "texts">> }
  | { kind: "updateComplexEncounterRecord"; label: string; id: number; changes: Partial<Pick<ComplexEncounterRecord, "actions" | "actionResult" | "wordResult" | "groups" | "spellIds" | "spellResults" | "itemIds" | "itemResults" | "choiceResults" | "wordResults" | "canBackOut" | "thief" | "maxTimes" | "casteSuccess" | "thiefSuccess" | "thiefFail" | "prompt" | "texts">> }
  | { kind: "updateThiefEncounterRecord"; label: string; id: number; changes: Partial<Pick<ThiefEncounterRecord, "typeFlags" | "modifiers" | "successCodes" | "failureCodes" | "successText" | "failureText" | "successSounds" | "failureSounds" | "spell" | "lowDamage" | "highDamage" | "tumblers" | "prompts" | "promptSounds">> }
  | { kind: "updateTimedEncounterRecord"; label: string; id: number; changes: Partial<Pick<TimedEncounterRecord, "day" | "increment" | "percent" | "door" | "requiredLevel" | "requiredRandomRect" | "requiredX" | "requiredY" | "requiredItem" | "requiredQuest" | "locationKind" | "stuff">> }
  | { kind: "upsertQuestLabel"; label: string; quest: QuestLabel }
  | { kind: "deleteQuestLabel"; label: string; id: number }
  | { kind: "createQuestThread"; label: string; id?: string; name: string; description?: string; questIds?: number[]; contextRefs?: QuestContextRef[] }
  | { kind: "updateQuestThread"; label: string; threadId: string; changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">> }
  | { kind: "deleteQuestThread"; label: string; threadId: string }
  | { kind: "addQuestContextSource"; label: string; source: QuestContextSource }
  | { kind: "deleteQuestContextSource"; label: string; sourceId: string }
  | { kind: "applyRealmzScriptStep"; label: string; triggerId: string; slot: number; opcode: number; id: number; edcdValues?: number[]; secondaryEdcdValues?: number[] }
  | { kind: "updateScenarioShell"; label: string; changes: Partial<ScenarioShell> }
  | { kind: "updateScenarioSecurityCodes"; label: string; shellChanges: Partial<ScenarioShell>; backupChanges?: Partial<ScenarioShell> }
  | { kind: "updateScenarioContactInfo"; label: string; changes: Partial<ScenarioContactInfo> }
  | { kind: "updateScenarioRestrictions"; label: string; changes: Partial<ScenarioRestrictions> }
  | { kind: "updateGlobalMacroHook"; label: string; slot: number; door: number }
  | { kind: "createSpellOverride"; label: string; id?: number; template?: Partial<ScenarioSpellOverride> }
  | { kind: "updateSpellOverride"; label: string; id: number; changes: Partial<ScenarioSpellOverride> }
  | { kind: "updateCustomSpellName"; label: string; id: number; displayName: string }
  | { kind: "clearSpellOverride"; label: string; id: number }
  | { kind: "createRaceOverride"; label: string; id?: number; template?: Partial<ScenarioRaceOverride> }
  | { kind: "updateRaceOverride"; label: string; id: number; changes: Partial<ScenarioRaceOverride> }
  | { kind: "updateRaceName"; label: string; id: number; displayName: string }
  | { kind: "clearRaceOverride"; label: string; id: number }
  | { kind: "createCasteOverride"; label: string; id?: number; template?: Partial<ScenarioCasteOverride> }
  | { kind: "updateCasteOverride"; label: string; id: number; changes: Partial<ScenarioCasteOverride> }
  | { kind: "updateCasteName"; label: string; id: number; displayName: string }
  | { kind: "clearCasteOverride"; label: string; id: number }
  | {
      kind: "renameEditorEntity";
      label: string;
      entityId: string;
      displayName: string;
    }
  | { kind: "attachProjectAsset"; label: string; asset: ManagedAsset }
  | { kind: "replaceProjectAsset"; label: string; assetId: string; asset: ManagedAsset }
  | { kind: "updateProjectAsset"; label: string; assetId: string; changes: Partial<Pick<ManagedAsset, "label" | "resourceId" | "linkedEntity" | "libraryScope">> }
  | { kind: "deleteProjectAsset"; label: string; assetId: string }
  | {
      kind: "updateScenarioStartup";
      label: string;
      fields: ScenarioStartupFields;
    };

export type SelectedEntity = {
  type:
    | "map"
    | "trigger"
    | "macro"
    | "record"
    | "resource"
    | "message"
    | "encounter"
    | "battle"
    | "monster"
    | "shop"
    | "questFlag";
  id: string;
};

export type MapHitTarget =
  | { kind: "trigger"; cell: { x: number; y: number; tile: number }; trigger: TriggerRecord; entity: SelectedEntity }
  | { kind: "mapRecord"; cell: { x: number; y: number; tile: number }; record: SemanticEntity; entity: SelectedEntity }
  | { kind: "randomRect"; cell: { x: number; y: number; tile: number }; rect: RandomRect; entity: SelectedEntity }
  | { kind: "cell"; cell: { x: number; y: number; tile: number } };

export type MapFocusTarget =
  | { kind: "cell"; mapId: string; x: number; y: number; nonce: number }
  | { kind: "entity"; mapId: string; entity: SelectedEntity; nonce: number }
  | { kind: "rect"; mapId: string; x: number; y: number; nonce: number };

export type MapCoordinateTarget = {
  levelType: LevelType;
  levelIndex: number;
  x: number;
  y: number;
};

export type Project = {
  schemaVersion: number;
  appVersion: string;
  scenario: ScenarioMeta;
  source: { sourcePath: string; rawSourcesDir?: string; immutable: boolean; files: SourceFile[] };
  maps: MapEntity[];
  landLayout?: LandLayout | null;
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  mapRecords: MapRecord[];
  tileAttributes: TileAttributeProfile[];
  customLandlooks?: CustomLandlookMetadata[];
  extracodes: ExtraCodeRow[];
  messages: MessageRecord[];
  optionLabels: OptionLabelRecord[];
  battles: BattleRecord[];
  monsters: MonsterRecord[];
  monsterSets: MonsterSet[];
  monsterDescriptions: MonsterDescriptionRecord[];
  monsterIconOverrides: MonsterIconOverride[];
  scenarioIconResources: ScenarioIconResource[];
  scenarioItems: ScenarioItemRecord[];
  itemTexts: ItemTextRecord[];
  treasures: TreasureRecord[];
  shops: ShopRecord[];
  simpleEncounters: SimpleEncounterRecord[];
  complexEncounters: ComplexEncounterRecord[];
  thiefEncounters: ThiefEncounterRecord[];
  timedEncounters: TimedEncounterRecord[];
  questLabels: QuestLabel[];
  spellOverrides: ScenarioSpellOverride[];
  raceOverrides: ScenarioRaceOverride[];
  casteOverrides: ScenarioCasteOverride[];
  ruleNames: RuleNames;
  assets: ManagedAsset[];
  assetCatalog: { tilesets: TilesetAsset[]; pictures?: ResourceAsset[]; icons?: ResourceAsset[]; sounds?: ResourceAsset[] };
  editorMetadata: EditorMetadata;
  records: { counts: Record<string, number>; alignments: Alignment[] };
  diagnostics: Diagnostic[];
  semanticSchema: SemanticSchema;
  validation: ValidationReport;
};

export type MonsterIconOverride = {
  targetBaseIconId: number;
  sourceBaseIconId: number;
  sourceLabel?: string;
  sourceKind: "monster-mash" | "scenario-resource" | "providence-library";
  sourceBaseResourceBase64: string;
  sourcePairedResourceBase64: string;
  imported?: boolean;
};

export type ScenarioIconResource = {
  resourceId: number;
  label: string;
  sourceKind: "vault-of-arcana" | "providence-library" | "scenario-resource";
  resourceBase64: string;
  previewPath?: string | null;
  imported?: boolean;
};

export type SemanticEditState = "editable" | "inspect-only" | "blocked";
export type SemanticSourceOrigin =
  | "authored-source"
  | "resource-fork"
  | "shared-reference"
  | "runtime-cache"
  | "browser-fallback"
  | "library-catalog"
  | "divinity-import"
  | "realmz-reference";

export type ProvidenceWorkspace = {
  schemaVersion: number;
  appVersion: string;
  workspacePath: string;
  managedLibraryPath: string;
  referenceRoots: {
    divinity: string;
    realmzData: string;
    newScenario: string;
  };
  recentProjects: string[];
  activeLibraryCatalog: LibraryCatalog | null;
  customAssets: ManagedAsset[];
  diagnostics: LibraryDiagnostic[];
};

export type LibraryCatalog = {
  schemaVersion: number;
  importedAt: string;
  managedPath: string;
  sources: LibrarySource[];
  records: LibraryRecord[];
  entities: LibraryEntity[];
  assets: LibraryAsset[];
  diagnostics: LibraryDiagnostic[];
  summary: {
    sourceCount: number;
    recordCount: number;
    entityCount: number;
    assetCount: number;
    diagnosticCount: number;
  };
};

export type LibrarySource = {
  id: string;
  name: string;
  relativePath: string;
  originalPath: string;
  sourceKind: "divinity-import" | "realmz-reference" | "providence-library";
  role: string;
  bytes: number;
  sha256: string;
  copiedTo: string;
  confidence: string;
};

export type LibraryRecord = {
  id: string;
  source: string;
  type: string;
  label: string;
  editState: SemanticEditState;
  byteRange: ByteRange | null;
  confidence: string;
  summary: Record<string, unknown>;
};

export type LibraryEntity = {
  id: string;
  type: string;
  label: string;
  source: string;
  recordRef: string | null;
  editState: SemanticEditState;
  confidence: string;
  summary: Record<string, unknown>;
};

export type LibraryAsset = {
  id: string;
  type: string;
  label: string;
  source: string;
  relativePath: string;
  bytes: number;
  sha256: string;
  resourceType?: string | null;
  resourceId?: number | null;
  previewPath?: string | null;
  mimeType?: string | null;
};

export type LibraryDiagnostic = {
  id: string;
  type: string;
  severity: string;
  message: string;
  source: string | null;
  data: Record<string, unknown>;
};

export type SourceFile = {
  name: string;
  relativePath: string;
  bytes: number;
  sha256: string;
  role: string;
  editable: boolean;
};

export type MapEntity = {
  id: string;
  levelType: LevelType;
  source: string;
  index: number;
  name: string;
  width: number;
  height: number;
  tiles: number[];
  render: { tilesetId: string; landlook: number | null; mode: string };
  provenance?: Provenance;
};

export type LandLayout = {
  rows: number;
  cols: number;
  cells: number[];
  trailingBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type TriggerRecord = {
  id: string;
  source: string;
  levelType: LevelType | null;
  levelIndex: number | null;
  recordIndex: number;
  active: boolean;
  doorid: number;
  percent: number;
  coordinate: { x: number; y: number } | null;
  actions: Action[];
  landid?: number;
  targetX?: number;
  targetY?: number;
  provenance?: Provenance;
};

export type Action = {
  slot: number;
  rawCode: number;
  code: number;
  id: number;
  label: string;
  category: string;
  gosub?: boolean;
};

export type RandomRect = {
  rectIndex: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
  percent: number;
  battleRange: number[];
  randomDoors: number[];
  randomDoorPercent: number[];
  only: boolean;
  option: number;
  sound: number;
  text: number;
};

export type RandomLevel = {
  id: string;
  source?: string;
  levelType: LevelType;
  levelIndex: number;
  landlook: number;
  isDark: boolean;
  useLos: boolean;
  rects: RandomRect[];
  rawValues?: number[];
  provenance?: Provenance;
};

export type ExtraCodeRow = { id: number; values: number[]; provenance?: Provenance };

export type TilesetAsset = {
  id: string;
  landlook: number;
  name: string;
  source: string;
  available: boolean;
  imagePath: string | null;
  pictId: number | null;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  custom: boolean;
  baseTile?: number | null;
};

export type ResourceAsset = {
  id: string;
  resourceType: string;
  resourceId: number;
  name?: string | null;
  source: string;
  previewPath?: string | null;
};

export type AtlasEntry = { image: HTMLImageElement; url: string; asset: TilesetAsset };
export type IconEntry = { image: HTMLImageElement; url: string; id: number };
export type Provenance = {
  sourceFile: string;
  recordIndex: number;
  byteOffset: number;
  byteLength: number;
  confidence: string;
};

export type Alignment = { source: string; recordBytes: number; count: number; trailingBytes: number; status: string };
export type Diagnostic = { severity: string; code: string; message: string; source: string | null };

export type ValidationReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  exportableFiles: string[];
  passThroughFiles: string[];
  targetCompatibilityIssues: TargetCompatibilityIssue[];
  targetCompatibility: TargetCompatibilityBuckets;
};

export type ExportReport = {
  outputPath: string;
  target: ScenarioTarget;
  writtenFiles: string[];
  passThroughFiles: string[];
  writtenResources: string[];
  preservedResources: number;
  resourceWarnings: string[];
  blockedAssets: string[];
  warnings: string[];
  targetCompatibilityIssues: TargetCompatibilityIssue[];
  targetCompatibility: TargetCompatibilityBuckets;
};

export type ScenarioTarget = "mac-classic-folder" | "windows-realmz-folder" | "providence-portable-folder";
export type TargetCompatibilityIssue = {
  target: ScenarioTarget;
  severity: string;
  code: string;
  message: string;
  source: string | null;
};
export type TargetCompatibilityBuckets = {
  blockers: TargetCompatibilityIssue[];
  warnings: TargetCompatibilityIssue[];
  notes: TargetCompatibilityIssue[];
};

export type BenchmarkReport = {
  projectName: string;
  maps: number;
  triggers: number;
  extracodes: number;
  randomLevels: number;
  validationMs: number;
  estimatedCanvasTiles: number;
  ok: boolean;
};

export type SemanticMappingProgress = {
  active: boolean;
  source: "browser" | "desktop";
  phase: string;
  label: string;
  detail: string;
  completed: number;
  total: number;
  startedAt: number;
  updatedAt: number;
  indeterminate?: boolean;
};

export type SemanticSchema = {
  schemaVersion: number;
  sources: SemanticSource[];
  records: SemanticRecord[];
  entities: SemanticEntity[];
  links: SemanticLink[];
  reverseLinks: Record<string, SemanticReverseLinks>;
  evidence: SemanticEvidence[];
  diagnostics: SemanticDiagnostic[];
  decoding: SemanticDecoding;
  summary: SemanticSummary;
};

export type SemanticDecoding = {
  ed3Reachability: Ed3ReachabilityRow[];
  dispatcherNoops: DispatcherNoopRow[];
  confidenceDebt: ConfidenceDebtRow[];
};

export type Ed3ReachabilityRow = {
  recordIndex: number;
  entityId: string;
  classification: string;
  reachable: boolean;
  pathStatus: string;
  rootType: string | null;
  incomingRefs: number;
  actionCount: number;
  rawSignature: number[];
  evidence: string[];
  promotionRule: string;
};

export type DispatcherNoopRow = {
  source: string;
  levelType: LevelType | null;
  levelIndex: number | null;
  recordIndex: number;
  slot: number;
  rawCode: number;
  id: number;
  message: string;
};

export type ConfidenceDebtRow = {
  group: string;
  confidence: string;
  impact: string;
  claimCount: number;
  nextStep: string;
};

export type SemanticSource = {
  id: string;
  type: string;
  origin: SemanticSourceOrigin;
  name: string;
  path: string | null;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  layout: { kind: string; recordBytes: number } | null;
  confidence: string;
};

export type ByteRange = { start: number; length: number; endExclusive: number };

export type SemanticRecord = {
  id: string;
  source: string;
  type: string;
  label: string;
  editState: SemanticEditState;
  byteRange: ByteRange | null;
  confidence: string;
  summary: Record<string, unknown>;
};

export type SemanticEntity = {
  id: string;
  type: string;
  label: string;
  editState: SemanticEditState;
  confidence: string;
  source: string;
  recordRef: string | null;
  byteRange: ByteRange | null;
  editable: boolean;
  summary: Record<string, unknown>;
};

export type SemanticLink = {
  id: string;
  from: string;
  to: string;
  kind: string;
  confidence: string;
  evidence: string[];
  metadata: Record<string, unknown>;
};

export type SemanticReverseLinks = {
  incoming: string[];
  outgoing: string[];
};

export type SemanticEvidence = {
  id: string;
  confidence: string;
  source: string;
  note: string;
};

export type SemanticDiagnostic = {
  id: string;
  type: string;
  severity: string;
  confidence: string;
  source: string | null;
  message: string;
  data: Record<string, unknown>;
};

export type SemanticSummary = {
  sourceCount: number;
  recordCount: number;
  entityCount: number;
  linkCount: number;
  diagnosticCount: number;
};

export type Issue = {
  severity: string;
  message: string;
  source: string;
  target?: string | null;
  detail?: string;
  provenance?: "authored" | "imported" | "reference" | "runtime" | "export";
};
