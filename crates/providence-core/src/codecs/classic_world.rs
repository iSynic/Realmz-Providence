#[path = "classic_record_extents.rs"]
mod record_extents;
pub use record_extents::{
    certified_battle_extent, certified_battle_source, certified_extra_action_point_extent,
    certified_extra_action_point_source, certified_monster_extent, certified_monster_source,
    certified_shop_extent, certified_shop_source, certified_treasure_extent,
    certified_treasure_source,
};

mod action_points;
mod actions;
mod bytes;
#[path = "classic_world_cells.rs"]
mod cells;
mod encounters;
#[path = "classic_world_error.rs"]
mod error_display;
mod extra_action_points;
mod maps;
mod types;

pub use action_points::{
    decode_dungeon_action_points, decode_land_action_points, encode_dungeon_action_points,
    encode_land_action_points,
};
pub use cells::{
    DUNGEON_ACTION_POINT_MARKER_MASK, DUNGEON_ALLOW_MOVE_EAST_MASK, DUNGEON_ALLOW_MOVE_NORTH_MASK,
    DUNGEON_ALLOW_MOVE_SOUTH_MASK, DUNGEON_ALLOW_MOVE_WEST_MASK, DUNGEON_COLUMN_MASK,
    DUNGEON_HORIZONTAL_DOOR_MASK, DUNGEON_NO_WALL_IN_BATTLE_MASK, DUNGEON_NOTE_MARKER_MASK,
    DUNGEON_PRESERVED_HIGH_SIGN_MASK, DUNGEON_REVEALED_SECRET_MASK, DUNGEON_STAIRS_MASK,
    DUNGEON_UNMAPPED_MASK, DUNGEON_VERTICAL_DOOR_MASK, DUNGEON_VISIBLE_ARCH_MASK,
    DUNGEON_WALL_MASK, DungeonCellProfile, DungeonPrimitive, DungeonPrimitiveWriterStatus,
    LandCellProfile, apply_dungeon_primitive, apply_land_marker_band, apply_land_note_marker,
    apply_land_path_marker, clear_action_point_marker, decode_dungeon_cell, decode_land_cell,
    ensure_action_point_marker, paint_land_cell_preserving_markers,
};
pub use encounters::{decode_simple_encounters, encode_simple_encounters};
pub use extra_action_points::{decode_extra_action_points, encode_extra_action_points};
pub use maps::{decode_dungeon_maps, decode_land_maps, encode_dungeon_maps, encode_land_maps};
pub use types::{
    ACTION_POINT_LEVEL_BYTES, ACTION_POINT_RECORD_BYTES, ACTION_POINTS_PER_LEVEL,
    ClassicWorldCodecError, DecodedRecordFile, EXTRA_ACTION_POINT_RECORD_BYTES, MAP_LEVEL_BYTES,
    SIMPLE_ENCOUNTER_RECORD_BYTES,
};

#[cfg(test)]
mod tests;
