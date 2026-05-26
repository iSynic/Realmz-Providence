export type LevelType = "land" | "dungeon";
export type EditorTab =
  | "maps"
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
export type EditorTool = "select" | "paint" | "stamp" | "trigger" | "random" | "sample" | "pan";
export type MapPaintMode = "brush" | "rectangle" | "region" | "replace" | "clear";
export type MapRegionSelection = { left: number; top: number; right: number; bottom: number };
export type MapPreviewMode = "off" | "los" | "darkness" | "both";
export type MapPreviewFocalPoint = { x: number; y: number };
export type FocusedPanel = "main" | "tool-sidebar" | "outliner" | "inspector" | "canvas" | "docs";
export type ScriptDetailSurface = "docked" | "floating";
export type ScriptInventoryFilter = "current-map" | "all" | "active" | "reusable" | "warnings" | "macros";
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
  | "showSecretOverlays";

export type MapViewOptions = Record<MapViewFlag, boolean>;

export type PaintCellChange = { x: number; y: number; index: number; from: number; to: number };
export type ManagedAssetKind = "picture" | "icon" | "special-land-tile" | "sound" | "text" | "other";
export type ManagedAssetExportState = "ready" | "blocked" | "preview-only";
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
  provenance: string;
  linkedEntity: string | null;
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
  | "shore"
  | "boat-required"
  | "fly-float-required"
  | "blocks-los"
  | "special-icon"
  | "unknown-metadata";

export type TileAttributeProfile = {
  tile: number;
  landlook: number | null;
  solidType: number | null;
  movementSoundId: number | null;
  movementCost: number | null;
  flags: TileAttributeFlag[];
  confidence: TileAttributeConfidence;
  sourceKind?: TileAttributeSourceKind;
  source: string;
  rawByte: number | null;
};

export type TilePaletteCategory =
  | "landlook"
  | "special"
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
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioRestrictions = {
  description: string;
  maxPartyCharacters: number;
  maxPartyLevel: number;
  bannedRaces: number[];
  bannedCastes: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ScenarioMeta = {
  id?: string;
  name: string;
  projectPath: string;
  importedAt: string;
  shell?: ScenarioShell | null;
  contactInfo?: ScenarioContactInfo | null;
  restrictions?: ScenarioRestrictions | null;
};

export type ScenarioStartupFields = Partial<ScenarioMeta>;
export type RealmzTargetRecordKind = "message" | "battle" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel";

export type MessageRecord = {
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

export type QuestLabel = {
  id: number;
  label: string;
  note?: string;
};

export type MapRecord = {
  id: number;
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
  rawBytes?: number[];
  authored?: boolean;
  provenance?: Provenance;
};

export type ProjectCommand =
  | { kind: "paintTiles"; mapId: string; label: string; cells: PaintCellChange[] }
  | { kind: "createMacro"; label: string; displayName?: string }
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
      changes: Partial<Pick<MapRecord, "startX" | "startY" | "level" | "pictId" | "iconSize" | "show" | "isDungeon" | "rect" | "note">>;
    }
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
  | { kind: "updateMessageRecord"; label: string; id: number; changes: Partial<Pick<MessageRecord, "text">> }
  | { kind: "updateBattleRecord"; label: string; id: number; changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">> }
  | { kind: "updateTreasureRecord"; label: string; id: number; changes: Partial<Pick<TreasureRecord, "itemIds" | "exp" | "gold" | "gems" | "jewelry">> }
  | { kind: "updateShopRecord"; label: string; id: number; changes: Partial<Pick<ShopRecord, "itemIds" | "quantities" | "inflation">> }
  | { kind: "updateSimpleEncounterRecord"; label: string; id: number; changes: Partial<Pick<SimpleEncounterRecord, "actions" | "choiceResults" | "canBackOut" | "maxTimes" | "casteSuccess" | "prompt" | "texts">> }
  | { kind: "updateComplexEncounterRecord"; label: string; id: number; changes: Partial<Pick<ComplexEncounterRecord, "actions" | "choiceResults" | "wordResults" | "canBackOut" | "thief" | "maxTimes" | "casteSuccess" | "thiefSuccess" | "thiefFail" | "prompt" | "texts">> }
  | { kind: "upsertQuestLabel"; label: string; quest: QuestLabel }
  | { kind: "deleteQuestLabel"; label: string; id: number }
  | { kind: "applyRealmzScriptStep"; label: string; triggerId: string; slot: number; opcode: number; id: number; edcdValues?: number[] }
  | { kind: "updateScenarioShell"; label: string; changes: Partial<ScenarioShell> }
  | { kind: "updateScenarioContactInfo"; label: string; changes: Partial<ScenarioContactInfo> }
  | { kind: "updateScenarioRestrictions"; label: string; changes: Partial<ScenarioRestrictions> }
  | {
      kind: "renameEditorEntity";
      label: string;
      entityId: string;
      displayName: string;
    }
  | { kind: "attachProjectAsset"; label: string; asset: ManagedAsset }
  | { kind: "replaceProjectAsset"; label: string; assetId: string; asset: ManagedAsset }
  | { kind: "updateProjectAsset"; label: string; assetId: string; changes: Partial<Pick<ManagedAsset, "label" | "resourceId" | "linkedEntity">> }
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

export type Project = {
  schemaVersion: number;
  appVersion: string;
  scenario: ScenarioMeta;
  source: { sourcePath: string; rawSourcesDir?: string; immutable: boolean; files: SourceFile[] };
  maps: MapEntity[];
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  mapRecords: MapRecord[];
  tileAttributes: TileAttributeProfile[];
  extracodes: ExtraCodeRow[];
  messages: MessageRecord[];
  battles: BattleRecord[];
  treasures: TreasureRecord[];
  shops: ShopRecord[];
  simpleEncounters: SimpleEncounterRecord[];
  complexEncounters: ComplexEncounterRecord[];
  questLabels: QuestLabel[];
  assets: ManagedAsset[];
  assetCatalog: { tilesets: TilesetAsset[]; pictures?: ResourceAsset[]; icons?: ResourceAsset[] };
  editorMetadata: EditorMetadata;
  records: { counts: Record<string, number>; alignments: Alignment[] };
  diagnostics: Diagnostic[];
  semanticSchema: SemanticSchema;
  validation: ValidationReport;
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
};

export type ExportReport = {
  outputPath: string;
  writtenFiles: string[];
  passThroughFiles: string[];
  writtenResources: string[];
  preservedResources: number;
  resourceWarnings: string[];
  blockedAssets: string[];
  warnings: string[];
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

export type Issue = { severity: string; message: string; source: string; target?: string | null };
