use super::*;

fn imported_family(stored_id: i16) -> Vec<u8> {
    let mut bytes = vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
    let start = 100 * ITEM_RECORD_BYTES;
    let row = &mut bytes[start..start + ITEM_RECORD_BYTES];
    row[2..4].copy_from_slice(&stored_id.to_be_bytes());
    row[34..36].copy_from_slice(&(-11i16).to_be_bytes());
    row[98..100].copy_from_slice(&9i16.to_be_bytes());
    row[36..40].copy_from_slice(&i32::MIN.to_be_bytes());
    row[40..44].copy_from_slice(&(-7i32).to_be_bytes());
    row[56..70].fill(0xa5);
    bytes
}

fn decoded(bytes: &[u8]) -> Vec<SourcedScenarioItemRule> {
    decode_scenario_item_rules(
        bytes,
        None,
        BlobId(format!("sha256:{}", "a".repeat(64))),
        None,
    )
    .expect("source-derived NI geometry")
    .rules
}

#[test]
fn cost_edit_preserves_identity_aliases_boolean_words_masks_and_unowned_gap() {
    for stored_id in [0, 900, 0x4321] {
        let bytes = imported_family(stored_id);
        let mut rules = decoded(&bytes);
        rules[100].definition.cost = -1234;
        let output = encode_scenario_item_rules(&rules, &bytes).expect("cost edit");
        let mut expected = bytes.clone();
        let offset = 100 * ITEM_RECORD_BYTES + 28;
        expected[offset..offset + 2].copy_from_slice(&(-1234i16).to_be_bytes());
        assert_eq!(output, expected, "stored identity {stored_id}");
    }
}

#[test]
fn explicit_flag_edit_changes_only_that_flag_word() {
    let bytes = imported_family(900);
    for flag in ["magical", "dropOnEmpty"] {
        let mut rules = decoded(&bytes);
        let offset = if flag == "magical" {
            rules[100].definition.magical = false;
            34
        } else {
            rules[100].definition.drop_on_empty = false;
            98
        };
        let output = encode_scenario_item_rules(&rules, &bytes).expect("explicit flag edit");
        let mut expected = bytes.clone();
        let start = 100 * ITEM_RECORD_BYTES + offset;
        expected[start..start + 2].copy_from_slice(&0i16.to_be_bytes());
        assert_eq!(output, expected);
    }
}

#[test]
fn no_edit_and_same_true_flags_preserve_noncanonical_words_exactly() {
    let bytes = imported_family(0x4321);
    let mut rules = decoded(&bytes);
    rules[100].definition.magical = true;
    rules[100].definition.drop_on_empty = true;
    assert_eq!(
        encode_scenario_item_rules(&rules, &bytes).expect("same flags"),
        bytes
    );
}
