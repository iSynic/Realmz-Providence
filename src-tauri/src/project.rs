use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const PROJECT_SCHEMA_VERSION: u32 = 4;
pub const SEMANTIC_SCHEMA_VERSION: u32 = 3;
pub const MAP_SIZE: usize = 90;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceProject {
    pub schema_version: u32,
    pub app_version: String,
    pub scenario: ScenarioMeta,
    pub source: SourceSnapshot,
    pub maps: Vec<MapEntity>,
    pub triggers: Vec<TriggerRecord>,
    pub random_levels: Vec<RandomLevel>,
    pub extracodes: Vec<ExtraCodeRow>,
    #[serde(default)]
    pub assets: Vec<ManagedAsset>,
    pub asset_catalog: AssetCatalog,
    #[serde(default)]
    pub editor_metadata: EditorMetadata,
    pub records: RecordCatalog,
    pub diagnostics: Vec<Diagnostic>,
    #[serde(default)]
    pub semantic_schema: SemanticSchema,
    pub validation: ValidationReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioMeta {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub imported_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EditorMetadata {
    pub display_names: BTreeMap<String, EditorDisplayName>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDisplayName {
    pub label: String,
    pub source: EditorNameSource,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EditorNameSource {
    User,
    Generated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedAsset {
    pub id: String,
    pub label: String,
    pub kind: ManagedAssetKind,
    pub resource_type: String,
    pub resource_id: i16,
    pub file_name: String,
    pub original_path: String,
    pub preview_path: String,
    pub resource_path: String,
    pub mime_type: String,
    pub bytes: u64,
    pub sha256: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub export_state: ManagedAssetExportState,
    pub provenance: String,
    pub linked_entity: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ManagedAssetKind {
    Picture,
    Icon,
    SpecialLandTile,
    Sound,
    Text,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ManagedAssetExportState {
    Ready,
    Blocked,
    PreviewOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSnapshot {
    pub source_path: String,
    pub raw_sources_dir: String,
    pub files: Vec<SourceFile>,
    pub immutable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFile {
    pub name: String,
    pub relative_path: String,
    pub bytes: u64,
    pub sha256: String,
    pub role: SourceFileRole,
    pub editable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSchema {
    pub schema_version: u32,
    pub sources: Vec<SemanticSource>,
    pub records: Vec<SemanticRecord>,
    pub entities: Vec<SemanticEntity>,
    pub links: Vec<SemanticLink>,
    pub reverse_links: BTreeMap<String, SemanticReverseLinks>,
    pub evidence: Vec<SemanticEvidence>,
    pub diagnostics: Vec<SemanticDiagnostic>,
    pub summary: SemanticSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSource {
    pub id: String,
    #[serde(rename = "type")]
    pub source_type: String,
    #[serde(default)]
    pub origin: SemanticSourceOrigin,
    pub name: String,
    pub path: Option<String>,
    pub exists: bool,
    pub bytes: u64,
    pub sha256: Option<String>,
    pub layout: Option<SemanticLayout>,
    pub confidence: Confidence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticLayout {
    pub kind: String,
    pub record_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticRecord {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub label: String,
    #[serde(default)]
    pub edit_state: SemanticEditState,
    pub byte_range: Option<ByteRange>,
    pub confidence: Confidence,
    pub summary: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEntity {
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: String,
    pub label: String,
    #[serde(default)]
    pub edit_state: SemanticEditState,
    pub confidence: Confidence,
    pub source: String,
    pub record_ref: Option<String>,
    pub byte_range: Option<ByteRange>,
    pub editable: bool,
    pub summary: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SemanticEditState {
    Editable,
    #[default]
    InspectOnly,
    Blocked,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SemanticSourceOrigin {
    #[default]
    AuthoredSource,
    ResourceFork,
    SharedReference,
    RuntimeCache,
    BrowserFallback,
    LibraryCatalog,
    DivinityImport,
    RealmzReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticLink {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: String,
    pub confidence: Confidence,
    pub evidence: Vec<String>,
    pub metadata: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SemanticReverseLinks {
    pub incoming: Vec<String>,
    pub outgoing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEvidence {
    pub id: String,
    pub confidence: Confidence,
    pub source: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDiagnostic {
    pub id: String,
    #[serde(rename = "type")]
    pub diagnostic_type: String,
    pub severity: DiagnosticSeverity,
    pub confidence: Confidence,
    pub source: Option<String>,
    pub message: String,
    pub data: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSummary {
    pub source_count: usize,
    pub record_count: usize,
    pub entity_count: usize,
    pub link_count: usize,
    pub diagnostic_count: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByteRange {
    pub start: usize,
    pub length: usize,
    pub end_exclusive: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceFileRole {
    SupportedBinary,
    PassThrough,
    ResourceFork,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntity {
    pub id: String,
    pub level_type: LevelType,
    pub source: String,
    pub index: usize,
    pub name: String,
    pub width: usize,
    pub height: usize,
    pub tiles: Vec<i16>,
    pub render: MapRender,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum LevelType {
    Land,
    Dungeon,
}

impl LevelType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Land => "land",
            Self::Dungeon => "dungeon",
        }
    }

    pub fn field_file(self) -> &'static str {
        match self {
            Self::Land => "Data LD",
            Self::Dungeon => "Data DL",
        }
    }

    pub fn door_file(self) -> &'static str {
        match self {
            Self::Land => "Data DD",
            Self::Dungeon => "Data DDD",
        }
    }

    pub fn random_file(self) -> &'static str {
        match self {
            Self::Land => "Data RD",
            Self::Dungeon => "Data RDD",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRender {
    pub tileset_id: String,
    pub landlook: Option<i8>,
    pub mode: RenderMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RenderMode {
    OutdoorLandlook,
    DungeonTopDown,
    AbstractFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source_file: String,
    pub record_index: usize,
    pub byte_offset: usize,
    pub byte_length: usize,
    pub confidence: Confidence,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Confidence {
    Confirmed,
    SourceBacked,
    FixtureBacked,
    Inferred,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerRecord {
    pub id: String,
    pub source: String,
    pub level_type: Option<LevelType>,
    pub level_index: Option<usize>,
    pub record_index: usize,
    pub active: bool,
    pub doorid: i32,
    pub landid: u8,
    pub target_x: u8,
    pub target_y: u8,
    pub percent: u8,
    pub coordinate: Option<MapCoordinate>,
    pub actions: Vec<Action>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapCoordinate {
    pub x: usize,
    pub y: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub slot: usize,
    pub raw_code: i16,
    pub code: i16,
    pub id: i16,
    pub label: String,
    pub category: ActionCategory,
    pub gosub: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ActionCategory {
    Branch,
    Combat,
    Encounter,
    ItemShop,
    Map,
    Registration,
    State,
    Time,
    UiText,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomLevel {
    pub id: String,
    pub source: String,
    pub level_type: LevelType,
    pub level_index: usize,
    pub landlook: i8,
    pub is_dark: bool,
    pub use_los: bool,
    pub rects: Vec<RandomRect>,
    pub raw_values: Vec<i16>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RandomRect {
    pub rect_index: usize,
    pub top: i16,
    pub left: i16,
    pub bottom: i16,
    pub right: i16,
    pub percent: i16,
    pub battle_range: [i16; 2],
    pub random_doors: [i16; 3],
    pub random_door_percent: [i16; 3],
    pub only: bool,
    pub option: i8,
    pub sound: i16,
    pub text: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCodeRow {
    pub id: usize,
    pub values: [i16; 5],
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetCatalog {
    pub tilesets: Vec<TilesetAsset>,
    pub pictures: Vec<ResourceAsset>,
    pub icons: Vec<ResourceAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TilesetAsset {
    pub id: String,
    pub landlook: i8,
    pub name: String,
    pub source: String,
    pub available: bool,
    pub image_path: Option<String>,
    pub pict_id: Option<i32>,
    pub tile_width: u32,
    pub tile_height: u32,
    pub columns: u32,
    pub rows: u32,
    pub custom: bool,
    #[serde(default)]
    pub base_tile: Option<i16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceAsset {
    pub id: String,
    pub resource_type: String,
    pub resource_id: i32,
    pub name: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecordCatalog {
    pub counts: BTreeMap<String, usize>,
    pub alignments: Vec<RecordAlignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordAlignment {
    pub source: String,
    pub record_bytes: usize,
    pub count: usize,
    pub trailing_bytes: usize,
    pub status: AlignmentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AlignmentStatus {
    Missing,
    Aligned,
    HasTrailingBytes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub code: String,
    pub message: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub ok: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub exportable_files: Vec<String>,
    pub pass_through_files: Vec<String>,
}

impl ProvidenceProject {
    pub fn map_by_id_mut(&mut self, id: &str) -> Option<&mut MapEntity> {
        self.maps.iter_mut().find(|map| map.id == id)
    }
}
