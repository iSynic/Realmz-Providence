pub const DUNGEON_UNKNOWN_MASK: u16 = 0x8000;

pub const NO_WALL_IN_BATTLE_MASK: u16 = 0x4000;
pub const WALL_MASK: u16 = 0x0001;
pub const HORIZONTAL_DOOR_MASK: u16 = 0x0002;
pub const VERTICAL_DOOR_MASK: u16 = 0x0004;
pub const STAIRS_MASK: u16 = 0x0008;
pub const COLUMN_MASK: u16 = 0x0010;
pub const NOTE_MARKER_MASK: u16 = 0x0020;
pub const REVEALED_SECRET_MASK: u16 = 0x0040;
pub const UNMAPPED_MASK: u16 = 0x0080;
pub const ALLOW_MOVE_NORTH_MASK: u16 = 0x0100;
pub const ALLOW_MOVE_EAST_MASK: u16 = 0x0200;
pub const ALLOW_MOVE_SOUTH_MASK: u16 = 0x0400;
pub const ALLOW_MOVE_WEST_MASK: u16 = 0x0800;
pub const ACTION_POINT_MARKER_MASK: u16 = 0x1000;
pub const VISIBLE_ARCH_MASK: u16 = 0x2000;

pub const DIRECTIONAL_ALLOW_MOVE_MASK: u16 = 0x0f00;
pub const DOOR_ORIENTATION_MASK: u16 = HORIZONTAL_DOOR_MASK | VERTICAL_DOOR_MASK;
pub const DUNGEON_COMBAT_HOLE_MASK: u16 = 0x4f0e;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl DungeonPrimitive {
    pub fn mask(self) -> u16 {
        match self {
            Self::NoWallInBattle => NO_WALL_IN_BATTLE_MASK,
            Self::Wall => WALL_MASK,
            Self::HorizontalDoor => HORIZONTAL_DOOR_MASK,
            Self::VerticalDoor => VERTICAL_DOOR_MASK,
            Self::Stairs => STAIRS_MASK,
            Self::Column => COLUMN_MASK,
            Self::Unmapped => UNMAPPED_MASK,
            Self::AllowMoveNorth => ALLOW_MOVE_NORTH_MASK,
            Self::AllowMoveEast => ALLOW_MOVE_EAST_MASK,
            Self::AllowMoveSouth => ALLOW_MOVE_SOUTH_MASK,
            Self::AllowMoveWest => ALLOW_MOVE_WEST_MASK,
            Self::NoteMarker => NOTE_MARKER_MASK,
            Self::ActionPointMarker => ACTION_POINT_MARKER_MASK,
            Self::RevealedSecret => REVEALED_SECRET_MASK,
            Self::VisibleArch => VISIBLE_ARCH_MASK,
        }
    }

    pub fn writer_status(self) -> DungeonPrimitiveWriterStatus {
        match self {
            Self::Wall
            | Self::NoWallInBattle
            | Self::HorizontalDoor
            | Self::VerticalDoor
            | Self::Stairs
            | Self::Column
            | Self::Unmapped
            | Self::AllowMoveNorth
            | Self::AllowMoveEast
            | Self::AllowMoveSouth
            | Self::AllowMoveWest => DungeonPrimitiveWriterStatus::WriterSafePrimitive,
            Self::NoteMarker => DungeonPrimitiveWriterStatus::RouteThroughNoteWorkflow,
            Self::ActionPointMarker => DungeonPrimitiveWriterStatus::RouteThroughActionPointWorkflow,
            Self::RevealedSecret | Self::VisibleArch => {
                DungeonPrimitiveWriterStatus::ReadOnlyPreserve
            }
        }
    }

    pub fn is_directly_writable(self) -> bool {
        self.writer_status() == DungeonPrimitiveWriterStatus::WriterSafePrimitive
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DungeonPrimitiveWriterStatus {
    WriterSafePrimitive,
    RouteThroughNoteWorkflow,
    RouteThroughActionPointWorkflow,
    ReadOnlyPreserve,
}

#[derive(Debug, Clone, PartialEq, Eq)]
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
    pub unknown_bits: u16,
}

pub fn decode_dungeon_cell(value: i16) -> DungeonCellProfile {
    let raw_mask = value as u16;
    DungeonCellProfile {
        raw_value: value,
        raw_mask,
        wall: raw_mask & WALL_MASK != 0,
        horizontal_door: raw_mask & HORIZONTAL_DOOR_MASK != 0,
        vertical_door: raw_mask & VERTICAL_DOOR_MASK != 0,
        stairs: raw_mask & STAIRS_MASK != 0,
        column: raw_mask & COLUMN_MASK != 0,
        note_marker: raw_mask & NOTE_MARKER_MASK != 0,
        revealed_secret: raw_mask & REVEALED_SECRET_MASK != 0,
        unmapped: raw_mask & UNMAPPED_MASK != 0,
        allow_move_north: raw_mask & ALLOW_MOVE_NORTH_MASK != 0,
        allow_move_east: raw_mask & ALLOW_MOVE_EAST_MASK != 0,
        allow_move_south: raw_mask & ALLOW_MOVE_SOUTH_MASK != 0,
        allow_move_west: raw_mask & ALLOW_MOVE_WEST_MASK != 0,
        action_point_marker: raw_mask & ACTION_POINT_MARKER_MASK != 0,
        visible_arch: raw_mask & VISIBLE_ARCH_MASK != 0,
        no_wall_in_battle: raw_mask & NO_WALL_IN_BATTLE_MASK != 0,
        unknown_bits: raw_mask & DUNGEON_UNKNOWN_MASK,
    }
}

pub fn apply_dungeon_primitive(
    value: i16,
    primitive: DungeonPrimitive,
    enabled: bool,
) -> Result<i16, &'static str> {
    if !primitive.is_directly_writable() {
        return Err("dungeon primitive is not directly writable");
    }
    let mut raw = value as u16;
    if enabled {
        raw |= primitive.mask();
    } else {
        raw &= !primitive.mask();
    }
    Ok(raw as i16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_dungeon_cell_profiles_known_bits() {
        let value = (WALL_MASK
            | HORIZONTAL_DOOR_MASK
            | STAIRS_MASK
            | UNMAPPED_MASK
            | ALLOW_MOVE_NORTH_MASK
            | ACTION_POINT_MARKER_MASK
            | VISIBLE_ARCH_MASK
            | NO_WALL_IN_BATTLE_MASK) as i16;
        let profile = decode_dungeon_cell(value);
        assert!(profile.wall);
        assert!(profile.horizontal_door);
        assert!(!profile.vertical_door);
        assert!(profile.stairs);
        assert!(profile.unmapped);
        assert!(profile.allow_move_north);
        assert!(!profile.allow_move_east);
        assert!(profile.action_point_marker);
        assert!(profile.visible_arch);
        assert!(profile.no_wall_in_battle);
        assert_eq!(profile.unknown_bits, 0);
    }

    #[test]
    fn primitive_mutation_preserves_unknown_and_unrelated_bits() {
        let raw = (0x8000 | WALL_MASK | NOTE_MARKER_MASK) as u16 as i16;
        let changed = apply_dungeon_primitive(raw, DungeonPrimitive::VerticalDoor, true).unwrap();
        let profile = decode_dungeon_cell(changed);
        assert!(profile.wall);
        assert!(profile.vertical_door);
        assert!(profile.note_marker);
        assert_eq!(profile.unknown_bits, 0x8000);

        let cleared = apply_dungeon_primitive(changed, DungeonPrimitive::Wall, false).unwrap();
        let profile = decode_dungeon_cell(cleared);
        assert!(!profile.wall);
        assert!(profile.vertical_door);
        assert!(profile.note_marker);
        assert_eq!(profile.unknown_bits, 0x8000);
    }

    #[test]
    fn routed_and_runtime_primitives_are_not_directly_writable() {
        for primitive in [
            DungeonPrimitive::NoteMarker,
            DungeonPrimitive::ActionPointMarker,
            DungeonPrimitive::RevealedSecret,
            DungeonPrimitive::VisibleArch,
        ] {
            assert!(!primitive.is_directly_writable());
            assert!(apply_dungeon_primitive(0, primitive, true).is_err());
        }
    }

    #[test]
    fn writer_safe_primitives_are_directly_writable() {
        for primitive in [
            DungeonPrimitive::NoWallInBattle,
            DungeonPrimitive::Wall,
            DungeonPrimitive::HorizontalDoor,
            DungeonPrimitive::VerticalDoor,
            DungeonPrimitive::Stairs,
            DungeonPrimitive::Column,
            DungeonPrimitive::Unmapped,
            DungeonPrimitive::AllowMoveNorth,
            DungeonPrimitive::AllowMoveEast,
            DungeonPrimitive::AllowMoveSouth,
            DungeonPrimitive::AllowMoveWest,
        ] {
            assert!(primitive.is_directly_writable());
            let changed = apply_dungeon_primitive(0, primitive, true).unwrap();
            assert_eq!(changed as u16, primitive.mask());
        }
    }
}
