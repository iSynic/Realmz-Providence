use super::super::{
    ClassicWorldCodecError, EXTRA_ACTION_POINT_RECORD_BYTES, decode_extra_action_points,
    encode_extra_action_points,
};
use super::changed_offsets;
use crate::model::{ExtraActionPoint, NativeRecordId, StableId};

#[test]
fn extra_action_point_round_trip_and_owned_slot_edit_are_exact() {
    let mut source = vec![0; EXTRA_ACTION_POINT_RECORD_BYTES * 2];
    for (row, door_id, level, x, y, chance) in [
        (0usize, 401i32, 1u8, 9u8, 8u8, 75i8),
        (1, 402, 2, 7, 6, 100),
    ] {
        let start = row * EXTRA_ACTION_POINT_RECORD_BYTES;
        source[start..start + 4].copy_from_slice(&door_id.to_be_bytes());
        source[start + 4..start + 8].copy_from_slice(&[level, x, y, chance as u8]);
    }
    let slot = 3usize;
    let start = EXTRA_ACTION_POINT_RECORD_BYTES;
    source[start + 8 + slot * 2..start + 10 + slot * 2].copy_from_slice(&39i16.to_be_bytes());
    source[start + 24 + slot * 2..start + 26 + slot * 2].copy_from_slice(&47i16.to_be_bytes());
    source.extend_from_slice(&[0xca, 0xfe]);

    let mut decoded = decode_extra_action_points(&source);
    assert_eq!(decoded.trailing_bytes, [0xca, 0xfe]);
    assert_eq!(
        encode_extra_action_points(&decoded.records, Some(&source)).unwrap(),
        source
    );

    decoded.records[1].actions[0].target_native_id = 0x1234;
    let edited = encode_extra_action_points(&decoded.records, Some(&source)).unwrap();
    assert_eq!(
        changed_offsets(&source, &edited),
        vec![start + 24 + slot * 2, start + 24 + slot * 2 + 1]
    );
    assert_eq!(
        &edited[EXTRA_ACTION_POINT_RECORD_BYTES * 2..],
        &[0xca, 0xfe]
    );
}

#[test]
fn extra_action_point_encoder_rejects_duplicate_native_ids() {
    let row = ExtraActionPoint {
        identity: StableId("extra-action-point:0".into()),
        native_id: NativeRecordId(0),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 0,
        actions: Vec::new(),
    };
    assert_eq!(
        encode_extra_action_points(&[row.clone(), row], None),
        Err(ClassicWorldCodecError::DuplicateExtraActionPointId(
            NativeRecordId(0)
        ))
    );
}
