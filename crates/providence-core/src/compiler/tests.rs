use super::*;
use crate::codecs::{
    NativeFileFamily, ResourceIdentity, ScenarioSupportCodecError, decode_caste_rules,
    decode_custom_landlook_mapstats, decode_extra_action_points, decode_extra_codes,
    decode_land_layout, decode_land_maps, decode_land_random_levels, decode_monster_set,
    decode_player_maps, decode_timed_encounters, encode_monster_set, encode_timed_encounters,
};
use crate::model::{
    ActionPoint, AssetDescriptor, BattleRecord, BlobId, CLASSIC_MAP_SIZE, ClassicAction,
    ClassicResourceKey, ExtraActionPoint, ExtraCodeRow, LevelType, MapCoordinate, MapLevel,
    MapRuntimeMetadata, NativeRecordId, ProjectOrigin, ProjectSnapshot, RandomRectangle,
    RogueEncounter, ScenarioMessage, ShopRecord, SimpleEncounter, StableId, TimedEncounter,
    WorldModel,
};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

mod bootstrap;
mod catalogs;
mod combat;
mod global;
mod manifest;
mod resources;
mod scripts;
mod world;

mod bootstrap_fixtures;

mod combat_fixtures;

mod scripts_fixtures;

mod resources_fixtures;

mod catalogs_fixtures;

mod world_fixtures;
