use super::*;
use crate::codecs::{decode_scenario_item_rules, write_resource_fork};
use crate::model::BlobId;

fn source(names: Vec<u8>) -> Vec<u8> {
    let entries = (0..3)
        .map(|field| ResourceEntry {
            resource_type: *b"STR#",
            id: 800 + field,
            name: format!("Imported {field}"),
            attributes: 7,
            data: if field == 1 {
                names.clone()
            } else {
                ItemTextRows::empty(200).encode()
            },
        })
        .collect::<Vec<_>>();
    write_resource_fork(&entries).unwrap()
}

fn rules(source: &[u8]) -> Vec<SourcedScenarioItemRule> {
    decode_scenario_item_rules(
        &vec![0; 20_000],
        Some(source),
        BlobId(format!("sha256:{}", "a".repeat(64))),
        Some(BlobId(format!("sha256:{}", "b".repeat(64)))),
    )
    .unwrap()
    .rules
}

fn names(fork: &[u8]) -> Vec<u8> {
    parse_resource_entries_preserving_duplicates(fork)
        .unwrap()
        .into_iter()
        .find(|entry| entry.id == 801)
        .unwrap()
        .data
}

#[test]
fn item_text_decodes_mac_roman_without_trimming_and_preserves_no_edit_bytes() {
    let mut rows = ItemTextRows::empty(205);
    rows.strings[0] = vec![b' ', b'C', b'a', b'f', 0x8e, 0, 13, 9, 1, b' '];
    rows.strings[204] = b"outside the owned item range".to_vec();
    let mut payload = rows.encode();
    payload.extend_from_slice(&[0xaa, 0xbb]);
    let fork = source(payload);
    let definitions = rules(&fork);
    assert_eq!(definitions[0].definition.name, " Café \n\t\u{1} ");
    assert_eq!(
        encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap(),
        fork
    );
}

#[test]
fn one_item_text_edit_preserves_raw_other_rows_extra_rows_and_tail() {
    let mut rows = ItemTextRows::empty(205);
    rows.strings[0] = vec![b' ', 0x8e, 0, 13, b' '];
    rows.strings[204] = b"unowned extra row".to_vec();
    let mut payload = rows.encode();
    payload.extend_from_slice(&[0x81, 0x02]);
    let fork = source(payload);
    let mut definitions = rules(&fork);
    definitions[1].definition.name = "Épée\n".into();
    let output = encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap();
    rows.strings[1] = vec![0x83, b'p', 0x8e, b'e', 13];
    let mut expected = rows.encode();
    expected.extend_from_slice(&[0x81, 0x02]);
    assert_eq!(names(&output), expected);
}

#[test]
fn sparse_item_rules_do_not_clear_unrepresented_text_rows() {
    let mut rows = ItemTextRows::empty(200);
    rows.strings[0] = b"Keep me".to_vec();
    rows.strings[1] = b"Before".to_vec();
    let fork = source(rows.encode());
    let mut definitions = rules(&fork);
    definitions[1].definition.name = "After".into();
    let output = encode_scenario_item_text_resources(&definitions[1..2], Some(&fork)).unwrap();
    rows.strings[1] = b"After".to_vec();
    assert_eq!(names(&output), rows.encode());
}

#[test]
fn truncated_family_retains_partial_row_and_refuses_editing_unavailable_rows() {
    let payload = vec![0, 3, 1, b'A', 4, b'B', b'C'];
    let fork = source(payload.clone());
    let mut definitions = rules(&fork);
    assert_eq!(
        encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap(),
        fork
    );
    definitions[0].definition.name = "É".into();
    let output = encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap();
    let mut expected = payload;
    expected[3] = 0x83;
    assert_eq!(names(&output), expected);
    definitions[1].definition.name = "Unavailable".into();
    let error = encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap_err();
    assert!(
        error
            .to_string()
            .contains("STR# 801 has no complete text row")
    );
}

#[test]
fn legacy_lossy_snapshot_is_preserved_but_explicit_draft_can_choose_its_literal_rendering() {
    let mut rows = ItemTextRows::empty(200);
    rows.strings[0] = vec![b'C', b'a', b'f', 0x8e];
    let fork = source(rows.encode());
    let modern = rules(&fork);
    let mut legacy = modern.clone();
    legacy[0].definition.name = "Caf?".into();
    assert_eq!(
        encode_scenario_item_text_resources(&legacy, Some(&fork)).unwrap(),
        fork
    );
    let output =
        encode_scenario_item_text_resources_for_draft(&legacy, Some(&fork), &modern).unwrap();
    rows.strings[0] = b"Caf?".to_vec();
    assert_eq!(names(&output), rows.encode());
    assert_eq!(rules(&output)[0].definition.name, "Caf?");
}

#[test]
fn mac_roman_limit_counts_encoded_bytes_and_rejects_nul_and_unrepresentable_characters() {
    let fork = source(ItemTextRows::empty(200).encode());
    let mut definitions = rules(&fork);
    definitions[0].definition.name = "é".repeat(255);
    let output = encode_scenario_item_text_resources(&definitions, Some(&fork)).unwrap();
    assert_eq!(
        ItemTextRows::parse(&names(&output)).strings[0],
        vec![0x8e; 255]
    );
    for invalid in ["é".repeat(256), "owl 🦉".into(), "embedded\0nul".into()] {
        definitions[0].definition.name = invalid;
        assert!(encode_scenario_item_text_resources(&definitions, Some(&fork)).is_err());
    }
}
