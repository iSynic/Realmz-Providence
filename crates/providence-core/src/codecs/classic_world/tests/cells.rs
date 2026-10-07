use super::super::{
    DUNGEON_ACTION_POINT_MARKER_MASK, DUNGEON_NOTE_MARKER_MASK, DUNGEON_PRESERVED_HIGH_SIGN_MASK,
    DUNGEON_VERTICAL_DOOR_MASK, DUNGEON_WALL_MASK, DungeonPrimitive, apply_dungeon_primitive,
    clear_action_point_marker, decode_dungeon_cell, decode_land_cell, ensure_action_point_marker,
    paint_land_cell_preserving_markers,
};
use crate::model::LevelType;

#[test]
fn dungeon_primitives_preserve_unrelated_bits_and_enforce_workflow_ownership() {
    let raw =
        (DUNGEON_PRESERVED_HIGH_SIGN_MASK | DUNGEON_WALL_MASK | DUNGEON_NOTE_MARKER_MASK) as i16;
    let changed = apply_dungeon_primitive(raw, DungeonPrimitive::VerticalDoor, true).unwrap();
    let profile = decode_dungeon_cell(changed);
    assert!(profile.wall);
    assert!(profile.vertical_door);
    assert!(profile.note_marker);
    assert_eq!(profile.preserved_high_sign_bits, 0x8000);
    assert_eq!(
        apply_dungeon_primitive(changed, DungeonPrimitive::Wall, false).unwrap() as u16,
        DUNGEON_PRESERVED_HIGH_SIGN_MASK | DUNGEON_NOTE_MARKER_MASK | DUNGEON_VERTICAL_DOOR_MASK
    );
    for primitive in [
        DungeonPrimitive::NoteMarker,
        DungeonPrimitive::ActionPointMarker,
        DungeonPrimitive::RevealedSecret,
    ] {
        assert!(apply_dungeon_primitive(0, primitive, true).is_err());
    }
}

#[test]
fn action_point_markers_preserve_land_secrets_metadata_and_dungeon_bits() {
    assert_eq!(ensure_action_point_marker(112, LevelType::Land), 1112);
    assert_eq!(clear_action_point_marker(1112, LevelType::Land), 112);
    assert_eq!(ensure_action_point_marker(-112, LevelType::Land), -1112);
    assert_eq!(clear_action_point_marker(-1112, LevelType::Land), -112);

    let note_and_path = 0x6000 | 112;
    assert_eq!(
        ensure_action_point_marker(note_and_path, LevelType::Land) as u16,
        0x6000 | 1112
    );
    assert_eq!(
        clear_action_point_marker(0x6000 | 1112, LevelType::Land) as u16,
        note_and_path as u16
    );
    for secret in [2112, 3112, -2112, -3112] {
        assert_eq!(ensure_action_point_marker(secret, LevelType::Land), secret);
        assert_eq!(clear_action_point_marker(secret, LevelType::Land), secret);
    }

    let dungeon = (DUNGEON_WALL_MASK | DUNGEON_NOTE_MARKER_MASK) as i16;
    let marked = ensure_action_point_marker(dungeon, LevelType::Dungeon);
    assert_eq!(
        marked as u16,
        DUNGEON_WALL_MASK | DUNGEON_NOTE_MARKER_MASK | DUNGEON_ACTION_POINT_MARKER_MASK
    );
    assert_eq!(
        clear_action_point_marker(marked, LevelType::Dungeon),
        dungeon
    );
}

#[test]
fn land_cell_decode_matches_classic_display_bands_without_rewriting_raw_words() {
    let ordinary = decode_land_cell(147);
    assert_eq!(ordinary.terrain_tile, Some(147));
    assert_eq!(ordinary.raw_value, 147);

    let secret = decode_land_cell(2147);
    assert_eq!(secret.terrain_tile, Some(147));
    assert!(secret.secret);
    assert_eq!(secret.raw_value, 2147);

    let restored = decode_land_cell(3147);
    assert_eq!(restored.terrain_tile, Some(147));
    assert!(!restored.secret);

    let metadata = decode_land_cell((0x6000_u16 | 147) as i16);
    assert_eq!(metadata.terrain_tile, Some(147));
    assert!(metadata.note_marker);
    assert!(metadata.path_marker);

    let special = decode_land_cell(-1091);
    assert_eq!(special.icon_resource_id, Some(-91));
    assert_eq!(special.raw_value, -1091);

    let actor = decode_land_cell(379);
    assert_eq!(actor.icon_resource_id, Some(379));
}

#[test]
fn land_paint_replaces_terrain_without_claiming_secret_or_action_point_state() {
    assert_eq!(paint_land_cell_preserving_markers(3112, 156, false), 3156);
    assert_eq!(paint_land_cell_preserving_markers(2112, 156, false), 2156);
    assert_eq!(paint_land_cell_preserving_markers(1112, 156, true), 1156);
    assert_eq!(paint_land_cell_preserving_markers(1112, 156, false), 156);
    assert_eq!(
        paint_land_cell_preserving_markers(0x6000 | 1112, 0x6000 | 156, true) as u16,
        0x6000 | 1156
    );
    assert_eq!(paint_land_cell_preserving_markers(-3112, -90, false), -3090);
}
