use super::super::{
    SIMPLE_ENCOUNTER_RECORD_BYTES, decode_simple_encounters, encode_simple_encounters,
};
use crate::model::ClassicAction;

#[test]
fn simple_encounter_no_edit_preserves_annex_and_authored_row_regenerates() {
    let mut source = vec![0xa5; SIMPLE_ENCOUNTER_RECORD_BYTES];
    source[104..106].copy_from_slice(&47i16.to_be_bytes());
    source[106..109].copy_from_slice(&[2, b'G', b'o']);
    source.extend_from_slice(&[0xca, 0xfe]);
    let mut decoded = decode_simple_encounters(&source);
    assert_eq!(
        encode_simple_encounters(&decoded.records, Some(&source)).unwrap(),
        source
    );

    decoded.records[0].authored = true;
    decoded.records[0].prompt_message_native_id = 12;
    decoded.records[0].actions = vec![ClassicAction {
        slot: 3,
        raw_opcode: -1,
        target_native_id: 47,
    }];
    let edited = encode_simple_encounters(&decoded.records, Some(&source)).unwrap();
    assert_eq!(&edited[104..106], &12i16.to_be_bytes());
    assert_eq!(edited[3] as i8, -1);
    assert_eq!(&edited[38..40], &47i16.to_be_bytes());
    assert!(
        edited[109..SIMPLE_ENCOUNTER_RECORD_BYTES]
            .iter()
            .all(|byte| *byte == 0)
    );
    assert_eq!(&edited[SIMPLE_ENCOUNTER_RECORD_BYTES..], &[0xca, 0xfe]);
}
