use super::string_list::decode as decode_string_list_payload;
use super::*;
use crate::codecs::{parse_resource_entries, write_resource_fork};
use crate::{codecs::ResourceEntry, model::BlobId};

#[test]
fn spell_metadata_and_other_mechanics_preserve_truthy_native_availability() {
    let mut source = vec![0; SCENARIO_SPELL_BYTES];
    source[28] = 2;
    source[29] = 255;
    source[6] = 7;
    source.extend_from_slice(&[0xa1, 0xb2, 0xc3]);
    let mut rows = decode_scenario_spells(&source, None).spells;
    rows[0].definition.name = " New name ".into();
    rows[0].definition.description = "Editor note".into();
    rows[0].definition.authored = true;
    assert_eq!(
        encode_scenario_spells(&rows, Some(&source)).unwrap(),
        source
    );
    rows[0].definition.cost = 255;
    let output = encode_scenario_spells(&rows, Some(&source)).unwrap();
    let mut expected = source.clone();
    expected[10] = 255;
    assert_eq!(output, expected);
    rows[0].definition.in_combat = false;
    expected[28] = 0;
    assert_eq!(
        encode_scenario_spells(&rows, Some(&source)).unwrap(),
        expected
    );
}

#[test]
fn spell_name_edit_preserves_exact_text_sibling_bytes_and_payload_tail() {
    let raw = vec![0, 2, 4, b' ', b'A', 0, b' ', 3, b'B', 1, b' ', 0xde, 0xad];
    let original = write_resource_fork(&[ResourceEntry {
        resource_type: *b"STR#",
        id: 5000,
        name: "Names".into(),
        attributes: 32,
        data: raw.clone(),
    }])
    .unwrap();
    let mut rows = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    hydrate_scenario_spell_names(&mut rows, &original, BlobId("names".into())).unwrap();
    assert_eq!(rows[0].definition.name, " A  ");
    assert_eq!(
        encode_scenario_spell_name_resources(&rows, Some(&original)).unwrap(),
        original
    );
    rows[1].definition.name = " Revised\u{1} ".into();
    rows[1].name_authored = true;
    let fork = encode_scenario_spell_name_resources(&rows, Some(&original)).unwrap();
    let data = &parse_resource_entries(&fork).unwrap()[0].data;
    assert_eq!(&data[..7], &raw[..7]);
    assert_eq!(&data[data.len() - 2..], &[0xde, 0xad]);
    assert_eq!(decode_string_list_payload(data).0[1], " Revised\u{1} ");
}

#[test]
fn spell_name_edit_rejects_incomplete_family_without_reconstructing_it() {
    let original = write_resource_fork(&[ResourceEntry {
        resource_type: *b"STR#",
        id: 5000,
        name: "Names".into(),
        attributes: 32,
        data: vec![0, 2, 1, b'A', 3, b'B'],
    }])
    .unwrap();
    let mut rows = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    rows[0].name_authored = true;
    rows[0].definition.name = "Edited".into();
    assert_eq!(
        encode_scenario_spell_name_resources(&rows, Some(&original)),
        Err(SpellCodecError::TruncatedScenarioNameResource(5000))
    );
}
