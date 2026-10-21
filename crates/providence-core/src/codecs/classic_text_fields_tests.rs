use super::*;

#[test]
fn simple_prompt_edit_preserves_noncanonical_flags_slack_and_tail() {
    let mut source = vec![0xa5; SIMPLE_ENCOUNTER_RECORD_BYTES];
    source[106..111].copy_from_slice(&[4, 0x8e, b' ', 1, b' ']);
    source.extend_from_slice(&[0xca, 0xfe]);
    let mut record = decode_simple_encounters(&source).records.remove(0);
    assert_eq!(record.texts[0], "é \u{1} ");
    record.authored = true;
    record.prompt_message_native_id = 12;
    let output = encode_simple_encounters(&[record], Some(&source)).unwrap();
    assert_eq!(&output[..104], &source[..104]);
    assert_eq!(&output[106..], &source[106..]);
    assert_eq!(&output[104..106], &12i16.to_be_bytes());
}

#[test]
fn simple_macroman_edit_counts_native_bytes_and_rejects_substitution() {
    let source = vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES];
    let mut record = decode_simple_encounters(&source).records.remove(0);
    record.authored = true;
    record.texts[0] = "é".repeat(79);
    let output = encode_simple_encounters(&[record.clone()], Some(&source)).unwrap();
    assert_eq!(output[106], 79);
    assert_eq!(&output[107..186], &[0x8e; 79]);
    assert_eq!(
        decode_simple_encounters(&output).records[0].texts,
        record.texts
    );
    record.texts[0].push('é');
    assert!(encode_simple_encounters(&[record.clone()], None).is_err());
    record.texts[0] = "☃".into();
    assert!(encode_simple_encounters(&[record], None).is_err());
}

#[test]
fn complex_macroman_edit_preserves_other_fields_and_invalid_untouched_length() {
    let mut source = vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES];
    source[157] = 0xc7;
    source[200] = 255;
    source[201..240].fill(0x8e);
    let mut record = decode_complex_encounters(&source).records.remove(0);
    record.authored = true;
    record.texts[0] = "é".repeat(39);
    let output = encode_complex_encounters(&[record.clone()], Some(&source)).unwrap();
    assert_eq!(&output[..160], &source[..160]);
    assert_eq!(&output[200..], &source[200..]);
    assert_eq!(
        decode_complex_encounters(&output).records[0].texts,
        record.texts
    );
    record.texts[0].push('é');
    assert!(encode_complex_encounters(&[record.clone()], None).is_err());
    record.texts[0] = "☃".into();
    assert!(encode_complex_encounters(&[record], None).is_err());
}

#[test]
fn monster_text_handles_macroman_and_preserves_untouched_fixed_name_bytes() {
    let mut source = vec![0; MONSTER_RECORD_BYTES];
    source[118] = 0x7f;
    source[170..174].copy_from_slice(&[0x8e, b' ', 0, 0x91]);
    let mut record = decode_monsters(&source, "Data MD", 0).records.remove(0);
    assert_eq!(record.display_name, "é ");
    record.authored = true;
    record.hit_dice = 4;
    let output = encode_monsters(&[record.clone()], "Data MD", Some(&source)).unwrap();
    assert_eq!(&output[1..], &source[1..]);
    record.display_name = "é".repeat(40);
    let output = encode_monsters(&[record.clone()], "Data MD", Some(&source)).unwrap();
    assert_eq!(&output[170..210], &[0x8e; 40]);
    record.display_name = "☃".into();
    assert!(encode_monsters(&[record], "Data MD", None).is_err());
}

#[test]
fn monster_pascal_description_retains_whitespace_and_control_bytes() {
    let mut source = vec![0; MONSTER_DESCRIPTION_RECORD_BYTES];
    source[..5].copy_from_slice(&[4, 0x8e, 1, b' ', b' ']);
    source[200] = 0x7a;
    let mut record = decode_monster_descriptions(&source).records.remove(0);
    assert_eq!(record.text, "é\u{1}  ");
    record.authored = true;
    assert_eq!(
        encode_monster_descriptions(&[record.clone()], Some(&source)).unwrap(),
        source
    );
    record.text = "é".repeat(255);
    let output = encode_monster_descriptions(&[record], Some(&source)).unwrap();
    assert_eq!(output, [vec![255], vec![0x8e; 255]].concat());
}

#[test]
fn native_macroman_text_reaches_rebuilt_projections_without_trimming() {
    use crate::model::{NativeRecordId, ProjectSnapshot, ScenarioMessage, StableId};
    use crate::rebuilt::{
        project_rebuilt_monster_catalog, project_rebuilt_v3_complex_encounters,
        project_rebuilt_v3_simple_encounters,
    };
    let expected = " é\n ";
    let pascal = [4, b' ', 0x8e, 13, b' '];
    let mut snapshot = ProjectSnapshot::new_authored(StableId("native-text-projection".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: expected.into(),
        authored: true,
    });
    let mut simple = vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES];
    simple[106..111].copy_from_slice(&pascal);
    let mut encounter = decode_simple_encounters(&simple).records.remove(0);
    encounter.choice_results[0] = 1;
    snapshot.simple_encounters.push(encounter);
    let mut complex = vec![0; COMPLEX_ENCOUNTER_RECORD_BYTES];
    complex[160..165].copy_from_slice(&pascal);
    snapshot.complex_encounters = decode_complex_encounters(&complex).records;
    let mut monster = vec![0; MONSTER_RECORD_BYTES];
    monster[170..174].copy_from_slice(&pascal[1..]);
    snapshot
        .monster_sets
        .push(decode_monster_set(&monster, "Data MD", 0));
    let simple = project_rebuilt_v3_simple_encounters(&snapshot).unwrap();
    let complex = project_rebuilt_v3_complex_encounters(&snapshot).unwrap();
    let monsters = project_rebuilt_monster_catalog(&snapshot).unwrap();
    assert_eq!(simple.simple_encounters[0].responses[0].label, expected);
    assert_eq!(simple.messages[0].text, expected);
    assert_eq!(complex.complex_encounters[0].texts[0], expected);
    assert_eq!(monsters.monsters[0].name, expected);
    let json = serde_json::to_vec(&complex.complex_encounters).unwrap();
    let reopened: serde_json::Value = serde_json::from_slice(&json).unwrap();
    assert_eq!(reopened[0]["texts"][0], expected);
}
