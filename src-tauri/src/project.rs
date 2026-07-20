use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub use crate::generated::project_contract::{
    BattleRecord, ComplexEncounterRecord, Confidence, CustomLandlookMetadata, EncounterActionRow,
    GlobalMacroHook, ItemTextRecord, LandLayout, LandlookRangeSlot, LandlookWriterGate, LevelType,
    MapEntity, MapMarker, MapRecord, MapRecordRect, MapRender, MapstatsRecord, MessageRecord,
    MonsterDescriptionRecord, MonsterRecord, MonsterSet, OptionLabelRecord, Provenance,
    RandomLevel, RandomRect, RenderMode, ScenarioCasteOverride, ScenarioContactInfo,
    ScenarioGlobalMacroHooks, ScenarioItemRecord, ScenarioMeta, ScenarioRaceOverride,
    ScenarioRestrictions, ScenarioShell, ScenarioSpellOverride, ScenarioSupportFile, ShopRecord,
    SimpleEncounterRecord, ThiefEncounterRecord, TileAttributeConfidence, TileAttributeFlag,
    TileAttributeProfile, TileAttributeSourceKind, TileEditableScope, TimedEncounterLocationKind,
    TimedEncounterRecord, TreasureRecord,
};
pub use crate::generated::project_contract::{
    ProjectOrigin, SourceFile, SourceFileRole, SourceSnapshot,
};

pub const PROJECT_SCHEMA_VERSION: u32 =
    crate::generated::project_contract::PROVIDENCE_PROJECT_SCHEMA_VERSION;
pub const SEMANTIC_SCHEMA_VERSION: u32 = 5;
pub const MAP_SIZE: usize = 90;
pub const RACE_NAME_LIMIT: usize = 70;
pub const CASTE_NAME_LIMIT: usize = 30;
pub const CUSTOM_NAMES_SOURCE_FILE: &str = "Data Files/Custom Names.rsrc";

pub const REALMZ_RACE_NAMES: [&str; 19] = [
    "Human",
    "Shadow Elf",
    "Elf",
    "Orc",
    "Furfoot",
    "Gnome",
    "Dwarf",
    "Half Elf",
    "Half Orc",
    "Goblin",
    "Hobgoblin",
    "Kobold",
    "Vampire",
    "Lizard Man",
    "Brownie",
    "Pixie",
    "Leprechaun",
    "Demon",
    "Cathoon",
];

