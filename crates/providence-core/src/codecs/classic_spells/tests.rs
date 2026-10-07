use super::super::classic_resources::write_resource_fork_preserving_duplicates;
use super::names::spell_name_resource_name;
use super::string_list::{
    decode as decode_string_list_payload, encode as encode_string_list_payload,
};
use super::*;
use crate::codecs::{parse_resource_entries, write_resource_fork};
use crate::{codecs::ResourceEntry, model::BlobId};

fn standard_name_resource_entries() -> Vec<ResourceEntry> {
    let mut entries = Vec::new();
    for class in 1..=STANDARD_SPELL_CLASSES {
        for level_index in 0..7usize {
            let names = (0..SPELL_NAMES_PER_RESOURCE)
                .map(|slot| match (class, level_index, slot) {
                    (1, 0, 7) => "Magic Darts".into(),
                    (4, 5, 9) => String::new(),
                    _ => format!("Spell {class}-{}-{}", level_index + 1, slot + 1),
                })
                .collect::<Vec<_>>();
            entries.push(ResourceEntry {
                resource_type: *b"STR#",
                id: (class * 1000 + level_index) as i16,
                name: format!("Class {class} level {}", level_index + 1),
                attributes: 32,
                data: encode_string_list_payload(&names, level_index).unwrap(),
            });
        }
    }
    entries
}

#[test]
fn standard_data_s_decodes_only_the_four_runtime_classes() {
    let mut source = vec![0; STANDARD_SPELL_BYTES + SCENARIO_SPELL_BYTES];
    source[0] = 255;
    source[STANDARD_SPELL_BYTES - 1] = 7;
    let decoded = decode_standard_spells(&source, None);
    assert_eq!(decoded.spells.len(), STANDARD_SPELL_RECORDS);
    assert_eq!(decoded.trailing_bytes.len(), SCENARIO_SPELL_BYTES);
    assert_eq!(decoded.spells[0].definition.classic_id, 1101);
    assert_eq!(decoded.spells[104].definition.classic_id, 1715);
    assert_eq!(decoded.spells[105].definition.classic_id, 2101);
    assert_eq!(decoded.spells[419].definition.classic_id, 4715);
    assert_eq!(decoded.spells[0].definition.range_min, 255);
    assert!(decoded.trailing_bytes.iter().all(|byte| *byte == 0));
}

#[test]
fn standard_data_s_round_trips_runtime_rows_and_trailing_compatibility_bytes() {
    let mut source = vec![0; STANDARD_SPELL_BYTES + 17];
    source[0] = 255;
    source[STANDARD_SPELL_BYTES - 1] = 7;
    source[STANDARD_SPELL_BYTES..].fill(0xa5);
    let decoded = decode_standard_spells(&source, None);

    assert_eq!(
        encode_standard_spells(&decoded.spells, Some(&source)).expect("encode standard spells"),
        source
    );
}

#[test]
fn standard_names_require_all_twenty_eight_classic_families() {
    let resource = write_resource_fork(&standard_name_resource_entries()).unwrap();
    let text_blob = BlobId("sha256:standard-names".into());
    let mut spells = decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    hydrate_standard_spell_names(&mut spells, &resource, text_blob.clone()).unwrap();
    assert_eq!(spells[7].definition.name, "Magic Darts");
    assert_eq!(
        spells[3 * SPELLS_PER_CLASS + 5 * SPELL_NAMES_PER_RESOURCE + 9]
            .definition
            .name,
        "Unnamed Classic spell 4610"
    );
    assert!(
        spells
            .iter()
            .all(|spell| spell.text_source_blob.as_ref() == Some(&text_blob))
    );

    let mut incomplete = standard_name_resource_entries();
    incomplete.pop();
    let resource = write_resource_fork(&incomplete).unwrap();
    assert_eq!(
        hydrate_standard_spell_names(&mut spells, &resource, text_blob.clone()),
        Err(SpellCodecError::MissingStandardNameResource(4006))
    );
}

