use super::classic_monsters::*;

#[test]
fn partial_edit_preserves_source_true_byte_name_residue_runtime_fields_and_tail() {
    let mut source = vec![0; MONSTER_RECORD_BYTES];
    source[0] = 3;
    source[118] = 0x7f;
    source[116] = 0xd4;
    source[170..176].copy_from_slice(b"Sentin");
    source[180] = 0xd8;
    source[207] = 0xa5;
    source.extend_from_slice(&[0xde, 0xad]);
    let mut set = decode_monster_set(&source, "Data MD", 0);
    set.monsters[0].armor = 18;
    set.monsters[0].authored = true;
    let output = encode_monster_set(&set, Some(&source)).unwrap();
    let mut expected = source.clone();
    expected[5] = 18;
    assert_eq!(output, expected);
    set.monsters[0].not_on_menu = false;
    expected[118] = 0;
    assert_eq!(encode_monster_set(&set, Some(&source)).unwrap(), expected);
}

#[test]
fn unchanged_description_preserves_pascal_residue_and_changed_name_owns_its_field() {
    let mut source = vec![0; MONSTER_DESCRIPTION_RECORD_BYTES];
    source[0] = 4;
    source[1..5].copy_from_slice(b"Text");
    source[240] = 0xe1;
    source.push(0xa5);
    let mut records = decode_monster_descriptions(&source).records;
    records[0].authored = true;
    assert_eq!(
        encode_monster_descriptions(&records, Some(&source)).unwrap(),
        source
    );
    let mut monster_source = vec![0; MONSTER_RECORD_BYTES];
    monster_source[0] = 1;
    monster_source[170..173].copy_from_slice(b"Old");
    monster_source[200] = 0xa5;
    let mut set = decode_monster_set(&monster_source, "Data MD1", 1);
    set.monsters[0].display_name = "New".into();
    set.monsters[0].authored = true;
    let output = encode_monster_set(&set, Some(&monster_source)).unwrap();
    assert_eq!(&output[..170], &monster_source[..170]);
    assert_eq!(&output[170..173], b"New");
    assert!(output[173..210].iter().all(|byte| *byte == 0));
}
