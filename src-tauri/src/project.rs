use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub use crate::generated::project_contract::{
    BattleRecord, ComplexEncounterRecord, Confidence, EncounterActionRow, GlobalMacroHook,
    LandLayout, LevelType, MapEntity, MapMarker, MapRecord, MapRecordRect, MapRender,
    MessageRecord, OptionLabelRecord, Provenance, RandomLevel, RandomRect, RenderMode,
    ScenarioContactInfo, ScenarioGlobalMacroHooks, ScenarioItemRecord, ScenarioMeta,
    ScenarioRestrictions, ScenarioShell, ScenarioSupportFile, ShopRecord, SimpleEncounterRecord,
    ThiefEncounterRecord, TimedEncounterLocationKind, TimedEncounterRecord, TreasureRecord,
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
pub struct MonsterRecord {
    pub id: usize,
    pub hit_dice: u8,
    pub stamina_bonus: u8,
    pub agility: u8,
    pub name_id: u8,
    pub movement_max: u8,
    pub armor: i8,
    pub magic_resistance: i8,
    pub distance: i8,
    pub traitor: i8,
    pub size: i8,
    pub type_flags: Vec<i8>,
    pub attack_count: i8,
    pub magic_attack_count: i8,
    pub attacks: Vec<Vec<i8>>,
    pub damage_bonus: i8,
    pub cast_percent: i8,
    pub run_percent: i8,
    pub surrender_percent: i8,
    pub missile_percent: i8,
    pub can_summon: i8,
    pub saves: Vec<i8>,
    pub spell_immunities: Vec<i8>,
    pub money: Vec<i16>,
    pub spells: Vec<i16>,
    pub items: Vec<i16>,
    pub weapon: i16,
    pub icon_id: i16,
    pub spell_points: i16,
    pub exp: i16,
    pub stamina: i16,
    pub stamina_max: i16,
    pub underneath: Vec<i16>,
    pub target: i8,
    pub guarding: i8,
    pub not_on_menu: bool,
    pub been_attacked: i8,
    pub movement: i8,
    pub magic_to_hit: i8,
    pub conditions: Vec<i8>,
    pub lr: i8,
    pub up: i8,
    pub attack_num: i8,
    pub bonus_attack: i8,
    pub death_macro: i16,
    pub max_spell_points: i16,
    pub display_name: String,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    #[serde(default)]
    pub authored: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterSet {
    pub source_file: String,
    pub set_id: i16,
    pub monsters: Vec<MonsterRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDescriptionRecord {
    pub id: usize,
    pub text: String,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    #[serde(default)]
    pub authored: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTextRecord {
    pub id: usize,
    pub item_id: i16,
    pub unidentified_name: String,
    pub identified_name: String,
    pub description: String,
    #[serde(default)]
    pub authored: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Provenance>,
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
pub struct ScenarioSpellOverride {
    pub id: usize,
    pub range1: u8,
    pub range2: u8,
    pub queue_icon: u8,
    pub to_hit_bonus: i8,
    pub save_bonus: i8,
    pub fixed_target_num: u8,
    pub can_rotate: u8,
    pub save_adjust: i8,
    pub cannot: u8,
    pub resist_adjust: i8,
    pub cost: u8,
    pub damage1: u8,
    pub damage2: u8,
    pub power_damage1: u8,
    pub power_damage2: u8,
    pub duration1: u8,
    pub duration2: u8,
    pub power_duration1: u8,
    pub power_duration2: u8,
    pub spell_look1: u8,
    pub spell_look2: u8,
    pub sound1: u8,
    pub sound2: u8,
    pub target_type: u8,
    pub size: u8,
    pub special: u8,
    pub damage_type: u8,
    pub spell_class: u8,
    pub in_combat: bool,
    pub in_camp: bool,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    #[serde(default)]
    pub authored: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioRaceOverride {
    pub id: usize,
    #[serde(default)]
    pub display_name: String,
    pub plus_minus_to_hit: Vec<i16>,
    pub special_ability: Vec<i16>,
    pub drv_bonus: Vec<i16>,
    pub att_bonus: Vec<i16>,
    pub min_max: Vec<i16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spare: Option<Vec<i16>>,
    pub conditions: Vec<i16>,
    pub max_age: i16,
    pub does_not_die: i16,
    pub base_move: i16,
    pub mag_res: i16,
    pub two_hand: i16,
    pub missile: i16,
    pub num_of_attacks: Vec<i16>,
    pub can_caste: Vec<u8>,
    pub age_range: Vec<Vec<i16>>,
    pub age_change: Vec<Vec<i8>>,
    pub can_regenerate: u8,
    pub default_icon_set: i16,
    pub item_types: Vec<i32>,
    pub descriptors: i16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacer: Option<Vec<i16>>,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    #[serde(default)]
    pub authored: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioCasteOverride {
    pub id: usize,
    #[serde(default)]
    pub display_name: String,
    pub special_ability: Vec<Vec<i16>>,
    pub drv_bonus: Vec<i16>,
    pub att_bonus: Vec<i16>,
    pub spellcasters: Vec<Vec<i16>>,
    pub min_max: Vec<i16>,
    pub conditions: Vec<i16>,
    pub can_use_missile: i16,
    pub gets_missile_bonus: i16,
    pub stamina: Vec<i16>,
    pub strength: Vec<i16>,
    pub dodge: Vec<i16>,
    pub to_hit: Vec<i16>,
    pub missile: Vec<i16>,
    pub hand2_hand: Vec<i16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spare1: Option<Vec<i16>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spare2: Option<Vec<i16>>,
    pub caste_class: i16,
    pub minimum_age_group: i16,
    pub move_bonus: i16,
    pub mag_res: i16,
    pub two_hand: i16,
    pub max_stamina_bonus: i16,
    pub bonus_attacks: i16,
    pub max_attacks: i16,
    pub victory: Vec<i32>,
    pub start_money: i16,
    pub start_items: Vec<i16>,
    pub attacks: Vec<u8>,
    pub item_types: Vec<i32>,
    pub default_icon: i16,
    pub max_spells_attacks: i16,
    pub spells_so_far: i16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spacer: Option<Vec<i16>>,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    #[serde(default)]
    pub authored: bool,
    pub provenance: Provenance,
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
#[serde(rename_all = "kebab-case")]
pub enum TileAttributeConfidence {
    SourceBacked,
    Inferred,
    Unknown,
    Preserved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TileAttributeFlag {
    Walkable,
    Solid,
    Path,
    VisualPath,
    Shore,
    BoatRequired,
    FlyFloatRequired,
    BlocksLos,
    Forest,
    CombatBuild,
    SpecialIcon,
    UnknownMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileAttributeProfile {
    pub tile: i16,
    pub landlook: Option<i8>,
    pub solid_type: Option<i16>,
    pub movement_sound_id: Option<i16>,
    pub movement_cost: Option<i16>,
    #[serde(default)]
    pub shore: Option<bool>,
    #[serde(default)]
    pub boat_requirement: Option<i16>,
    #[serde(default)]
    pub path_flag: Option<bool>,
    #[serde(default)]
    pub blocks_los: Option<bool>,
    #[serde(default)]
    pub fly_float_required: Option<bool>,
    #[serde(default)]
    pub forest_type: Option<i16>,
    #[serde(default)]
    pub spare: Option<i16>,
    #[serde(default)]
    pub combat_build: Vec<Vec<i16>>,
    #[serde(default)]
    pub clear_land_id: Option<i16>,
    #[serde(default)]
    pub base_tile: Option<i16>,
    #[serde(default)]
    pub base_scale: Option<i16>,
    #[serde(default = "default_tile_editable_scope")]
    pub editable_scope: String,
    pub flags: Vec<TileAttributeFlag>,
    pub confidence: TileAttributeConfidence,
    #[serde(default = "default_tile_attribute_source_kind")]
    pub source_kind: TileAttributeSourceKind,
    pub source: String,
    pub raw_byte: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLandlookMetadata {
    pub landlook: i8,
    pub source_file: String,
    pub records: Vec<MapstatsRecord>,
    pub base_tile: i16,
    pub base_scale: i16,
    pub range_slots: Vec<LandlookRangeSlot>,
    #[serde(default)]
    pub trailing_bytes: Vec<u8>,
    #[serde(default)]
    pub raw_bytes: Vec<u8>,
    pub writer_gate: LandlookWriterGate,
    #[serde(default)]
    pub authored: bool,
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
pub struct MapstatsRecord {
    pub tile: i16,
    pub sound: i16,
    pub time: i16,
    pub solid: i16,
    pub shore: i16,
    pub need_boat: i16,
    pub is_path: i16,
    pub los: i16,
    pub fly_float: i16,
    pub forest: i16,
    pub spare: i16,
    pub combat_build: Vec<Vec<i16>>,
    pub clear_land_id: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandlookRangeSlot {
    pub slot: usize,
    pub label: String,
    pub first_tile: i16,
    pub last_tile: i16,
    pub reserved: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandlookWriterGate {
    pub metadata_writer_status: String,
    pub atlas_writer_status: String,
    pub writable_fields: Vec<String>,
    pub preserve_only_fields: Vec<String>,
    pub evidence: Vec<String>,
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

fn default_tile_editable_scope() -> String {
    "unknown".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TileAttributeSourceKind {
    Mapstats,
    DataSolids,
    Inferred,
    Preserved,
    Unknown,
}

fn default_tile_attribute_source_kind() -> TileAttributeSourceKind {
    TileAttributeSourceKind::Unknown
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
        normalize_map_record_markers, normalize_scenario_item_spare_words, normalize_shop_slots,
        normalize_treasure_item_ids, ActionCategory, Confidence, MapRecord, MapRecordRect,
        ProjectOrigin, Provenance, SourceSnapshot,
    };

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