pub const REALMZ_CASTE_NAMES: [&str; 20] = [
    "Fighter",
    "Monk",
    "Crusader",
    "Archer",
    "Rogue",
    "Sorcerer",
    "Priest",
    "Enchanter",
    "Evoker",
    "Cardinal",
    "Cabalist",
    "Berzerker",
    "Bard",
    "Fencer",
    "Marksman",
    "Assassin",
    "Dabbler",
    "Battle Mage",
    "Warlock",
    "Minstrel",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceProject {
    pub schema_version: u32,
    pub app_version: String,
    pub scenario: ScenarioMeta,
    pub source: SourceSnapshot,
    pub maps: Vec<MapEntity>,
    #[serde(default)]
    pub land_layout: Option<LandLayout>,
    #[serde(default)]
    pub map_records: Vec<MapRecord>,
    #[serde(default)]
    pub tile_attributes: Vec<TileAttributeProfile>,
    #[serde(default)]
    pub custom_landlooks: Vec<CustomLandlookMetadata>,
    pub triggers: Vec<TriggerRecord>,
    pub random_levels: Vec<RandomLevel>,
    pub extracodes: Vec<ExtraCodeRow>,
    #[serde(default)]
    pub messages: Vec<MessageRecord>,
    #[serde(default)]
    pub option_labels: Vec<OptionLabelRecord>,
    #[serde(default)]
    pub battles: Vec<BattleRecord>,
    #[serde(default)]
    pub monsters: Vec<MonsterRecord>,
    #[serde(default)]
    pub monster_sets: Vec<MonsterSet>,
    #[serde(default)]
    pub monster_descriptions: Vec<MonsterDescriptionRecord>,
    #[serde(default)]
    pub monster_icon_overrides: Vec<MonsterIconOverride>,
    #[serde(default)]
    pub scenario_icon_resources: Vec<ScenarioIconResource>,
    #[serde(default)]
    pub scenario_items: Vec<ScenarioItemRecord>,
    #[serde(default)]
    pub item_texts: Vec<ItemTextRecord>,
    #[serde(default)]
    pub treasures: Vec<TreasureRecord>,
    #[serde(default)]
    pub shops: Vec<ShopRecord>,
    #[serde(default)]
    pub simple_encounters: Vec<SimpleEncounterRecord>,
    #[serde(default)]
    pub complex_encounters: Vec<ComplexEncounterRecord>,
    #[serde(default)]
    pub thief_encounters: Vec<ThiefEncounterRecord>,
    #[serde(default)]
    pub timed_encounters: Vec<TimedEncounterRecord>,
    #[serde(default)]
    pub quest_labels: Vec<QuestLabel>,
    #[serde(default)]
    pub spell_overrides: Vec<ScenarioSpellOverride>,
    #[serde(default)]
    pub race_overrides: Vec<ScenarioRaceOverride>,
    #[serde(default)]
    pub caste_overrides: Vec<ScenarioCasteOverride>,
    #[serde(default = "default_rule_names")]
    pub rule_names: RuleNames,
    #[serde(default)]
    pub assets: Vec<ManagedAsset>,
    pub asset_catalog: AssetCatalog,
    #[serde(default)]
    pub editor_metadata: EditorMetadata,
    pub records: RecordCatalog,
    pub diagnostics: Vec<Diagnostic>,
    #[serde(default, skip_deserializing)]
    pub semantic_schema: SemanticSchema,
    pub validation: ValidationReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterIconOverride {
    pub target_base_icon_id: i32,
    pub source_base_icon_id: i32,
    #[serde(default)]
    pub source_label: Option<String>,
    pub source_kind: MonsterIconOverrideSource,
    pub source_base_resource_base64: String,
    pub source_paired_resource_base64: String,
    #[serde(default)]
    pub imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterIconOverrideSource {
    MonsterMash,
    ScenarioResource,
    ProvidenceLibrary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioIconResource {
    pub resource_id: i32,
    pub label: String,
    pub source_kind: ScenarioIconResourceSource,
    pub resource_base64: String,
    #[serde(default)]
    pub preview_path: Option<String>,
    #[serde(default)]
    pub imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScenarioIconResourceSource {
    VaultOfArcana,
    ProvidenceLibrary,
    ScenarioResource,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EditorMetadata {
    #[serde(default)]
    pub display_names: BTreeMap<String, EditorDisplayName>,
    #[serde(default)]
    pub tile_palettes: Vec<TilePalette>,
    #[serde(default)]
    pub map_stamps: Vec<CustomMapStamp>,
    #[serde(default)]
    pub quest_threads: Vec<QuestThread>,
    #[serde(default)]
    pub quest_context_sources: Vec<QuestContextSource>,
    #[serde(default)]
    pub removed_scenario_resources: Vec<RemovedScenarioResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedScenarioResource {
    pub resource_type: String,
    pub resource_id: i32,
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
pub struct TilePalette {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tiles: Vec<i16>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomMapStampCell {
    pub x: i16,
    pub y: i16,
    pub tile: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomMapStamp {
    pub id: String,
    pub name: String,
    pub width: u16,
    pub height: u16,
    #[serde(default)]
    pub cells: Vec<CustomMapStampCell>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestThread {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub quest_ids: Vec<i16>,
    #[serde(default)]
    pub context_refs: Vec<QuestContextRef>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub source: Option<QuestThreadSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuestThreadSource {
    User,
    Bundled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestContextSource {
    pub id: String,
    pub title: String,
    pub source_type: QuestContextSourceType,
    #[serde(default)]
    pub scenario_slug: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub fetched_at: Option<String>,
    pub content_hash: String,
    #[serde(default)]
    pub sections: Vec<QuestContextSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuestContextSourceType {
    BundledHintGuide,
    BundledScenarioContext,
    WebGuide,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestContextSection {
    pub id: String,
    pub title: String,
    pub snippet: String,
    #[serde(default)]
    pub terms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestContextRef {
    pub source_id: String,
    #[serde(default)]
    pub section_id: Option<String>,
    pub label: String,
    #[serde(default)]
    pub snippet: Option<String>,
    #[serde(default)]
    pub terms: Vec<String>,
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
    #[serde(default)]
    pub library_scope: Option<ManagedAssetLibraryScope>,
    pub provenance: String,
    pub linked_entity: Option<String>,
    #[serde(default)]
    pub conversion: Option<ManagedAssetConversion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedAssetConversion {
    pub target: AssetImportTarget,
    pub fit_mode: Option<ImageFitMode>,
    pub scale_mode: Option<ImageScaleMode>,
    pub matte: Option<ImageMatte>,
    pub palette_mode: Option<PaletteMode>,
    pub dither_mode: Option<DitherMode>,
    #[serde(default)]
    pub source_width: Option<u32>,
    #[serde(default)]
    pub source_height: Option<u32>,
    #[serde(default)]
    pub source_duration_ms: Option<u32>,
    #[serde(default)]
    pub source_sample_rate: Option<u32>,
    #[serde(default)]
    pub source_channels: Option<u16>,
    pub final_width: Option<u32>,
    pub final_height: Option<u32>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum AssetImportTarget {
    ScenarioPicture,
    CustomLandlookAtlas,
    Icon,
    SpecialLandTile,
    Sound,
    Text,
    RawResource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ManagedAssetLibraryScope {
    Scenario,
    CustomLibrary,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ImageFitMode {
    Fit,
    Crop,
    Stretch,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ImageScaleMode {
    Smooth,
    Crisp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ImageMatte {
    Transparent,
    White,
    Black,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum PaletteMode {
    #[serde(rename = "adaptive-256", alias = "adaptive256")]
    Adaptive256,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum DitherMode {
    None,
    FloydSteinberg,
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

impl SourceSnapshot {
    pub fn resolved_origin(&self) -> ProjectOrigin {
        self.origin.unwrap_or_else(|| {
            if self.immutable || !self.files.is_empty() {
                ProjectOrigin::Imported
            } else {
                ProjectOrigin::Authored
            }
        })
    }

    pub fn ensure_origin(&mut self) {
        if self.origin.is_none() {
            self.origin = Some(self.resolved_origin());
        }
    }

    pub fn requires_compatibility_annex(&self) -> bool {
        self.resolved_origin() == ProjectOrigin::Imported
    }
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
    #[serde(default)]
    pub decoding: SemanticDecoding,
    pub summary: SemanticSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDecoding {
    pub ed3_reachability: Vec<Ed3ReachabilityRow>,
    pub dispatcher_noops: Vec<DispatcherNoopRow>,
    pub confidence_debt: Vec<ConfidenceDebtRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ed3ReachabilityRow {
    pub record_index: usize,
    pub entity_id: String,
    pub classification: String,
    pub reachable: bool,
    pub path_status: String,
    pub root_type: Option<String>,
    pub incoming_refs: usize,
    pub action_count: usize,
    pub raw_signature: Vec<i16>,
    pub evidence: Vec<String>,
    pub promotion_rule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatcherNoopRow {
    pub source: String,
    pub level_type: Option<LevelType>,
    pub level_index: Option<usize>,
    pub record_index: usize,
    pub slot: usize,
    pub raw_code: i16,
    pub id: i16,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfidenceDebtRow {
    pub group: String,
    pub confidence: Confidence,
    pub impact: String,
    pub claim_count: usize,
    pub next_step: String,
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
    pub percent: i8,
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
    #[serde(alias = "Branch", alias = "Quest")]
    Branch,
    #[serde(alias = "Combat")]
    Combat,
    #[serde(alias = "Encounter")]
    Encounter,
    #[serde(alias = "Economy", alias = "ItemShop")]
    ItemShop,
    #[serde(alias = "Map")]
    Map,
    #[serde(alias = "Registration", alias = "Scenario")]
    Registration,
    #[serde(
        alias = "Advanced",
        alias = "Characters",
        alias = "Rules",
        alias = "State"
    )]
    State,
    #[serde(alias = "Time")]
    Time,
    #[serde(alias = "Media", alias = "Text", alias = "UiText")]
    UiText,
    #[serde(alias = "Unknown")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCodeRow {
    pub id: usize,
    pub values: [i16; 5],
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestLabel {
    pub id: i16,
    pub label: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleNames {
    #[serde(default = "default_custom_names_source_file")]
    pub source_file: String,
    #[serde(default = "default_race_names")]
    pub race_names: Vec<String>,
    #[serde(default = "default_caste_names")]
    pub caste_names: Vec<String>,
    #[serde(default)]
    pub authored: bool,
    #[serde(default)]
    pub provenance: Option<Provenance>,
}

impl Default for RuleNames {
    fn default() -> Self {
        default_rule_names()
    }
}

pub fn default_rule_names() -> RuleNames {
    RuleNames {
        source_file: default_custom_names_source_file(),
        race_names: default_race_names(),
        caste_names: default_caste_names(),
        authored: false,
        provenance: None,
    }
}

pub fn default_race_names() -> Vec<String> {
    (0..RACE_NAME_LIMIT).map(default_race_name).collect()
}

pub fn default_caste_names() -> Vec<String> {
    (0..CASTE_NAME_LIMIT).map(default_caste_name).collect()
}

pub fn default_race_name(id: usize) -> String {
    REALMZ_RACE_NAMES
        .get(id)
        .copied()
        .map(str::to_string)
        .unwrap_or_else(|| format!("Race {id}"))
}

pub fn default_caste_name(id: usize) -> String {
    REALMZ_CASTE_NAMES
        .get(id)
        .copied()
        .map(str::to_string)
        .unwrap_or_else(|| format!("Caste {id}"))
}

fn default_custom_names_source_file() -> String {
    CUSTOM_NAMES_SOURCE_FILE.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetCatalog {
    #[serde(default)]
    pub tilesets: Vec<TilesetAsset>,
    #[serde(default)]
    pub pictures: Vec<ResourceAsset>,
    #[serde(default)]
    pub icons: Vec<ResourceAsset>,
    #[serde(default)]
    pub sounds: Vec<ResourceAsset>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLandlookAtlasArtifact {
    pub landlook: i8,
    pub pict_id: i16,
    pub resource_file: Option<String>,
    pub available: bool,
    pub previewable: bool,
    pub writer_status: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLandlookAtlasWriterGate {
    pub writer_status: String,
    pub required_width: u32,
    pub required_height: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub resource_type: String,
    pub supported_route: String,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLandlookUsage {
    pub landlook: i8,
    pub pict_id: i16,
    pub metadata_file: String,
    pub map_ids: Vec<String>,
    pub map_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLandlookArtifact {
    pub landlook: i8,
    pub metadata_file: String,
    pub pict_id: Option<i32>,
    pub custom_file: Option<String>,
    pub role: String,
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
    #[serde(default)]
    pub target_compatibility_issues: Vec<TargetCompatibilityIssue>,
    #[serde(default)]
    pub target_compatibility: TargetCompatibilityBuckets,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCompatibilityIssue {
    pub target: ScenarioTarget,
    pub severity: DiagnosticSeverity,
    pub code: String,
    pub message: String,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TargetCompatibilityBuckets {
    pub blockers: Vec<TargetCompatibilityIssue>,
    pub warnings: Vec<TargetCompatibilityIssue>,
    pub notes: Vec<TargetCompatibilityIssue>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ScenarioTarget {
    MacClassicFolder,
    WindowsRealmzFolder,
    ProvidencePortableFolder,
}

impl ProvidenceProject {
    pub fn normalize_project_contract(&mut self) {
        self.source.ensure_origin();
        for record in &mut self.map_records {
            normalize_map_record_markers(record);
        }
        for record in &mut self.scenario_items {
            normalize_scenario_item_spare_words(record);
        }
        for record in &mut self.treasures {
            normalize_treasure_item_ids(record);
        }
        for record in &mut self.shops {
            normalize_shop_slots(record);
        }
        for record in &mut self.monsters {
            normalize_monster(record);
        }
        for set in &mut self.monster_sets {
            for record in &mut set.monsters {
                normalize_monster(record);
            }
        }
        for record in &mut self.race_overrides {
            normalize_race_override(record);
        }
        for record in &mut self.caste_overrides {
            normalize_caste_override(record);
        }
        for record in &mut self.complex_encounters {
            normalize_complex_encounter(record);
        }
        for record in &mut self.thief_encounters {
            normalize_thief_encounter(record);
        }
        for record in &mut self.timed_encounters {
            normalize_timed_encounter(record);
        }
        if self.schema_version < PROJECT_SCHEMA_VERSION {
            self.schema_version = PROJECT_SCHEMA_VERSION;
        }
    }

    pub fn map_by_id_mut(&mut self, id: &str) -> Option<&mut MapEntity> {
        self.maps.iter_mut().find(|map| map.id == id)
    }
}

fn normalize_complex_encounter(record: &mut ComplexEncounterRecord) {
    if record.action_result == 0 {
        if let Some(value) = record.choice_results.first() {
            record.action_result = *value as i8;
        }
    }
    if record.word_result == 0 {
        if let Some(value) = record.word_results.first() {
            record.word_result = *value as i8;
        }
    }
    record.choice_results.clear();
    record.word_results.clear();
    resize_vec(&mut record.groups, 8, 0);
    resize_vec(&mut record.spell_ids, 10, 0);
    resize_vec(&mut record.spell_results, 10, 0);
    resize_vec(&mut record.item_ids, 5, 0);
    resize_vec(&mut record.item_results, 5, 0);
    resize_vec(&mut record.texts, 9, String::new());
}

fn normalize_thief_encounter(record: &mut ThiefEncounterRecord) {
    resize_vec(&mut record.type_flags, 10, false);
    resize_vec(&mut record.modifiers, 8, 0);
    resize_vec(&mut record.success_codes, 8, 0);
    resize_vec(&mut record.failure_codes, 8, 0);
    resize_vec(&mut record.success_text, 8, 0);
    resize_vec(&mut record.failure_text, 8, 0);
    resize_vec(&mut record.success_sounds, 8, 0);
    resize_vec(&mut record.failure_sounds, 8, 0);
    resize_vec(&mut record.prompts, 3, 0);
    resize_vec(&mut record.prompt_sounds, 3, 0);
}

fn normalize_timed_encounter(record: &mut TimedEncounterRecord) {
    if record.reserved_words.is_empty()
        && record.raw_bytes.len() == crate::realmz::TIMED_ENCOUNTER_BYTES
    {
        record.reserved_words = (0..9)
            .map(|slot| crate::realmz::i16_be(&record.raw_bytes, 22 + slot * 2))
            .collect();
    }
    if !record.reserved_words.is_empty() {
        resize_vec(&mut record.reserved_words, 9, 0);
    }
}

fn normalize_monster(record: &mut MonsterRecord) {
    resize_vec(&mut record.type_flags, 8, 0);
    resize_vec(&mut record.attacks, 5, Vec::new());
    for attack in &mut record.attacks {
        resize_vec(attack, 4, 0);
    }
    resize_vec(&mut record.saves, 6, 0);
    resize_vec(&mut record.spell_immunities, 6, 0);
    resize_vec(&mut record.money, 3, 0);
    resize_vec(&mut record.spells, 10, 0);
    resize_vec(&mut record.items, 6, 0);
    resize_vec(&mut record.underneath, 4, 0);
    resize_vec(&mut record.conditions, 40, 0);
}

fn normalize_race_override(record: &mut ScenarioRaceOverride) {
    resize_vec(&mut record.plus_minus_to_hit, 8, 0);
    resize_vec(&mut record.special_ability, 14, 0);
    resize_vec(&mut record.drv_bonus, 8, 0);
    resize_vec(&mut record.att_bonus, 6, 0);
    resize_vec(&mut record.min_max, 12, 0);
    if let Some(spare) = &mut record.spare {
        resize_vec(spare, 8, 0);
    }
    resize_vec(&mut record.conditions, 40, 0);
    resize_vec(&mut record.num_of_attacks, 2, 0);
    resize_vec(&mut record.can_caste, 30, 0);
    resize_vec(&mut record.age_range, 5, Vec::new());
    for row in &mut record.age_range {
        resize_vec(row, 2, 0);
    }
    resize_vec(&mut record.age_change, 5, Vec::new());
    for row in &mut record.age_change {
        resize_vec(row, 15, 0);
    }
    resize_vec(&mut record.item_types, 2, 0);
    if let Some(spacer) = &mut record.spacer {
        resize_vec(spacer, 31, 0);
    }
}

fn normalize_caste_override(record: &mut ScenarioCasteOverride) {
    resize_vec(&mut record.special_ability, 2, Vec::new());
    for row in &mut record.special_ability {
        resize_vec(row, 14, 0);
    }
    resize_vec(&mut record.drv_bonus, 8, 0);
    resize_vec(&mut record.att_bonus, 6, 0);
    resize_vec(&mut record.spellcasters, 4, Vec::new());
    for row in &mut record.spellcasters {
        resize_vec(row, 3, 0);
    }
    resize_vec(&mut record.min_max, 12, 0);
    resize_vec(&mut record.conditions, 40, 0);
    resize_vec(&mut record.stamina, 2, 0);
    resize_vec(&mut record.strength, 2, 0);
    resize_vec(&mut record.dodge, 2, 0);
    resize_vec(&mut record.to_hit, 2, 0);
    resize_vec(&mut record.missile, 2, 0);
    resize_vec(&mut record.hand2_hand, 2, 0);
    if let Some(spare1) = &mut record.spare1 {
        resize_vec(spare1, 2, 0);
    }
    if let Some(spare2) = &mut record.spare2 {
        resize_vec(spare2, 2, 0);
    }
    resize_vec(&mut record.victory, 30, 0);
    resize_vec(&mut record.start_items, 20, 0);
    resize_vec(&mut record.attacks, 10, 0);
    resize_vec(&mut record.item_types, 2, 0);
    if let Some(spacer) = &mut record.spacer {
        resize_vec(spacer, 63, 0);
    }
}

fn resize_vec<T: Clone>(values: &mut Vec<T>, length: usize, default: T) {
    values.truncate(length);
    values.resize(length, default);
}

fn normalize_map_record_markers(record: &mut MapRecord) {
    let existing = record.markers.clone();
    let raw_bytes = record.raw_bytes.clone();
    record.markers = (0..10)
        .map(|slot| {
            existing.get(slot).cloned().unwrap_or_else(|| {
                let offset = slot * 6;
                if raw_bytes.len() >= offset + 6 {
                    MapMarker {
                        icon_id: project_i16(&raw_bytes, offset),
                        x: project_i16(&raw_bytes, offset + 2),
                        y: project_i16(&raw_bytes, offset + 4),
                    }
                } else {
                    MapMarker {
                        icon_id: 0,
                        x: 0,
                        y: 0,
                    }
                }
            })
        })
        .collect();
}

fn project_i16(bytes: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
}

fn normalize_scenario_item_spare_words(record: &mut ScenarioItemRecord) {
    let existing = record.spare2.clone();
    let raw_bytes = record.raw_bytes.clone();
    record.spare2 = (0..7)
        .map(|slot| {
            existing.get(slot).copied().unwrap_or_else(|| {
                let offset = 56 + slot * 2;
                if raw_bytes.len() >= offset + 2 {
                    project_i16(&raw_bytes, offset)
                } else {
                    0
                }
            })
        })
        .collect();
}

fn normalize_treasure_item_ids(record: &mut TreasureRecord) {
    let existing = record.item_ids.clone();
    let raw_bytes = record.raw_bytes.clone();
    record.item_ids = (0..20)
        .map(|slot| {
            existing.get(slot).copied().unwrap_or_else(|| {
                let offset = slot * 2;
                if raw_bytes.len() >= offset + 2 {
                    project_i16(&raw_bytes, offset)
                } else {
                    0
                }
            })
        })
        .collect();
}

fn normalize_shop_slots(record: &mut ShopRecord) {
    let existing_item_ids = record.item_ids.clone();
    let existing_quantities = record.quantities.clone();
    let raw_bytes = record.raw_bytes.clone();
    record.item_ids = (0..1000)
        .map(|slot| {
            existing_item_ids.get(slot).copied().unwrap_or_else(|| {
                let offset = slot * 2;
                if raw_bytes.len() >= offset + 2 {
                    project_i16(&raw_bytes, offset)
                } else {
                    0
                }
            })
        })
        .collect();
    record.quantities = (0..1000)
        .map(|slot| {
            existing_quantities
                .get(slot)
                .copied()
                .or_else(|| raw_bytes.get(2000 + slot).copied())
                .unwrap_or(0)
        })
        .collect();
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_caste_override, normalize_map_record_markers, normalize_monster,
        normalize_race_override, normalize_scenario_item_spare_words, normalize_shop_slots,
        normalize_treasure_item_ids, ActionCategory, Confidence, MapRecord, MapRecordRect,
        PaletteMode, ProjectOrigin, Provenance, SourceSnapshot,
    };

    #[test]
    fn palette_mode_uses_the_canonical_typescript_spelling() {
        let parsed: PaletteMode = serde_json::from_str("\"adaptive-256\"").expect("palette mode");
        assert_eq!(parsed, PaletteMode::Adaptive256);
        assert_eq!(serde_json::to_string(&parsed).unwrap(), "\"adaptive-256\"");
        let legacy: PaletteMode = serde_json::from_str("\"adaptive256\"").expect("legacy alias");
        assert_eq!(legacy, PaletteMode::Adaptive256);
    }

    #[test]
    fn map_record_normalization_backfills_legacy_raw_markers() {
        let mut raw_bytes = vec![0; 340];
        raw_bytes[0..2].copy_from_slice(&400i16.to_be_bytes());
        raw_bytes[2..4].copy_from_slice(&12i16.to_be_bytes());
        raw_bytes[4..6].copy_from_slice(&13i16.to_be_bytes());
        let mut record = MapRecord {
            id: 0,
            markers: Vec::new(),
            start_x: 0,
            start_y: 0,
            level: 0,
            pict_id: 0,
            icon_size: 0,
            show: 0,
            is_dungeon: false,
            rect: MapRecordRect {
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
            },
            note: String::new(),
            name: None,
            primary_name: None,
            secondary_name: None,
            name_source: None,
            map_name_authored: false,
            raw_bytes,
            authored: false,
            provenance: Provenance {
                source_file: "Data MD2".to_string(),
                record_index: 0,
                byte_offset: 0,
                byte_length: 340,
                confidence: Confidence::SourceBacked,
            },
        };

        normalize_map_record_markers(&mut record);

        assert_eq!(record.markers.len(), 10);
        assert_eq!(record.markers[0].icon_id, 400);
        assert_eq!(record.markers[0].x, 12);
        assert_eq!(record.markers[0].y, 13);
        assert!(record.markers[1..]
            .iter()
            .all(|marker| marker.icon_id == 0 && marker.x == 0 && marker.y == 0));
    }

    #[test]
    fn scenario_item_normalization_backfills_legacy_spare_words() {
        let mut raw_bytes = vec![0; crate::realmz::ITEM_BYTES];
        raw_bytes[56..58].copy_from_slice(&(-321i16).to_be_bytes());
        let mut record = crate::realmz::parse_scenario_items(&raw_bytes)
            .into_iter()
            .next()
            .expect("scenario item");
        record.spare2.clear();

        normalize_scenario_item_spare_words(&mut record);

        assert_eq!(record.spare2.len(), 7);
        assert_eq!(record.spare2[0], -321);
        assert!(record.spare2[1..].iter().all(|value| *value == 0));
    }

    #[test]
    fn monster_normalization_backfills_canonical_fixed_arrays() {
        let mut record =
            crate::realmz::parse_monsters(&vec![0; crate::realmz::MONSTER_BYTES]).remove(0);
        record.type_flags = vec![1];
        record.attacks = vec![vec![2, 3]];
        record.saves = vec![4];
        record.spell_immunities.clear();
        record.money = vec![5];
        record.spells = vec![6];
        record.items = vec![7];
        record.underneath = vec![8];
        record.conditions = vec![9];

        normalize_monster(&mut record);

        assert_eq!(record.type_flags, [1, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(record.attacks.len(), 5);
        assert_eq!(record.attacks[0], [2, 3, 0, 0]);
        assert_eq!(record.attacks[4], [0, 0, 0, 0]);
        assert_eq!(record.saves.len(), 6);
        assert_eq!(record.spell_immunities.len(), 6);
        assert_eq!(record.money, [5, 0, 0]);
        assert_eq!(record.spells.len(), 10);
        assert_eq!(record.items.len(), 6);
        assert_eq!(record.underneath.len(), 4);
        assert_eq!(record.conditions.len(), 40);
    }

    #[test]
    fn rule_normalization_backfills_canonical_fixed_arrays() {
        let mut race =
            crate::realmz::parse_race_overrides(&vec![0; crate::realmz::RACE_BYTES]).remove(0);
        race.plus_minus_to_hit = vec![1];
        race.age_range = vec![vec![2]];
        race.age_change = vec![vec![3]];
        race.spacer = Some(vec![4]);
        normalize_race_override(&mut race);
        assert_eq!(race.plus_minus_to_hit, [1, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(race.age_range.len(), 5);
        assert_eq!(race.age_range[0], [2, 0]);
        assert_eq!(race.age_change[0].len(), 15);
        assert_eq!(race.spacer.as_ref().unwrap().len(), 31);

        let mut caste =
            crate::realmz::parse_caste_overrides(&vec![0; crate::realmz::CASTE_BYTES]).remove(0);
        caste.special_ability = vec![vec![5]];
        caste.spellcasters = vec![vec![6]];
        caste.victory = vec![7];
        caste.start_items = vec![8];
        caste.spacer = Some(vec![9]);
        normalize_caste_override(&mut caste);
        assert_eq!(caste.special_ability.len(), 2);
        assert_eq!(caste.special_ability[0].len(), 14);
        assert_eq!(caste.spellcasters.len(), 4);
        assert_eq!(caste.spellcasters[0], [6, 0, 0]);
        assert_eq!(caste.victory.len(), 30);
        assert_eq!(caste.start_items.len(), 20);
        assert_eq!(caste.spacer.as_ref().unwrap().len(), 63);
    }

    #[test]
    fn treasure_normalization_backfills_legacy_item_slots() {
        let mut raw_bytes = vec![0; crate::realmz::TREASURE_BYTES];
        raw_bytes[2..4].copy_from_slice(&(-321i16).to_be_bytes());
        let mut record = crate::realmz::parse_treasures(&raw_bytes)
            .into_iter()
            .next()
            .expect("treasure");
        record.item_ids = vec![901];

        normalize_treasure_item_ids(&mut record);

        assert_eq!(record.item_ids.len(), 20);
        assert_eq!(record.item_ids[0], 901);
        assert_eq!(record.item_ids[1], -321);
        assert!(record.item_ids[2..].iter().all(|value| *value == 0));
    }

    #[test]
    fn shop_normalization_backfills_legacy_inventory_slots() {
        let mut raw_bytes = vec![0; crate::realmz::SHOP_BYTES];
        raw_bytes[2..4].copy_from_slice(&(-321i16).to_be_bytes());
        raw_bytes[2001] = 7;
        let mut record = crate::realmz::parse_shops(&raw_bytes)
            .into_iter()
            .next()
            .expect("shop");
        record.item_ids = vec![901];
        record.quantities = vec![3];

        normalize_shop_slots(&mut record);

        assert_eq!(record.item_ids.len(), 1000);
        assert_eq!(record.quantities.len(), 1000);
        assert_eq!(record.item_ids[..2], [901, -321]);
        assert_eq!(record.quantities[..2], [3, 7]);
        assert!(record.item_ids[2..].iter().all(|value| *value == 0));
        assert!(record.quantities[2..].iter().all(|value| *value == 0));
    }

    #[test]
    fn source_origin_migrates_legacy_snapshot_signals() {
        let authored = SourceSnapshot {
            origin: None,
            source_path: "generated://starter".to_string(),
            raw_sources_dir: String::new(),
            files: Vec::new(),
            immutable: false,
        };
        assert_eq!(authored.resolved_origin(), ProjectOrigin::Authored);
        assert!(!authored.requires_compatibility_annex());

        let mut imported = SourceSnapshot {
            origin: None,
            source_path: "fixture://legacy".to_string(),
            raw_sources_dir: "raw-sources".to_string(),
            files: Vec::new(),
            immutable: true,
        };
        assert_eq!(imported.resolved_origin(), ProjectOrigin::Imported);
        assert!(imported.requires_compatibility_annex());
        imported.ensure_origin();
        assert_eq!(imported.origin, Some(ProjectOrigin::Imported));
    }

    #[test]
    fn action_category_accepts_legacy_browser_package_labels() {
        let cases = [
            ("\"Text\"", ActionCategory::UiText),
            ("\"Combat\"", ActionCategory::Combat),
            ("\"Encounter\"", ActionCategory::Encounter),
            ("\"Economy\"", ActionCategory::ItemShop),
            ("\"Map\"", ActionCategory::Map),
            ("\"Quest\"", ActionCategory::Branch),
        ];

        for (json, expected) in cases {
            let category = serde_json::from_str::<ActionCategory>(json).expect("legacy category");
            assert_eq!(category, expected);
        }
        assert_eq!(
            serde_json::to_string(&ActionCategory::UiText).expect("serialize category"),
            "\"ui_text\""
        );
    }
}
