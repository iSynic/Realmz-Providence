use super::super::maps::{canonical_land_cell_index, native_land_cell_index};
use super::super::{
    ACTION_POINT_LEVEL_BYTES, ACTION_POINT_RECORD_BYTES, MAP_LEVEL_BYTES,
    clear_action_point_marker, decode_dungeon_action_points, decode_land_action_points,
    decode_land_maps, encode_dungeon_action_points, encode_land_action_points, encode_land_maps,
    ensure_action_point_marker,
};
use super::changed_offsets;
use crate::model::{ActionPoint, ClassicAction, LevelType, MapCoordinate, StableId};

#[test]
fn land_action_point_round_trip_and_owned_slot_edit_are_exact() {
    let mut source = vec![0xa5; ACTION_POINT_LEVEL_BYTES];
    let record_index = 7usize;
    let slot = 5usize;
    let start = record_index * ACTION_POINT_RECORD_BYTES;
    source[start..start + 4].copy_from_slice(&712i32.to_be_bytes());
    source[start + 8 + slot * 2..start + 10 + slot * 2].copy_from_slice(&1i16.to_be_bytes());
    source[start + 24 + slot * 2..start + 26 + slot * 2].copy_from_slice(&47i16.to_be_bytes());
    source.extend_from_slice(&[0xbe]);
    let mut decoded = decode_land_action_points(&source);
    assert_eq!(
        encode_land_action_points(&decoded.records, 1, Some(&source)).unwrap(),
        source
    );

    let action_point = &mut decoded.records[record_index];
    let action = action_point
        .actions
        .iter_mut()
        .find(|action| action.slot == slot as u8)
        .expect("fixture action");
    action.raw_opcode = 4;
    action.target_native_id = 3;
    let edited = encode_land_action_points(&decoded.records, 1, Some(&source)).unwrap();
    assert_eq!(
        changed_offsets(&source, &edited),
        vec![start + 8 + slot * 2 + 1, start + 24 + slot * 2 + 1,]
    );
    assert_eq!(edited.last(), Some(&0xbe));
}

#[test]
fn action_point_allocation_and_clear_touch_only_one_owned_row_and_map_word() {
    let action_source = vec![0; ACTION_POINT_LEVEL_BYTES];
    let mut action_points = decode_land_action_points(&action_source).records;
    action_points[0] = ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 712,
        coordinate: Some(MapCoordinate { x: 12, y: 7 }),
        post_action_level: 0,
        post_action_x: 12,
        post_action_y: 7,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 3,
            raw_opcode: 1,
            target_native_id: 47,
        }],
    };
    let allocated = encode_land_action_points(&action_points, 1, Some(&action_source)).unwrap();
    assert!(
        changed_offsets(&action_source, &allocated)
            .into_iter()
            .all(|offset| offset < ACTION_POINT_RECORD_BYTES)
    );
    action_points[0] = ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 0,
        coordinate: None,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 0,
        actions: Vec::new(),
    };
    assert_eq!(
        encode_land_action_points(&action_points, 1, Some(&allocated)).unwrap(),
        action_source
    );

    let (x, y) = (12usize, 7usize);
    let map_offset = native_land_cell_index(x, y) * 2;
    let mut map_source = vec![0; MAP_LEVEL_BYTES];
    map_source[map_offset..map_offset + 2].copy_from_slice(&112i16.to_be_bytes());
    let mut maps = decode_land_maps(&map_source).records;
    let cell = canonical_land_cell_index(x, y);
    maps[0].tiles[cell] = ensure_action_point_marker(maps[0].tiles[cell], LevelType::Land);
    let marked = encode_land_maps(&maps, Some(&map_source)).unwrap();
    assert_eq!(
        changed_offsets(&map_source, &marked),
        vec![map_offset, map_offset + 1]
    );
    maps[0].tiles[cell] = clear_action_point_marker(maps[0].tiles[cell], LevelType::Land);
    assert_eq!(encode_land_maps(&maps, Some(&marked)).unwrap(), map_source);
}

#[test]
fn dungeon_action_points_use_data_ddd_identity_and_level_partition() {
    let mut source = vec![0; ACTION_POINT_LEVEL_BYTES];
    let record_index = 4;
    let offset = record_index * ACTION_POINT_RECORD_BYTES;
    source[offset..offset + 4].copy_from_slice(&702i32.to_be_bytes());
    source[offset + 7] = 75;
    source[offset + 8..offset + 10].copy_from_slice(&1i16.to_be_bytes());
    source[offset + 24..offset + 26].copy_from_slice(&47i16.to_be_bytes());

    let decoded = decode_dungeon_action_points(&source);
    assert_eq!(
        decoded.records[record_index].identity,
        StableId("action-point:dungeon:0:4".into())
    );
    assert_eq!(decoded.records[record_index].level_type, LevelType::Dungeon);
    assert_eq!(
        decoded.records[record_index].coordinate,
        Some(MapCoordinate { x: 2, y: 7 })
    );
    assert_eq!(
        encode_dungeon_action_points(&decoded.records, 1, Some(&source)).unwrap(),
        source
    );
}
