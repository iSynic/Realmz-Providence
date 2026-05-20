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
export type EditorTool = "select" | "paint" | "trigger" | "sample" | "pan";
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

export type ProjectCommand =
  | { kind: "paintTiles"; mapId: string; label: string; cells: PaintCellChange[] }
  | {
      kind: "updateScenarioStartup" | "updateGlobalMacro" | "updateRegistrationSecurity" | "attachLibraryAsset";
      label: string;
      payload: Record<string, unknown>;
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
  scenario: { name: string; projectPath: string; importedAt: string };
  source: { sourcePath: string; rawSourcesDir?: string; immutable: boolean; files: SourceFile[] };
  maps: MapEntity[];
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  extracodes: ExtraCodeRow[];
  assetCatalog: { tilesets: TilesetAsset[] };
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
  summary: SemanticSummary;
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
