use super::*;

fn source() -> Vec<u8> {
    let mut bytes = vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES];
    bytes[151] = 0xa5;
    bytes[157] = 0x7f;
    for slot in 0..COMPLEX_ENCOUNTER_TEXT_SLOTS {
        let field = &mut bytes[160 + slot * 40..160 + (slot + 1) * 40];
        field.fill(0xa5);
        field[..8].copy_from_slice(&[7, 0x80, 0, 0x8e, 13, 9, b' ', b' ']);
    }
    bytes.extend_from_slice(&[0xde, 0xad, 0x80]);
    bytes
}

#[test]
fn all_nine_pascal_fields_decode_mac_roman_declared_payload_and_keep_exact_source() {
    let source = source();
    let decoded = decode_complex_encounters(&source);
    assert_eq!(decoded.records.len(), 1);
    assert_eq!(decoded.trailing_bytes, [0xde, 0xad, 0x80]);
    for text in &decoded.records[0].texts {
        assert_eq!(text, "\u{c4} \u{e9}\n\t  ");
    }
    assert_eq!(
        encode_complex_encounters(&decoded.records, Some(&source)).unwrap(),
        source
    );
    let mut edited = decoded.records;
    edited[0].authored = true;
    edited[0].prompt_message_native_id = 123;
    let mut expected = source.clone();
    expected[158..160].copy_from_slice(&123_i16.to_be_bytes());
    assert_eq!(
        encode_complex_encounters(&edited, Some(&source)).unwrap(),
        expected
    );
}

#[test]
fn editing_one_text_field_uses_mac_roman_and_preserves_every_other_byte() {
    let source = source();
    for slot in 0..COMPLEX_ENCOUNTER_TEXT_SLOTS {
        let mut records = decode_complex_encounters(&source).records;
        records[0].authored = true;
        records[0].texts[slot] = "\u{e9}\n\u{c4}  ".into();
        let output = encode_complex_encounters(&records, Some(&source)).unwrap();
        let mut expected = source.clone();
        let start = 160 + slot * 40;
        expected[start..start + 40].fill(0);
        expected[start..start + 6].copy_from_slice(&[5, 0x8e, 13, 0x80, b' ', b' ']);
        assert_eq!(output, expected, "text slot {slot}");
        assert_eq!(
            decode_complex_encounters(&output).records[0].texts[slot],
            records[0].texts[slot]
        );
    }
}

#[test]
fn pascal_overlength_prefix_is_bounded_without_rewriting_imported_bytes() {
    let mut source = source();
    source[160] = 255;
    source[161..200].fill(0x8e);
    let mut records = decode_complex_encounters(&source).records;
    assert_eq!(records[0].texts[0], "\u{e9}".repeat(39));
    records[0].authored = true;
    assert_eq!(
        encode_complex_encounters(&records, Some(&source)).unwrap(),
        source
    );
    records[0].texts[0] = "\u{e9}".repeat(38);
    let output = encode_complex_encounters(&records, Some(&source)).unwrap();
    let mut expected = source;
    expected[160..200].fill(0);
    expected[160] = 38;
    expected[161..199].fill(0x8e);
    assert_eq!(output, expected);
}

#[test]
fn new_text_limits_use_mac_roman_bytes_and_reject_nul_or_unrepresentable_text() {
    let mut record = decode_complex_encounters(&vec![0; 520]).records.remove(0);
    record.authored = true;
    record.texts[8] = "\u{e9}".repeat(39);
    let output = encode_complex_encounters(std::slice::from_ref(&record), None).unwrap();
    assert_eq!(output[480], 39);
    assert_eq!(&output[481..520], &[0x8e; 39]);
    record.texts[8].push('\u{e9}');
    assert!(matches!(
        encode_complex_encounters(std::slice::from_ref(&record), None),
        Err(ComplexEncounterCodecError::TextTooLong {
            native_id: NativeRecordId(0),
            slot: 8,
            bytes: 40
        })
    ));
    for text in ["\u{1f409}", "a\0b"] {
        record.texts[8] = text.into();
        assert!(matches!(
            encode_complex_encounters(std::slice::from_ref(&record), None),
            Err(ComplexEncounterCodecError::TextUnrepresentable {
                native_id: NativeRecordId(0),
                slot: 8,
                ..
            })
        ));
    }
}
