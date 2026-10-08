use crate::codecs::ACTION_POINTS_PER_LEVEL;
use crate::codecs::BATTLE_GRID_SLOTS;
use crate::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE;
use crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
use crate::codecs::LAND_LAYOUT_CELLS;
use crate::codecs::LAND_LAYOUT_COLUMNS;
use crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use crate::codecs::SHOP_ITEM_SLOTS;
use crate::codecs::SHOP_RECORD_BYTES;
use crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES;
use crate::codecs::TREASURE_ITEM_SLOTS;
use crate::codecs::TREASURE_RECORD_BYTES;
use crate::model::BattleRecord;
use crate::model::CampaignContactProvenance;
use crate::model::ClassicSourceBlob;
use crate::model::ComplexEncounter;
use crate::model::ExtraActionPoint;
use crate::model::ExtraCodeRow;
use crate::model::GlobalMacroHook;
use crate::model::LandLayout;
use crate::model::LandlookCatalogMetadata;
use crate::model::MapCoordinate;
use crate::model::MessageReference;
use crate::model::MonsterSet;
use crate::model::NativeRecordId;
use crate::model::OptionLabelRecord;
use crate::model::ProjectSnapshot;
use crate::model::QuestLabel;
use crate::model::RogueEncounter;
use crate::model::ScenarioMessage;
use crate::model::ShopRecord;
use crate::model::SimpleEncounter;
use crate::model::SpecialLandSolidityCatalog;
use crate::model::StableId;
use crate::model::TimedEncounter;
use crate::model::TreasureRecord;
use crate::model::{
    ActionPoint, AssetDescriptor, BlobId, CLASSIC_MAP_SIZE, CampaignContact, CampaignMetadata,
    CampaignRestrictions, ClassicAction, ClassicResourceKey, LevelType, MapLevel,
    MapRuntimeMetadata, ProjectOrigin, RaceRuleDefinition, RandomRectangle,
    SNAPSHOT_FORMAT_VERSION, SourcedRaceRule, StartLocation, TerrainProfile,
};
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use crate::session::ActionStepEdit;
use crate::session::BattleMonsterReferenceRewrite;
use crate::session::CHANGE_PROJECTION_LIMIT;
use crate::session::ComplexEncounterRecordDraft;
use crate::session::EditorCommand;
use crate::session::EditorSession;
use crate::session::ExpectedRevisionCommand;
use crate::session::ExtraCodeBranchLayout;
use crate::session::LandMapCellPaint;
use crate::session::PersistedSessionState;
use crate::session::ProjectionBudget;
use crate::session::Revision;
use crate::session::SESSION_HISTORY_ENTRY_LIMIT;
use crate::session::SimpleEncounterRecordDraft;
use crate::session::TypedActionSettings;
use crate::session::action_point_records::action_point_identity;
use crate::session::action_point_records::action_point_is_reusable;
use crate::session::errors::SessionError;
use crate::session::monster_records::authored_monster;
use crate::session::monster_records::authored_monster_description;
use crate::session::monster_records::monster_for_set;
use crate::session::projections::references_for;
use crate::session::{
    ActionPointHeaderDraft, ActionPointRecordDraft, ActionSettingsCallerConfirmation,
    ActionSettingsWriteScope, ActionStepDraft, ActionStepDraftSettings,
    ExtraActionPointHeaderDraft, ExtraActionPointRecordDraft,
};
use crate::validation::Severity;

mod action_draft_semantics;
mod action_points;
mod action_record_drafts;
mod action_step_fixtures;
mod action_step_transactions;
mod action_steps;
mod assets;
mod battle_authoring;
mod complex_encounters;
mod confirmed_settings;
mod economy;
mod encounter_authoring;
mod encounter_references;
mod extra_action_points;
mod extra_codes;
mod history;
mod imported_action_drafts;
mod imports;
mod labels;
mod land_layout;
mod map_lifecycle;
mod map_paint;
mod monster_drafts;
mod monster_library_transfers;
mod monster_operations;
mod monsters;
mod player_maps;
mod random_rectangles;
mod rules;
mod scenario_application;
mod scenario_metadata;
mod semantic_reference_sources;
mod settings_preservation;
mod simple_encounters;
mod spells;
mod world_catalogs;

fn sample_snapshot() -> ProjectSnapshot {
    ProjectSnapshot {
        format_version: SNAPSHOT_FORMAT_VERSION,
        project_id: StableId("fixture".into()),
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
        messages: vec![ScenarioMessage {
            identity: StableId("message:1".into()),
            native_id: NativeRecordId(1),
            text: "Original".into(),
            authored: true,
        }],
        option_labels: Vec::new(),
        quest_labels: Vec::new(),
        script_descriptors: Vec::new(),
        message_references: vec![MessageReference {
            source: StableId("action-point:7".into()),
            field: "outcome.message".into(),
            target_native_id: NativeRecordId(99),
            required: true,
        }],
        world: Default::default(),
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
