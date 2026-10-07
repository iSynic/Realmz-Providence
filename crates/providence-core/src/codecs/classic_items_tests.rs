use super::super::classic_item_text::*;
use super::super::classic_resources::write_resource_fork_preserving_duplicates;
use super::*;
use crate::codecs::write_resource_fork;
use crate::codecs::{
    ResourceEntry, empty_resource_fork, parse_resource_entries_preserving_duplicates,
};
use crate::codecs::{merge_resource_entries, parse_resource_entries};

#[test]
fn standard_catalog_round_trips_all_bytes_and_decodes_external_texts() {
    let mut bytes = vec![0xa5; ITEM_RECORD_BYTES * STANDARD_ITEM_RECORDS];
    for id in 0..STANDARD_ITEM_RECORDS {
        let offset = id * ITEM_RECORD_BYTES + 2;
        bytes[offset..offset + 2].copy_from_slice(&(id as i16).to_be_bytes());
    }
    let texts = item_text_resource();
    let decoded = decode_standard_item_rules(&bytes, &texts, blob('a'), blob('b'))
        .expect("decode standard items");

    assert_eq!(decoded.rules.len(), STANDARD_ITEM_DEFINITIONS);
    assert_eq!(decoded.rules[0].definition.id.0, "classic.item.1");
    assert_eq!(decoded.rules[0].definition.name, "Known 1");
    assert_eq!(decoded.rules[200].definition.name, "Known 201");
    assert!(decoded.warnings.is_empty());
    assert_eq!(
        encode_standard_item_rules(&decoded.rules, &bytes).expect("encode standard items"),
        bytes
    );
}

#[test]
fn edited_standard_item_changes_only_owned_big_endian_fields() {
    let mut bytes = vec![0u8; ITEM_RECORD_BYTES * STANDARD_ITEM_RECORDS];
    for id in 0..STANDARD_ITEM_RECORDS {
        let offset = id * ITEM_RECORD_BYTES + 2;
        bytes[offset..offset + 2].copy_from_slice(&(id as i16).to_be_bytes());
    }
    let mut decoded =
        decode_standard_item_rules(&bytes, &item_text_resource(), blob('a'), blob('b'))
            .expect("decode standard items");
    decoded.rules[36].definition.cost = 0x1234;

    let output = encode_standard_item_rules(&decoded.rules, &bytes).expect("encode edit");
    let changed = bytes
        .iter()
        .zip(&output)
        .enumerate()
        .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
        .collect::<Vec<_>>();

    assert_eq!(
        changed,
        vec![37 * ITEM_RECORD_BYTES + 28, 37 * ITEM_RECORD_BYTES + 29]
    );
}

#[test]
fn edited_standard_item_preserves_spare_words() {
    let mut bytes = vec![0u8; ITEM_RECORD_BYTES * STANDARD_ITEM_RECORDS];
    for id in 0..STANDARD_ITEM_RECORDS {
        let record = &mut bytes[id * ITEM_RECORD_BYTES..(id + 1) * ITEM_RECORD_BYTES];
        record[2..4].copy_from_slice(&(id as i16).to_be_bytes());
        record[56..70].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    }
    let mut decoded =
        decode_standard_item_rules(&bytes, &item_text_resource(), blob('a'), blob('b'))
            .expect("decode standard items");
    decoded.rules[0].definition.cost = 25;

    let output = encode_standard_item_rules(&decoded.rules, &bytes).expect("encode edit");

    assert_eq!(
        &output[ITEM_RECORD_BYTES + 56..ITEM_RECORD_BYTES + 70],
        &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    );
}

#[test]
fn scenario_catalog_preserves_zero_id_aliases_and_spare_words_on_no_edit() {
    let mut bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    for record in bytes.chunks_exact_mut(ITEM_RECORD_BYTES) {
        record[56..70].fill(0xa5);
    }
    let decoded =
        decode_scenario_item_rules(&bytes, None, blob('a'), None).expect("decode scenario items");

    assert_eq!(decoded.rules.len(), 200);
    assert!(
        decoded
            .rules
            .iter()
            .all(|rule| rule.definition.name.is_empty() && rule.text_source_blob.is_none())
    );
    assert_eq!(decoded.rules[0].definition.classic_id, 800);
    assert_eq!(decoded.rules[199].definition.classic_id, 999);
    assert_eq!(
        encode_scenario_item_rules(&decoded.rules, &bytes).expect("encode no edit"),
        bytes
    );
}

