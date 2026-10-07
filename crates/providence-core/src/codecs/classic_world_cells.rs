use serde::{Deserialize, Serialize};

use crate::model::LevelType;

pub const DUNGEON_PRESERVED_HIGH_SIGN_MASK: u16 = 0x8000;
pub const DUNGEON_NO_WALL_IN_BATTLE_MASK: u16 = 0x4000;
pub const DUNGEON_VISIBLE_ARCH_MASK: u16 = 0x2000;
pub const DUNGEON_ACTION_POINT_MARKER_MASK: u16 = 0x1000;
pub const DUNGEON_ALLOW_MOVE_WEST_MASK: u16 = 0x0800;
pub const DUNGEON_ALLOW_MOVE_SOUTH_MASK: u16 = 0x0400;
pub const DUNGEON_ALLOW_MOVE_EAST_MASK: u16 = 0x0200;
pub const DUNGEON_ALLOW_MOVE_NORTH_MASK: u16 = 0x0100;
pub const DUNGEON_UNMAPPED_MASK: u16 = 0x0080;
pub const DUNGEON_REVEALED_SECRET_MASK: u16 = 0x0040;
pub const DUNGEON_NOTE_MARKER_MASK: u16 = 0x0020;
pub const DUNGEON_COLUMN_MASK: u16 = 0x0010;
pub const DUNGEON_STAIRS_MASK: u16 = 0x0008;
pub const DUNGEON_VERTICAL_DOOR_MASK: u16 = 0x0004;
pub const DUNGEON_HORIZONTAL_DOOR_MASK: u16 = 0x0002;
pub const DUNGEON_WALL_MASK: u16 = 0x0001;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DungeonPrimitive {
    NoWallInBattle,
    Wall,
    HorizontalDoor,
    VerticalDoor,
    Stairs,
    Column,
    Unmapped,
    AllowMoveNorth,
    AllowMoveEast,
    AllowMoveSouth,
    AllowMoveWest,
    NoteMarker,
    ActionPointMarker,
    RevealedSecret,
    VisibleArch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DungeonPrimitiveWriterStatus {
    WriterSafePrimitive,
    RouteThroughNoteWorkflow,
    RouteThroughActionPointWorkflow,
    ReadOnlyPreserve,
}

impl DungeonPrimitive {
    pub const ALL: [Self; 15] = [
        Self::NoWallInBattle,
        Self::Wall,
        Self::HorizontalDoor,
        Self::VerticalDoor,
        Self::Stairs,
        Self::Column,
        Self::Unmapped,
        Self::AllowMoveNorth,
        Self::AllowMoveEast,
        Self::AllowMoveSouth,
        Self::AllowMoveWest,
        Self::NoteMarker,
        Self::ActionPointMarker,
        Self::RevealedSecret,
        Self::VisibleArch,
    ];

    pub fn mask(self) -> u16 {
        match self {
            Self::NoWallInBattle => DUNGEON_NO_WALL_IN_BATTLE_MASK,
            Self::Wall => DUNGEON_WALL_MASK,
            Self::HorizontalDoor => DUNGEON_HORIZONTAL_DOOR_MASK,
            Self::VerticalDoor => DUNGEON_VERTICAL_DOOR_MASK,
            Self::Stairs => DUNGEON_STAIRS_MASK,
            Self::Column => DUNGEON_COLUMN_MASK,
            Self::Unmapped => DUNGEON_UNMAPPED_MASK,
            Self::AllowMoveNorth => DUNGEON_ALLOW_MOVE_NORTH_MASK,
            Self::AllowMoveEast => DUNGEON_ALLOW_MOVE_EAST_MASK,
            Self::AllowMoveSouth => DUNGEON_ALLOW_MOVE_SOUTH_MASK,
            Self::AllowMoveWest => DUNGEON_ALLOW_MOVE_WEST_MASK,
            Self::NoteMarker => DUNGEON_NOTE_MARKER_MASK,
            Self::ActionPointMarker => DUNGEON_ACTION_POINT_MARKER_MASK,
            Self::RevealedSecret => DUNGEON_REVEALED_SECRET_MASK,
            Self::VisibleArch => DUNGEON_VISIBLE_ARCH_MASK,
        }
    }

    pub fn writer_status(self) -> DungeonPrimitiveWriterStatus {
        match self {
            Self::NoteMarker => DungeonPrimitiveWriterStatus::RouteThroughNoteWorkflow,
            Self::ActionPointMarker => {
                DungeonPrimitiveWriterStatus::RouteThroughActionPointWorkflow
            }
            Self::RevealedSecret => DungeonPrimitiveWriterStatus::ReadOnlyPreserve,
            _ => DungeonPrimitiveWriterStatus::WriterSafePrimitive,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DungeonCellProfile {
    pub raw_value: i16,
    pub raw_mask: u16,
    pub wall: bool,
    pub horizontal_door: bool,
    pub vertical_door: bool,
    pub stairs: bool,
    pub column: bool,
    pub note_marker: bool,
    pub revealed_secret: bool,
    pub unmapped: bool,
    pub allow_move_north: bool,
    pub allow_move_east: bool,
    pub allow_move_south: bool,
    pub allow_move_west: bool,
    pub action_point_marker: bool,
    pub visible_arch: bool,
    pub no_wall_in_battle: bool,
    pub preserved_high_sign_bits: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandCellProfile {
    pub raw_value: i16,
    pub note_marker: bool,
    pub path_marker: bool,
    pub marker_band: u8,
    pub action_point_marker: bool,
    pub revealed_secret: bool,
    pub hidden_secret: bool,
    pub secret: bool,
    pub rendered_value: i16,
    pub terrain_tile: Option<u16>,
    pub icon_resource_id: Option<i16>,
}

/// Decodes one signed land-map word using Classic's display transformations.
pub fn decode_land_cell(value: i16) -> LandCellProfile {
    let marker_band = land_action_point_marker_band(value).clamp(0, 3) as u8;
    if value < 0 {
        let rendered_value = if value < -1999 {
            value.saturating_add(2000)
        } else if value < -999 {
            value.saturating_add(1000)
        } else {
            value
        };
        return LandCellProfile {
            raw_value: value,
            note_marker: false,
            path_marker: false,
            marker_band,
            action_point_marker: marker_band > 0,
            revealed_secret: marker_band == 2,
            hidden_secret: marker_band == 3,
            secret: marker_band == 2,
            rendered_value,
            terrain_tile: None,
            icon_resource_id: Some(rendered_value),
        };
    }

    let raw_mask = value as u16;
    let note_marker = raw_mask & 0x4000 != 0;
    let path_marker = raw_mask & 0x2000 != 0;
    let mut rendered_value = (raw_mask & !0x6000) as i16;
    let mut secret = false;
    if rendered_value > 999 {
        rendered_value -= 1000;
        if rendered_value > 999 {
            rendered_value -= 1000;
            secret = true;
            if rendered_value > 999 {
                rendered_value -= 1000;
                secret = false;
            }
        }
    }
    LandCellProfile {
        raw_value: value,
        note_marker,
        path_marker,
        marker_band,
        action_point_marker: marker_band > 0,
        revealed_secret: marker_band == 2,
        hidden_secret: marker_band == 3,
        secret,
        rendered_value,
        terrain_tile: (1..=200)
            .contains(&rendered_value)
            .then_some(rendered_value as u16),
        icon_resource_id: (!(0..=200).contains(&rendered_value)).then_some(rendered_value),
    }
}

pub fn decode_dungeon_cell(value: i16) -> DungeonCellProfile {
    let raw_mask = value as u16;
    DungeonCellProfile {
        raw_value: value,
        raw_mask,
        wall: raw_mask & DUNGEON_WALL_MASK != 0,
        horizontal_door: raw_mask & DUNGEON_HORIZONTAL_DOOR_MASK != 0,
        vertical_door: raw_mask & DUNGEON_VERTICAL_DOOR_MASK != 0,
        stairs: raw_mask & DUNGEON_STAIRS_MASK != 0,
        column: raw_mask & DUNGEON_COLUMN_MASK != 0,
        note_marker: raw_mask & DUNGEON_NOTE_MARKER_MASK != 0,
        revealed_secret: raw_mask & DUNGEON_REVEALED_SECRET_MASK != 0,
        unmapped: raw_mask & DUNGEON_UNMAPPED_MASK != 0,
        allow_move_north: raw_mask & DUNGEON_ALLOW_MOVE_NORTH_MASK != 0,
        allow_move_east: raw_mask & DUNGEON_ALLOW_MOVE_EAST_MASK != 0,
        allow_move_south: raw_mask & DUNGEON_ALLOW_MOVE_SOUTH_MASK != 0,
        allow_move_west: raw_mask & DUNGEON_ALLOW_MOVE_WEST_MASK != 0,
        action_point_marker: raw_mask & DUNGEON_ACTION_POINT_MARKER_MASK != 0,
        visible_arch: raw_mask & DUNGEON_VISIBLE_ARCH_MASK != 0,
        no_wall_in_battle: raw_mask & DUNGEON_NO_WALL_IN_BATTLE_MASK != 0,
        preserved_high_sign_bits: raw_mask & DUNGEON_PRESERVED_HIGH_SIGN_MASK,
    }
}

pub fn apply_dungeon_primitive(
    value: i16,
    primitive: DungeonPrimitive,
    enabled: bool,
) -> Result<i16, &'static str> {
    if primitive.writer_status() != DungeonPrimitiveWriterStatus::WriterSafePrimitive {
        return Err("dungeon primitive is not directly writable");
    }
    let mut mask = value as u16;
    if enabled {
        mask |= primitive.mask();
    } else {
        mask &= !primitive.mask();
    }
    Ok(mask as i16)
}

pub fn ensure_action_point_marker(value: i16, level_type: LevelType) -> i16 {
    match level_type {
        LevelType::Dungeon => ((value as u16) | DUNGEON_ACTION_POINT_MARKER_MASK) as i16,
        LevelType::Land => {
            if land_action_point_marker_band(value) == 0 {
                with_land_action_point_marker_band(value, 1)
            } else {
                value
            }
        }
    }
}

pub fn clear_action_point_marker(value: i16, level_type: LevelType) -> i16 {
    match level_type {
        LevelType::Dungeon => ((value as u16) & !DUNGEON_ACTION_POINT_MARKER_MASK) as i16,
        LevelType::Land => {
            if land_action_point_marker_band(value) == 1 {
                with_land_action_point_marker_band(value, 0)
            } else {
                value
            }
        }
    }
}

pub fn paint_land_cell_preserving_markers(
    current: i16,
    replacement: i16,
    has_action_point: bool,
) -> i16 {
    let current_band = land_action_point_marker_band(current);
    let replacement_band = if current_band >= 3 {
        3
    } else if current_band >= 2 {
        2
    } else if has_action_point {
        1
    } else {
        0
    };
    with_land_action_point_marker_band(replacement, replacement_band)
}

pub fn apply_land_marker_band(value: i16, band: u8) -> Result<i16, &'static str> {
    if band > 3 {
        return Err("land marker band must be between 0 and 3");
    }
    Ok(with_land_action_point_marker_band(value, i32::from(band)))
}

pub fn apply_land_note_marker(value: i16, enabled: bool) -> Result<i16, &'static str> {
    apply_land_bit_marker(value, 0x4000, enabled)
}

pub fn apply_land_path_marker(value: i16, enabled: bool) -> Result<i16, &'static str> {
    apply_land_bit_marker(value, 0x2000, enabled)
}

fn land_action_point_marker_band(value: i16) -> i32 {
    land_marker_magnitude(value) / 1000
}

fn land_marker_magnitude(value: i16) -> i32 {
    if value < 0 {
        i32::from(value).abs()
    } else {
        i32::from((value as u16) & !0x6000)
    }
}

fn apply_land_bit_marker(value: i16, mask: u16, enabled: bool) -> Result<i16, &'static str> {
    if value < 0 {
        return Err("negative special-land values cannot encode note or path markers");
    }
    let mut raw = value as u16;
    if enabled {
        raw |= mask;
    } else {
        raw &= !mask;
    }
    Ok(raw as i16)
}

fn with_land_action_point_marker_band(value: i16, band: i32) -> i16 {
    let metadata = if value > 0 {
        (value as u16) & 0x6000
    } else {
        0
    };
    let mut magnitude = land_marker_magnitude(value);
    for _ in 0..3 {
        if magnitude <= 999 {
            break;
        }
        magnitude -= 1000;
    }
    let payload = band * 1000 + magnitude;
    if value < 0 {
        (-payload) as i16
    } else {
        (((payload as u16) & !0x6000) | metadata) as i16
    }
}