#[test]
fn semantic_round_trip_covers_all_thirty_runtime_bytes_and_packed_ids() {
    let source = (0u8..30).collect::<Vec<_>>();
    let decoded = decode_scenario_spells(&source, None);
    assert_eq!(decoded.spells[0].definition.classic_id, 5101);
    assert_eq!(scenario_spell_classic_id(104), Some(5715));
    assert_eq!(decoded.spells[0].definition.to_hit_bonus, 3);
    assert!(decoded.spells[0].definition.in_combat);
    assert!(decoded.spells[0].definition.in_camp);
    let output = encode_scenario_spells(&decoded.spells, Some(&source)).expect("encode");
    assert_eq!(output, source);
    let fresh = encode_scenario_spells(&decoded.spells, None).expect("fresh encode");
    assert_eq!(&fresh[..28], &source[..28]);
    assert_eq!(&fresh[28..30], &[1, 1]);
}

#[test]
fn no_edit_preserves_noncanonical_booleans_and_imported_tail() {
    let mut source = vec![0; SCENARIO_SPELL_BYTES];
    source[28] = 7;
    source[29] = 255;
    source.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    let decoded = decode_scenario_spells(&source, None);
    assert_eq!(decoded.trailing_bytes, [0xde, 0xad, 0xbe, 0xef]);
    assert_eq!(
        encode_scenario_spells(&decoded.spells, Some(&source)).unwrap(),
        source
    );
}

#[test]
fn editing_one_record_regenerates_only_that_fully_owned_row() {
    let source = vec![0; SCENARIO_SPELL_BYTES + 3];
    let mut decoded = decode_scenario_spells(&source, None);
    decoded.spells[17].definition.cost = 41;
    decoded.spells[17].definition.in_combat = true;
    decoded.spells[17].definition.authored = true;
    let output = encode_scenario_spells(&decoded.spells, Some(&source)).unwrap();
    let changed = source
        .iter()
        .zip(&output)
        .enumerate()
        .filter_map(|(index, (before, after))| (before != after).then_some(index))
        .collect::<Vec<_>>();
    assert_eq!(
        changed,
        [17 * SPELL_RECORD_BYTES + 10, 17 * SPELL_RECORD_BYTES + 28]
    );
    assert_eq!(&output[SCENARIO_SPELL_BYTES..], &[0, 0, 0]);
}

#[test]
fn fresh_output_is_fixed_capacity_and_identity_checked() {
    let mut spell = decode_scenario_spells(&[0; SPELL_RECORD_BYTES], None)
        .spells
        .remove(0);
    spell.definition.authored = true;
    assert_eq!(
        encode_scenario_spells(&[spell.clone()], None)
            .unwrap()
            .len(),
        SCENARIO_SPELL_BYTES
    );
    spell.definition.classic_id = 5102;
    assert!(matches!(
        encode_scenario_spells(&[spell], None),
        Err(SpellCodecError::InvalidClassicId { .. })
    ));
}

#[test]
fn fresh_spell_names_create_all_seven_fixed_string_families() {
    let spells = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    let output = encode_scenario_spell_name_resources(&spells, None).expect("encode names");
    let entries = parse_resource_entries(&output).expect("parse names");
    let names = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"STR#")
        .collect::<Vec<_>>();
    assert_eq!(names.len(), 7);
    assert_eq!(names[0].id, 5000);
    assert_eq!(names[6].id, 5006);
    assert_eq!(decode_string_list_payload(&names[0].data).0.len(), 15);
    assert_eq!(
        decode_string_list_payload(&names[0].data).0[0],
        "Custom Spell 0"
    );
    assert_eq!(
        decode_string_list_payload(&names[6].data).0[14],
        "Custom Spell 104"
    );
}