#[test]
fn out_of_domain_scenario_item_identity_stays_canonical_without_rewriting_unrelated_bytes() {
    let mut bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    for (record_index, record) in bytes.chunks_exact_mut(ITEM_RECORD_BYTES).enumerate() {
        record[2..4].copy_from_slice(&(800_i16 + record_index as i16).to_be_bytes());
    }
    let last = &mut bytes[199 * ITEM_RECORD_BYTES..200 * ITEM_RECORD_BYTES];
    last[2..4].copy_from_slice(&(-4057_i16).to_be_bytes());
    let mut decoded = decode_scenario_item_rules(&bytes, None, blob('a'), None)
        .expect("decode one malformed stored identity");
    assert_eq!(decoded.rules[199].definition.classic_id, 999);
    assert_eq!(decoded.rules[199].definition.id.0, "classic.item.999");
    assert_eq!(decoded.warnings.len(), 2);
    assert!(
        decoded
            .warnings
            .iter()
            .any(|warning| warning.contains("no item-text resource fork was supplied"))
    );
    assert_eq!(
        encode_scenario_item_rules(&decoded.rules, &bytes).expect("preserve no edit"),
        bytes
    );

    decoded.rules[199].definition.cost = 25;
    let edited = encode_scenario_item_rules(&decoded.rules, &bytes).expect("cost edit");
    assert_eq!(
        &edited[199 * ITEM_RECORD_BYTES + 2..199 * ITEM_RECORD_BYTES + 4],
        &(-4057_i16).to_be_bytes()
    );
    assert_eq!(
        &edited[199 * ITEM_RECORD_BYTES + 28..199 * ITEM_RECORD_BYTES + 30],
        &25_i16.to_be_bytes()
    );
    let mut expected = bytes;
    expected[199 * ITEM_RECORD_BYTES + 28..199 * ITEM_RECORD_BYTES + 30]
        .copy_from_slice(&25_i16.to_be_bytes());
    assert_eq!(edited, expected);
}

#[test]
fn scenario_item_edit_changes_only_owned_fields() {
    let mut bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    for (index, record) in bytes.chunks_exact_mut(ITEM_RECORD_BYTES).enumerate() {
        record[2..4].copy_from_slice(&(800i16 + index as i16).to_be_bytes());
        record[56..70].fill(0xa5);
    }
    let mut decoded =
        decode_scenario_item_rules(&bytes, None, blob('a'), None).expect("decode scenario items");
    decoded.rules[100].definition.damage_bonus = 0x1234;

    let output = encode_scenario_item_rules(&decoded.rules, &bytes).expect("encode edit");
    let changed = bytes
        .iter()
        .zip(&output)
        .enumerate()
        .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
        .collect::<Vec<_>>();

    assert_eq!(
        changed,
        vec![100 * ITEM_RECORD_BYTES + 20, 100 * ITEM_RECORD_BYTES + 21]
    );
    assert_eq!(
        &output[100 * ITEM_RECORD_BYTES + 56..100 * ITEM_RECORD_BYTES + 70],
        &[0xa5; 14]
    );
}

#[test]
fn scenario_item_picture_ids_preserve_signed_words_and_edit_only_the_icon_field() {
    for icon in [i16::MIN, -189, -1, 0, i16::MAX] {
        let mut bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
        bytes[2..4].copy_from_slice(&800i16.to_be_bytes());
        bytes[4..6].copy_from_slice(&icon.to_be_bytes());
        bytes[56..70].fill(0xa5);
        let mut decoded = decode_scenario_item_rules(&bytes, None, blob('a'), None).unwrap();
        assert_eq!(decoded.rules[0].definition.icon_id, i32::from(icon));
        assert_eq!(
            encode_scenario_item_rules(&decoded.rules, &bytes).unwrap(),
            bytes
        );
        decoded.rules[0].definition.icon_id = -164;
        let output = encode_scenario_item_rules(&decoded.rules, &bytes).unwrap();
        let mut expected = bytes.clone();
        expected[4..6].copy_from_slice(&(-164i16).to_be_bytes());
        assert_eq!(output, expected);
        let reopened = decode_scenario_item_rules(&output, None, blob('b'), None).unwrap();
        assert_eq!(reopened.rules[0].definition.icon_id, -164);
    }
}

