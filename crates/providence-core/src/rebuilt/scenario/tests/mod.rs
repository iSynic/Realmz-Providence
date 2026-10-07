use super::random_rectangles::classic_between_bounds;
use super::triggers::project_rebuilt_v3_selected_trigger_programs;
use super::*;
use crate::codecs::BATTLE_GRID_SLOTS;
use crate::model::{
    BattleRecord, BlobId, CLASSIC_MAP_SIZE, ClassicAction, ExtraActionPoint, ExtraCodeRow,
    LevelType, MapCoordinate, NativeRecordId, ProjectSnapshot, ScenarioApplicationHooks,
    SimpleEncounter, StableId,
};
mod fixtures;
use fixtures::*;
mod activation;
mod branches;
mod document;
mod maps;
mod opcodes;
mod triggers;

use crate::rebuilt::runtime_ids::action_point_program_id;
