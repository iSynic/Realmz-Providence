use super::*;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::model::{
    AssetDescriptor, BattleRecord, BlobId, CLASSIC_MAP_SIZE, ClassicAction, ClassicResourceKey,
    ClassicSourceBlob, ComplexEncounter, ExtraActionPoint, LevelType, MapLevel, MonsterDescription,
    NativeRecordId, OptionLabelRecord, PlayerMapNameCatalog, PlayerMapRecord, PlayerMapRect,
    ProjectOrigin, QuestLabel, RogueEncounter, SNAPSHOT_FORMAT_VERSION, ScenarioMessage,
    ShopRecord, StableId, TreasureRecord, WorldModel,
};
use providence_core::monster_library::{
    MONSTER_SCRAPBOOK_RECORD_BYTES, MonsterLibraryCommand, decode_monster_scrapbook,
};
use providence_core::reference_library::{
    REFERENCE_CATALOG_FORMAT_VERSION, ReferenceCatalog, ReferenceCatalogAsset,
    ReferenceCatalogSource, ReferenceSourceKind,
};
use providence_core::session::{
    EditorCommand, EditorSession, ExpectedRevisionCommand, SessionError,
};
use rusqlite::params;
use serde_json::json;

mod blob_retention;
mod classic_rule_selection;
mod history;
mod history_preparation;
mod index;
mod libraries;
mod lifecycle;
mod migration;
mod project_open;
mod reference_uses;
mod snapshot_segments;
mod snapshots;
mod spell_checkpoint;
mod terrain_mapping;

fn snapshot(text: &str) -> ProjectSnapshot {
    ProjectSnapshot {
        messages: vec![ScenarioMessage {
            identity: StableId("message:12".into()),
            native_id: NativeRecordId(12),
            text: text.into(),
            authored: true,
        }],
        world: WorldModel {
            maps: vec![MapLevel {
                identity: StableId("land:0".into()),
                level_type: LevelType::Land,
                native_index: 0,
                name: "Thornwatch Coast".into(),
                tiles: vec![3; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
                runtime: None,
            }],
            action_points: Vec::new(),
            land_layout: None,
            player_maps: Vec::new(),
            special_land_solidity: None,
        },
        ..ProjectSnapshot::new_authored(StableId("durability".into()))
    }
}