#[test]
fn scenario_item_text_no_edit_is_exact_and_one_edit_preserves_unrelated_resources() {
    let bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    let text_source = scenario_item_text_resource();
    let mut decoded =
        decode_scenario_item_rules(&bytes, Some(&text_source), blob('a'), Some(blob('b')))
            .expect("decode scenario item text");

    assert_eq!(
        encode_scenario_item_text_resources(&decoded.rules, Some(&text_source))
            .expect("encode no-edit resource"),
        text_source
    );

    decoded.rules[101].definition.name = "Providence Token".into();
    let edited = encode_scenario_item_text_resources(&decoded.rules, Some(&text_source))
        .expect("encode edited resource");
    let entries = parse_resource_entries(&edited).expect("parse edited resource");
    let names = entries
        .iter()
        .find(|entry| entry.resource_type == *b"STR#" && entry.id == 801)
        .expect("identified names");
    assert_eq!(names.name, "Existing item names");
    assert_eq!(names.attributes, 7);
    assert_eq!(
        decode_available_string_list_payload(&names.data).0[101],
        "Providence Token"
    );
    assert!(entries.iter().any(|entry| {
        entry.resource_type == *b"TEXT"
            && entry.id == 42
            && entry.name == "Unrelated"
            && entry.attributes == 3
            && entry.data == b"preserve me"
    }));
}

#[test]
fn scenario_item_text_preserves_unrelated_duplicate_identities_but_rejects_duplicate_text() {
    let bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    let mut entries = parse_resource_entries(&scenario_item_text_resource()).unwrap();
    let unrelated = ResourceEntry {
        resource_type: *b"cicn",
        id: 451,
        name: "First icon".into(),
        attributes: 0,
        data: vec![1],
    };
    entries.push(unrelated.clone());
    entries.push(ResourceEntry {
        name: "Second icon".into(),
        data: vec![2],
        ..unrelated
    });
    let source = write_resource_fork_preserving_duplicates(&entries).unwrap();
    let mut decoded = decode_scenario_item_rules(&bytes, Some(&source), blob('a'), Some(blob('b')))
        .expect("unrelated duplicates cannot hide item text");
    assert_eq!(
        encode_scenario_item_text_resources(&decoded.rules, Some(&source)).unwrap(),
        source
    );
    decoded.rules[0].definition.name = "Edited name".into();
    let edited = encode_scenario_item_text_resources(&decoded.rules, Some(&source)).unwrap();
    assert_eq!(
        parse_resource_entries_preserving_duplicates(&edited)
            .unwrap()
            .iter()
            .filter(|entry| entry.resource_type == *b"cicn" && entry.id == 451)
            .map(|entry| entry.data.clone())
            .collect::<Vec<_>>(),
        vec![vec![1], vec![2]]
    );

    entries.push(
        entries
            .iter()
            .find(|entry| entry.resource_type == *b"STR#" && entry.id == 801)
            .unwrap()
            .clone(),
    );
    let duplicate_text = write_resource_fork_preserving_duplicates(&entries).unwrap();
    assert!(matches!(
        decode_scenario_item_rules(&bytes, Some(&duplicate_text), blob('a'), Some(blob('b'))),
        Err(ItemCodecError::ResourceFork(
            ResourceForkError::DuplicateResource { id: 801, .. }
        ))
    ));
}

#[test]
fn unrelated_scenario_item_resource_fork_is_optional_and_preserved_exactly() {
    let bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    let resource = merge_resource_entries(
        &empty_resource_fork(),
        vec![ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Compatibility note".into(),
            attributes: 3,
            data: b"preserve me".to_vec(),
        }],
    )
    .unwrap();
    let decoded = decode_scenario_item_rules(&bytes, Some(&resource), blob('a'), Some(blob('b')))
        .expect("decode unrelated resource fork without inventing item text");
    assert_eq!(decoded.warnings.len(), 1);
    assert!(decoded.rules.iter().all(|rule| {
        rule.definition.unidentified_name.is_empty()
            && rule.definition.name.is_empty()
            && rule.definition.description.is_empty()
    }));
    assert_eq!(
        encode_scenario_item_text_resources(&decoded.rules, Some(&resource)).unwrap(),
        resource
    );
}

