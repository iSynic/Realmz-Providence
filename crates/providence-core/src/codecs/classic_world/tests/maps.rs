use super::super::maps::{canonical_land_cell_index, native_land_cell_index};
use super::super::{
    MAP_LEVEL_BYTES, decode_dungeon_maps, decode_land_maps, encode_dungeon_maps, encode_land_maps,
};
use super::changed_offsets;
use crate::model::{CLASSIC_MAP_SIZE, StableId};

#[test]
fn land_map_no_edit_round_trip_and_owned_cell_edit_are_exact() {
    let mut source = vec![0xa5; MAP_LEVEL_BYTES * 2];
    source[0..2].copy_from_slice(&42i16.to_be_bytes());
    source.extend_from_slice(&[0xde, 0xad]);
    let mut decoded = decode_land_maps(&source);
    assert_eq!(
        encode_land_maps(&decoded.records, Some(&source)).unwrap(),
        source
    );

    let (x, y) = (7, 1);
    let canonical_index = canonical_land_cell_index(x, y);
    let offset = MAP_LEVEL_BYTES + native_land_cell_index(x, y) * 2;
    decoded.records[1].tiles[canonical_index] = 0x0304;
    let edited = encode_land_maps(&decoded.records, Some(&source)).unwrap();
    assert_eq!(changed_offsets(&source, &edited), vec![offset, offset + 1]);
    assert_eq!(&edited[MAP_LEVEL_BYTES * 2..], &[0xde, 0xad]);
}

#[test]
fn land_map_transposes_native_x_major_storage_into_canonical_rows() {
    let (x, y) = (2, 7);
    let mut source = vec![0; MAP_LEVEL_BYTES];
    let native_offset = native_land_cell_index(x, y) * 2;
    source[native_offset..native_offset + 2].copy_from_slice(&0x1234i16.to_be_bytes());

    let decoded = decode_land_maps(&source);

    assert_eq!(
        decoded.records[0].tiles[canonical_land_cell_index(x, y)],
        0x1234
    );
    assert_eq!(decoded.records[0].tiles[native_land_cell_index(x, y)], 0);
    assert_eq!(
        encode_land_maps(&decoded.records, Some(&source)).unwrap(),
        source
    );
}

#[test]
fn dungeon_map_round_trip_preserves_row_major_words_and_tail() {
    let mut source = vec![0xa5; MAP_LEVEL_BYTES * 2];
    let cell_index = 7 * CLASSIC_MAP_SIZE + 2;
    let offset = MAP_LEVEL_BYTES + cell_index * 2;
    source[offset..offset + 2].copy_from_slice(&0x1234i16.to_be_bytes());
    source.extend_from_slice(&[0xde, 0xad]);

    let mut decoded = decode_dungeon_maps(&source);

    assert_eq!(decoded.records[1].identity, StableId("dungeon:1".into()));
    assert_eq!(decoded.records[1].tiles[cell_index], 0x1234);
    assert_eq!(
        encode_dungeon_maps(&decoded.records, Some(&source)).unwrap(),
        source
    );
    decoded.records[1].tiles[cell_index] = 0x5678;
    let edited = encode_dungeon_maps(&decoded.records, Some(&source)).unwrap();
    assert_eq!(changed_offsets(&source, &edited), vec![offset, offset + 1]);
    assert_eq!(&edited[MAP_LEVEL_BYTES * 2..], &[0xde, 0xad]);
}