#[test]
fn imported_spell_names_round_trip_exactly_and_one_edit_preserves_other_resources() {
    let entries = imported_spell_name_entries();
    let original = write_resource_fork(&entries).expect("resource fork");
    let text_blob = BlobId("sha256:spell-names".into());
    let mut spells = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    assert!(
        hydrate_scenario_spell_names(&mut spells, &original, text_blob.clone())
            .unwrap()
            .is_empty()
    );
    assert_eq!(spells[2].definition.name, "Ashen Gate");
    assert_eq!(spells[4].definition.name, "Custom Spell 4");
    assert!(
        spells
            .iter()
            .all(|spell| spell.text_source_blob.as_ref() == Some(&text_blob))
    );
    assert_eq!(
        encode_scenario_spell_name_resources(&spells, Some(&original)).unwrap(),
        original
    );

    spells[2].definition.name = "Ashen Gate Revised".into();
    spells[2].name_authored = true;
    let edited =
        encode_scenario_spell_name_resources(&spells, Some(&original)).expect("edit one name");
    let edited_entries = parse_resource_entries(&edited).unwrap();
    let family = edited_entries
        .iter()
        .find(|entry| entry.resource_type == *b"STR#" && entry.id == 5000)
        .unwrap();
    assert_eq!(family.name, "Existing level 0");
    assert_eq!(family.attributes, 71);
    assert_eq!(
        decode_string_list_payload(&family.data).0[2],
        "Ashen Gate Revised"
    );
    assert_eq!(
        edited_entries
            .iter()
            .find(|entry| entry.resource_type == *b"PICT" && entry.id == 77)
            .unwrap(),
        entries.last().unwrap()
    );
}

#[test]
fn spell_name_lists_ignore_duplicate_unowned_resources_and_round_trip_mac_roman() {
    let mut entries = (0..7usize)
        .map(|level_index| {
            let mut names = (0..SPELL_NAMES_PER_RESOURCE)
                .map(|slot| default_scenario_spell_name((level_index * 15 + slot) as u16))
                .collect::<Vec<_>>();
            if level_index == 0 {
                names[0] = "Café—Gate".into();
            }
            ResourceEntry {
                resource_type: *b"STR#",
                id: SPELL_NAME_RESOURCE_MIN_ID + level_index as i16,
                name: spell_name_resource_name(level_index).into(),
                attributes: 32,
                data: encode_string_list_payload(&names, level_index).unwrap(),
            }
        })
        .collect::<Vec<_>>();
    entries.extend([
        ResourceEntry {
            resource_type: *b"PICT",
            id: 30015,
            name: "duplicate image".into(),
            attributes: 0,
            data: vec![1],
        },
        ResourceEntry {
            resource_type: *b"PICT",
            id: 30015,
            name: "duplicate image copy".into(),
            attributes: 0,
            data: vec![2],
        },
    ]);
    let original = write_resource_fork_preserving_duplicates(&entries).unwrap();
    let mut spells = decode_scenario_spells(&vec![0; SCENARIO_SPELL_BYTES], None).spells;
    hydrate_scenario_spell_names(&mut spells, &original, BlobId("sha256:spell".into())).unwrap();
    assert_eq!(spells[0].definition.name, "Café—Gate");
    assert_eq!(
        encode_scenario_spell_name_resources(&spells, Some(&original)).unwrap(),
        original
    );
}

fn imported_spell_name_entries() -> Vec<ResourceEntry> {
    let mut entries = Vec::new();
    for level_index in 0..7usize {
        let names = (0..15)
            .map(|slot| {
                let record = level_index * 15 + slot;
                if record == 2 {
                    "Ashen Gate".into()
                } else if record == 4 {
                    String::new()
                } else {
                    default_scenario_spell_name(record as u16)
                }
            })
            .collect::<Vec<_>>();
        entries.push(ResourceEntry {
            resource_type: *b"STR#",
            id: 5000 + level_index as i16,
            name: format!("Existing level {level_index}"),
            attributes: 71,
            data: encode_string_list_payload(&names, level_index).unwrap(),
        });
    }
    entries.push(ResourceEntry {
        resource_type: *b"PICT",
        id: 77,
        name: "Unrelated".into(),
        attributes: 3,
        data: vec![1, 2, 3],
    });
    entries
}
