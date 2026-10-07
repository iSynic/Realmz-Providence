//! Portable project composition and shared identities. Domain modules own their
//! records and ordering; the serialized snapshot remains one stable contract.

use serde::{Deserialize, Serialize};

mod action_scripts;
mod application;
mod classic_rule_selection;
mod combat;
mod economy;
mod encounters;
mod media;
mod rules;
mod scenario;
mod spells;
mod terrain;
mod world;
use action_scripts::normalize_editor_metadata;
pub use action_scripts::*;
pub use application::*;
pub use classic_rule_selection::*;
pub use combat::{BattleRecord, MonsterDescription, MonsterRecord, MonsterSet};
pub use economy::{ShopRecord, TreasureRecord};
pub use encounters::{
    ComplexEncounter, RogueEncounter, SimpleEncounter, TimedEncounter, TimedEncounterLocationKind,
};
pub use media::{AssetDescriptor, ClassicResourceKey};
pub use rules::*;
pub use scenario::*;
pub use spells::{SourcedSpellDefinition, SpellDefinition};
pub use terrain::*;
pub use world::{
    LandLayout, LevelType, MapCoordinate, MapLevel, MapRuntimeMetadata, PlayerMapMarker,
    PlayerMapNameCatalog, PlayerMapRecord, PlayerMapRect, RandomRectangle,
    SpecialLandSolidityCatalog, StartLocation, WorldModel,
};