#[test]
fn fresh_scenario_item_text_creates_all_families_and_rejects_lossy_strings() {
    let bytes = vec![0u8; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    let mut decoded =
        decode_scenario_item_rules(&bytes, None, blob('a'), None).expect("decode scenario items");
    decoded.rules[0].definition.name = "First custom item".into();

    let output = encode_scenario_item_text_resources(&decoded.rules, None)
        .expect("encode fresh scenario item resource");
    let entries = parse_resource_entries(&output).expect("parse fresh resource");
    assert_eq!(
        entries
            .iter()
            .filter(|entry| entry.resource_type == *b"STR#")
            .map(|entry| entry.id)
            .collect::<Vec<_>>(),
        vec![800, 801, 802]
    );

    decoded.rules[0].definition.name = "not MacRoman: 🦉".into();
    assert!(matches!(
        encode_scenario_item_text_resources(&decoded.rules, None),
        Err(ItemCodecError::UnsupportedTextCharacter {
            classic_id: 800,
            field: "identified name"
        })
    ));
    decoded.rules[0].definition.name = "x".repeat(256);
    assert!(matches!(
        encode_scenario_item_text_resources(&decoded.rules, None),
        Err(ItemCodecError::TextTooLong {
            classic_id: 800,
            field: "identified name"
        })
    ));
}

fn blob(value: char) -> BlobId {
    BlobId(format!("sha256:{}", value.to_string().repeat(64)))
}

fn item_text_resource() -> Vec<u8> {
    let mut resources = Vec::new();
    for base in [0i16, 200, 400, 600] {
        for offset in 0..=2i16 {
            let strings = (0..200)
                .map(|index| match offset {
                    0 => format!("Unknown {}", i32::from(base) + index),
                    1 => format!("Known {}", i32::from(base) + index),
                    _ => format!("Description {}", i32::from(base) + index),
                })
                .collect::<Vec<_>>();
            resources.push((base + offset, string_list(&strings)));
        }
    }
    resource_fork(&resources)
}

fn scenario_item_text_resource() -> Vec<u8> {
    let mut entries = vec![ResourceEntry {
        resource_type: *b"TEXT",
        id: 42,
        name: "Unrelated".into(),
        attributes: 3,
        data: b"preserve me".to_vec(),
    }];
    for offset in 0..=2i16 {
        let strings = (0..SCENARIO_ITEM_DEFINITIONS)
            .map(|index| match offset {
                0 => format!("Unknown {}", 800 + index),
                1 => format!("Known {}", 800 + index),
                _ => format!("Description {}", 800 + index),
            })
            .collect::<Vec<_>>();
        entries.push(ResourceEntry {
            resource_type: *b"STR#",
            id: 800 + offset,
            name: if offset == 1 {
                "Existing item names".into()
            } else {
                item_text_resource_name(offset).into()
            },
            attributes: if offset == 1 { 7 } else { 0 },
            data: encode_item_text_list(&strings, offset).unwrap(),
        });
    }
    write_resource_fork(&entries).unwrap()
}

fn string_list(strings: &[String]) -> Vec<u8> {
    let mut output = Vec::new();
    output.extend_from_slice(&(strings.len() as u16).to_be_bytes());
    for string in strings {
        output.push(string.len() as u8);
        output.extend_from_slice(string.as_bytes());
    }
    output
}

fn resource_fork(resources: &[(i16, Vec<u8>)]) -> Vec<u8> {
    let mut data = Vec::new();
    let mut offsets = Vec::new();
    for (_, resource) in resources {
        offsets.push(data.len());
        data.extend_from_slice(&(resource.len() as u32).to_be_bytes());
        data.extend_from_slice(resource);
    }
    let data_offset = 16usize;
    let map_offset = data_offset + data.len();
    let type_list_length = 10 + resources.len() * 12;
    let mut map = vec![0; 28];
    map[24..26].copy_from_slice(&28u16.to_be_bytes());
    map[26..28].copy_from_slice(&(28 + type_list_length as u16).to_be_bytes());
    map.extend_from_slice(&0u16.to_be_bytes());
    map.extend_from_slice(b"STR#");
    map.extend_from_slice(&((resources.len() - 1) as u16).to_be_bytes());
    map.extend_from_slice(&10u16.to_be_bytes());
    for ((id, _), offset) in resources.iter().zip(offsets) {
        map.extend_from_slice(&id.to_be_bytes());
        map.extend_from_slice(&(-1i16).to_be_bytes());
        map.push(0);
        map.extend_from_slice(&[
            ((offset >> 16) & 0xff) as u8,
            ((offset >> 8) & 0xff) as u8,
            (offset & 0xff) as u8,
        ]);
        map.extend_from_slice(&0u32.to_be_bytes());
    }
    let mut output = Vec::new();
    output.extend_from_slice(&(data_offset as u32).to_be_bytes());
    output.extend_from_slice(&(map_offset as u32).to_be_bytes());
    output.extend_from_slice(&(data.len() as u32).to_be_bytes());
    output.extend_from_slice(&(map.len() as u32).to_be_bytes());
    output.extend_from_slice(&data);
    output.extend_from_slice(&map);
    output
}
