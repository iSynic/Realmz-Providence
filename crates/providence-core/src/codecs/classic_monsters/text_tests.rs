use super::*;

fn native_name_source() -> Vec<u8> {
    let mut source = vec![0xa5; MONSTER_RECORD_BYTES];
    source[170..177].copy_from_slice(&[b'C', b'a', b'f', 0x8e, b' ', b' ', 0]);
    source.extend_from_slice(&[0xde, 0xad, 0x80]);
    source
}

fn native_description_source() -> Vec<u8> {
    let mut source = vec![0xa5; 2 * MONSTER_DESCRIPTION_RECORD_BYTES];
    source[..9].copy_from_slice(&[8, 0x80, 0, b'B', 13, 9, 0x8e, b' ', b' ']);
    source[256] = 0;
    source.extend_from_slice(&[0xff, 0x80, 0]);
    source
}

#[test]
fn c_name_decodes_mac_roman_without_trimming_and_retains_post_nul_source() {
    let source = native_name_source();
    let decoded = decode_monsters(&source, "Data MD", -1);
    assert_eq!(decoded.records[0].display_name, "Caf\u{e9}  ");
    assert_eq!(decoded.trailing_bytes, [0xde, 0xad, 0x80]);
    assert_eq!(
        encode_monsters(&decoded.records, "Data MD", Some(&source)).unwrap(),
        source
    );

    let mut edited = decoded.records;
    edited[0].authored = true;
    edited[0].hit_dice = 12;
    let mut expected = source.clone();
    expected[0] = 12;
    assert_eq!(
        encode_monsters(&edited, "Data MD", Some(&source)).unwrap(),
        expected
    );
}

#[test]
fn edited_name_encodes_mac_roman_and_only_replaces_its_fixed_field() {
    let source = native_name_source();
    let mut decoded = decode_monsters(&source, "Data MD1", 1).records;
    decoded[0].authored = true;
    decoded[0].display_name = "\u{c4}r\u{e9}  ".into();
    let output = encode_monsters(&decoded, "Data MD1", Some(&source)).unwrap();
    let mut expected = source;
    expected[170..210].fill(0);
    expected[170..175].copy_from_slice(&[0x80, b'r', 0x8e, b' ', b' ']);
    assert_eq!(output, expected);
    assert_eq!(
        decode_monsters(&output, "Data MD1", 1).records[0].display_name,
        "\u{c4}r\u{e9}  "
    );
}

#[test]
fn pascal_description_uses_declared_length_including_nul_and_whitespace() {
    let source = native_description_source();
    let mut decoded = decode_monster_descriptions(&source);
    assert_eq!(decoded.records[0].text, "\u{c4} B\n\t\u{e9}  ");
    assert_eq!(decoded.records[1].text, "");
    assert_eq!(decoded.trailing_bytes, [0xff, 0x80, 0]);
    assert_eq!(
        encode_monster_descriptions(&decoded.records, Some(&source)).unwrap(),
        source
    );
    decoded.records[0].authored = true;
    assert_eq!(
        encode_monster_descriptions(&decoded.records, Some(&source)).unwrap(),
        source
    );
}

#[test]
fn edited_description_encodes_mac_roman_cr_and_leaves_other_rows_and_tail() {
    let source = native_description_source();
    let mut decoded = decode_monster_descriptions(&source).records;
    decoded[0].authored = true;
    decoded[0].text = "\u{e9}\n\u{c4}  ".into();
    let output = encode_monster_descriptions(&decoded, Some(&source)).unwrap();
    let mut expected = source;
    expected[..256].fill(0);
    expected[..6].copy_from_slice(&[5, 0x8e, 13, 0x80, b' ', b' ']);
    assert_eq!(output, expected);
    assert_eq!(
        decode_monster_descriptions(&output).records[0].text,
        "\u{e9}\n\u{c4}  "
    );
}

#[test]
fn monster_text_limits_count_encoded_bytes_without_truncation() {
    let mut name = decode_monsters(&vec![0; 210], "Data MD", 0)
        .records
        .remove(0);
    name.authored = true;
    name.display_name = "\u{e9}".repeat(40);
    let output = encode_monsters(std::slice::from_ref(&name), "Data MD", None).unwrap();
    assert_eq!(&output[170..210], &[0x8e; 40]);
    assert_eq!(
        decode_monsters(&output, "Data MD", 0).records[0].display_name,
        name.display_name
    );
    name.display_name.push('\u{e9}');
    assert!(matches!(
        encode_monsters(&[name], "Data MD", None),
        Err(MonsterCodecError::DisplayNameTooLong { bytes: 41, .. })
    ));

    let mut description = MonsterDescription {
        identity: StableId("monster-description:0".into()),
        native_id: NativeRecordId(0),
        text: "\u{e9}".repeat(255),
        authored: true,
    };
    let output = encode_monster_descriptions(std::slice::from_ref(&description), None).unwrap();
    assert_eq!(output[0], 255);
    assert_eq!(&output[1..], &[0x8e; 255]);
    assert_eq!(
        decode_monster_descriptions(&output).records[0].text,
        description.text
    );
    description.text.push('\u{e9}');
    assert!(matches!(
        encode_monster_descriptions(&[description], None),
        Err(MonsterCodecError::DescriptionTooLong { bytes: 256, .. })
    ));
}

#[test]
fn new_monster_text_rejects_unrepresentable_characters_and_nul() {
    for text in ["\u{1f409}", "before\0after"] {
        let mut name = decode_monsters(&vec![0; 210], "Data MD", 0)
            .records
            .remove(0);
        name.authored = true;
        name.display_name = text.into();
        assert!(matches!(
            encode_monsters(&[name], "Data MD", None),
            Err(MonsterCodecError::TextUnrepresentable {
                native_id: NativeRecordId(0),
                ..
            })
        ));
        let description = MonsterDescription {
            identity: StableId("monster-description:0".into()),
            native_id: NativeRecordId(0),
            text: text.into(),
            authored: true,
        };
        assert!(matches!(
            encode_monster_descriptions(&[description], None),
            Err(MonsterCodecError::TextUnrepresentable {
                native_id: NativeRecordId(0),
                ..
            })
        ));
    }
}