pub const SNAPSHOT_FORMAT_VERSION: u32 = 38;
pub const CLASSIC_MAP_SIZE: usize = 90;
pub const CLASSIC_QUEST_FLAG_MIN: u8 = 1;
pub const CLASSIC_QUEST_FLAG_MAX: u8 = 126;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StableId(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct NativeRecordId(pub u32);

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct BlobId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicSourceBlob {
    pub native_path: String,
    pub blob: BlobId,
    pub byte_length: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ProjectOrigin {
    Authored,
    Imported { compatibility_annex: BlobId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioMessage {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub text: String,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionLabelRecord {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub text: String,
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestLabel {
    pub id: u8,
    pub label: String,
    #[serde(default)]
    pub note: String,
}

impl QuestLabel {
    pub fn identity(&self) -> StableId {
        StableId(format!("quest:{}", self.id))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageReference {
    pub source: StableId,
    pub field: String,
    pub target_native_id: NativeRecordId,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCodeRow {
    pub native_id: NativeRecordId,
    pub values: [i16; 5],
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub format_version: u32,
    pub project_id: StableId,
    pub origin: ProjectOrigin,
    #[serde(default)]
    pub classic_sources: Vec<ClassicSourceBlob>,
    #[serde(default)]
    pub import_interpretation_version: u32,
    #[serde(default)]
    pub classic_rule_selection: Option<ClassicRuleSelectionContextV1>,
    #[serde(default)]
    pub campaign: Option<CampaignMetadata>,
    #[serde(default)]
    pub start_location: Option<StartLocation>,
    #[serde(default)]
    pub startup_authoring: Option<ScenarioStartupAuthoring>,
    #[serde(default)]
    pub terrain_catalog: Vec<TerrainProfile>,
    #[serde(default)]
    pub landlook_catalogs: Vec<LandlookCatalogMetadata>,
    #[serde(default)]
    pub terrain_mappings: Vec<TerrainMapping>,
    #[serde(default)]
    pub assets: Vec<AssetDescriptor>,
    #[serde(default)]
    pub classic_resource_removals: Vec<ClassicResourceKey>,
    #[serde(default)]
    pub extra_codes: Vec<ExtraCodeRow>,
    #[serde(default)]
    pub extra_action_points: Vec<ExtraActionPoint>,
    #[serde(default)]
    pub race_rules: Vec<SourcedRaceRule>,
    #[serde(default)]
    pub caste_rules: Vec<SourcedCasteRule>,
    #[serde(default)]
    pub rule_names: Option<RuleNameCatalog>,
    #[serde(default)]
    pub item_rules: Vec<SourcedItemRule>,
    #[serde(default)]
    pub scenario_item_rules: Vec<SourcedScenarioItemRule>,
    #[serde(default)]
    pub standard_spells: Vec<SourcedSpellDefinition>,
    #[serde(default)]
    pub scenario_spells: Vec<SourcedSpellDefinition>,
    #[serde(default)]
    pub scenario_application: Option<ScenarioApplicationContract>,
    pub messages: Vec<ScenarioMessage>,
    #[serde(default)]
    pub option_labels: Vec<OptionLabelRecord>,
    #[serde(default)]
    pub quest_labels: Vec<QuestLabel>,
    #[serde(default)]
    pub script_descriptors: Vec<ScriptDescriptor>,
    #[serde(default)]
    pub message_references: Vec<MessageReference>,
    #[serde(default)]
    pub world: WorldModel,
    #[serde(default)]
    pub player_map_names: Option<PlayerMapNameCatalog>,
    #[serde(default)]
    pub simple_encounters: Vec<SimpleEncounter>,
    #[serde(default)]
    pub complex_encounters: Vec<ComplexEncounter>,
    #[serde(default)]
    pub rogue_encounters: Vec<RogueEncounter>,
    #[serde(default)]
    pub timed_encounters: Vec<TimedEncounter>,
    #[serde(default)]
    pub monster_sets: Vec<MonsterSet>,
    #[serde(default)]
    pub monster_descriptions: Vec<MonsterDescription>,
    #[serde(default)]
    pub battles: Vec<BattleRecord>,
    #[serde(default)]
    pub treasures: Vec<TreasureRecord>,
    #[serde(default)]
    pub shops: Vec<ShopRecord>,
}

impl ProjectSnapshot {
    pub fn new_authored(project_id: StableId) -> Self {
        Self {
            format_version: SNAPSHOT_FORMAT_VERSION,
            project_id,
            origin: ProjectOrigin::Authored,
            classic_sources: Vec::new(),
            import_interpretation_version: 0,
            classic_rule_selection: None,
            campaign: None,
            start_location: None,
            startup_authoring: None,
            terrain_catalog: Vec::new(),
            landlook_catalogs: Vec::new(),
            terrain_mappings: Vec::new(),
            assets: Vec::new(),
            classic_resource_removals: Vec::new(),
            extra_codes: Vec::new(),
            extra_action_points: Vec::new(),
            race_rules: Vec::new(),
            caste_rules: Vec::new(),
            rule_names: None,
            item_rules: Vec::new(),
            scenario_item_rules: Vec::new(),
            standard_spells: Vec::new(),
            scenario_spells: Vec::new(),
            scenario_application: None,
            messages: Vec::new(),
            option_labels: Vec::new(),
            quest_labels: Vec::new(),
            script_descriptors: Vec::new(),
            message_references: Vec::new(),
            world: WorldModel::default(),
            player_map_names: None,
            simple_encounters: Vec::new(),
            complex_encounters: Vec::new(),
            rogue_encounters: Vec::new(),
            timed_encounters: Vec::new(),
            monster_sets: Vec::new(),
            monster_descriptions: Vec::new(),
            battles: Vec::new(),
            treasures: Vec::new(),
            shops: Vec::new(),
        }
    }

    pub fn normalize(&mut self) {
        self.classic_sources
            .sort_by(|left, right| left.native_path.cmp(&right.native_path));
        self.messages
            .sort_by_key(|message| (message.native_id, message.identity.clone()));
        self.option_labels
            .sort_by_key(|label| (label.native_id, label.identity.clone()));
        normalize_editor_metadata(&mut self.quest_labels, &mut self.script_descriptors);
        self.message_references.sort_by_key(|reference| {
            (
                reference.source.clone(),
                reference.field.clone(),
                reference.target_native_id,
            )
        });
        self.world.normalize_map_order();
        terrain::normalize(self);
        media::normalize(&mut self.assets, &mut self.classic_resource_removals);
        self.extra_codes.sort_by_key(|row| row.native_id);
        self.extra_action_points.sort_by_key(|row| row.native_id);
        rules::normalize(
            &mut self.race_rules,
            &mut self.caste_rules,
            &mut self.item_rules,
            &mut self.scenario_item_rules,
        );
        spells::normalize(&mut self.standard_spells, &mut self.scenario_spells);
        self.world.normalize_trigger_order();
        encounters::normalize(
            &mut self.simple_encounters,
            &mut self.complex_encounters,
            &mut self.rogue_encounters,
            &mut self.timed_encounters,
        );
        combat::normalize(
            &mut self.monster_sets,
            &mut self.monster_descriptions,
            &mut self.battles,
        );
        economy::normalize(&mut self.treasures, &mut self.shops);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_authored_project_has_no_annex_state() {
        let project = ProjectSnapshot::new_authored(StableId("new-scenario".into()));

        assert_eq!(project.format_version, SNAPSHOT_FORMAT_VERSION);
        assert_eq!(project.origin, ProjectOrigin::Authored);
    }

    #[test]
    fn imported_project_requires_an_annex_identity() {
        let origin = ProjectOrigin::Imported {
            compatibility_annex: BlobId("sha256:abc123".into()),
        };

        assert!(matches!(origin, ProjectOrigin::Imported { .. }));
    }
}
