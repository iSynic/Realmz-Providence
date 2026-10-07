use super::*;
use crate::model::{NativeRecordId, ScenarioMessage, StableId};

#[test]
fn registry_is_unambiguous_and_bounded() {
    assert_eq!(validate_registry(), Ok(()));
    assert_eq!(RESOURCE_CODEC_REGISTRY.len(), 6);
    let codec = RESOURCE_CODEC_REGISTRY[0];
    assert_eq!(codec.family, NativeFileFamily::ScenarioPictureResources);
    assert_eq!(codec.native_path, "Scenario.rsrc");
    assert_eq!(codec.resource_type, *b"PICT");
    assert_eq!(codec.minimum_resource_id, 30_000);
    assert_eq!(codec.maximum_resource_id, 30_128);
    assert!(codec.payload_is_fully_owned);
    let sound = RESOURCE_CODEC_REGISTRY[1];
    assert_eq!(sound.family, NativeFileFamily::ScenarioSoundResources);
    assert_eq!(sound.native_path, "Scenario.rsrc");
    assert_eq!(sound.resource_type, *b"snd ");
    assert_eq!(sound.minimum_resource_id, 200);
    assert_eq!(sound.maximum_resource_id, 500);
    assert!(sound.payload_is_fully_owned);
    let icon = RESOURCE_CODEC_REGISTRY[2];
    assert_eq!(icon.family, NativeFileFamily::ScenarioIconResources);
    assert_eq!(icon.native_path, "Scenario.rsrc");
    assert_eq!(icon.resource_type, *b"cicn");
    assert_eq!(icon.minimum_resource_id, 1);
    assert_eq!(icon.maximum_resource_id, i16::MAX);
    assert!(icon.payload_is_fully_owned);
    let special_land = RESOURCE_CODEC_REGISTRY[3];
    assert_eq!(
        special_land.family,
        NativeFileFamily::SpecialLandTileResources
    );
    assert_eq!(special_land.native_path, "Scenario.rsrc");
    assert_eq!(special_land.resource_type, *b"cicn");
    assert_eq!(special_land.minimum_resource_id, i16::MIN);
    assert_eq!(special_land.maximum_resource_id, -1);
    assert!(special_land.payload_is_fully_owned);
    let player_map_names = RESOURCE_CODEC_REGISTRY[4];
    assert_eq!(
        player_map_names.family,
        NativeFileFamily::PlayerMapNameResources
    );
    assert_eq!(player_map_names.native_path, "Scenario.rsrc");
    assert_eq!(player_map_names.resource_type, *b"STR#");
    assert_eq!(player_map_names.minimum_resource_id, -102);
    assert_eq!(player_map_names.maximum_resource_id, -101);
    assert!(player_map_names.payload_is_fully_owned);
    let text = RESOURCE_CODEC_REGISTRY[5];
    assert_eq!(text.family, NativeFileFamily::ScenarioTextResources);
    assert_eq!(text.native_path, "Scenario.rsrc");
    assert_eq!(text.resource_type, *b"TEXT");
    assert_eq!(text.minimum_resource_id, i16::MIN);
    assert_eq!(text.maximum_resource_id, i16::MAX);
    assert!(text.payload_is_fully_owned);
}

#[test]
fn first_seam_records_source_backed_data_sd2_geometry() {
    let codec = descriptor(NativeFileFamily::ScenarioMessages);

    assert_eq!(codec.native_path, "Data SD2");
    assert_eq!(codec.record_bytes, 256);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 256 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn message_encoding_inspection_matches_the_mac_roman_replacement_policy() {
    assert_eq!(
        inspect_message_text_encoding("Café 🐉"),
        MessageEncodingInspection {
            encoded_bytes: 6,
            replacement_characters: 1,
        }
    );
    let long = "x".repeat(256);
    assert_eq!(inspect_message_text_encoding(&long).encoded_bytes, 256);
    let message = ScenarioMessage {
        identity: StableId("message:7".into()),
        native_id: NativeRecordId(7),
        text: long,
        authored: true,
    };
    assert_eq!(
        encode_messages(&[message], None),
        Err(MessageCodecError::TextTooLong {
            native_id: NativeRecordId(7),
            bytes: 256,
        })
    );
}

#[test]
fn land_layout_codec_owns_only_the_exact_runtime_grid() {
    let codec = descriptor(NativeFileFamily::LandLayout);

    assert_eq!(codec.native_path, "Layout");
    assert_eq!(codec.record_bytes, 256);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 256 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::OverlayOwnedBytes
    );
}

#[test]
fn player_map_codec_excludes_the_preserve_only_spare_word() {
    let codec = descriptor(NativeFileFamily::PlayerMaps);

    assert_eq!(codec.native_path, "Data MD2");
    assert_eq!(codec.record_bytes, 340);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 74 },
            OwnedByteRange {
                start: 76,
                end: 340
            }
        ]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn dungeon_map_codec_owns_exact_data_dl_rows() {
    let codec = descriptor(NativeFileFamily::DungeonMaps);
    assert_eq!(codec.native_path, "Data DL");
    assert_eq!(codec.record_bytes, 16_200);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange {
            start: 0,
            end: 16_200
        }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn dungeon_random_level_codec_excludes_only_native_padding() {
    let codec = descriptor(NativeFileFamily::DungeonRandomLevels);
    assert_eq!(codec.native_path, "Data RDD");
    assert_eq!(codec.record_bytes, 644);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 563 },
            OwnedByteRange {
                start: 564,
                end: 644
            }
        ]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn land_random_level_codec_uses_the_same_bounded_native_layout() {
    let codec = descriptor(NativeFileFamily::LandRandomLevels);
    assert_eq!(codec.native_path, "Data RD");
    assert_eq!(codec.record_bytes, 644);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 563 },
            OwnedByteRange {
                start: 564,
                end: 644
            }
        ]
    );
}

#[test]
fn dungeon_action_point_codec_owns_exact_data_ddd_rows() {
    let codec = descriptor(NativeFileFamily::DungeonActionPoints);
    assert_eq!(codec.native_path, "Data DDD");
    assert_eq!(codec.record_bytes, 40);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 40 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn option_label_seam_records_complete_data_od_row_ownership() {
    let codec = descriptor(NativeFileFamily::OptionLabels);
    assert_eq!(codec.native_path, "Data OD");
    assert_eq!(codec.record_bytes, 25);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 25 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn race_rule_seam_records_source_backed_data_race_geometry() {
    let codec = descriptor(NativeFileFamily::RaceRules);

    assert_eq!(codec.native_path, "Data Race");
    assert_eq!(codec.record_bytes, 408);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 96 },
            OwnedByteRange {
                start: 112,
                end: 346
            }
        ]
    );
}

#[test]
fn caste_rule_seam_records_source_backed_data_caste_geometry() {
    let codec = descriptor(NativeFileFamily::CasteRules);
    assert_eq!(codec.native_path, "Data Caste");
    assert_eq!(codec.record_bytes, 576);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 240 },
            OwnedByteRange {
                start: 248,
                end: 448
            }
        ]
    );
}

#[test]
fn scenario_support_is_explicitly_preserve_only() {
    let codec = descriptor(NativeFileFamily::ScenarioSupport);
    assert_eq!(codec.native_path, "Scenario");
    assert_eq!(codec.record_bytes, 600);
    assert!(codec.owned_byte_ranges.is_empty());
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::PreserveOnly
    );
}

#[test]
fn item_rule_seam_preserves_the_classic_spare_words() {
    let codec = descriptor(NativeFileFamily::ItemDefinitions);
    assert_eq!(codec.native_path, "Data ID");
    assert_eq!(codec.record_bytes, 100);
    assert_eq!(
        codec.owned_byte_ranges,
        [
            OwnedByteRange { start: 0, end: 56 },
            OwnedByteRange {
                start: 70,
                end: 100
            }
        ]
    );
}

#[test]
fn scenario_item_seam_uses_the_same_bounded_itemattr_ownership() {
    let codec = descriptor(NativeFileFamily::ScenarioItemDefinitions);
    assert_eq!(codec.native_path, "Data NI");
    assert_eq!(codec.record_bytes, 100);
    assert_eq!(
        codec.owned_byte_ranges,
        ITEM_DEFINITION_CODEC.owned_byte_ranges
    );
}

#[test]
fn standard_spell_seam_records_the_runtime_owned_data_s_rows() {
    let codec = descriptor(NativeFileFamily::StandardSpellDefinitions);
    assert_eq!(codec.native_path, "Data S");
    assert_eq!(codec.record_bytes, 30);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 30 }]
    );
}

#[test]
fn extra_code_seam_records_source_backed_data_edcd_geometry() {
    let codec = descriptor(NativeFileFamily::ExtraCodes);

    assert_eq!(codec.native_path, "Data EDCD");
    assert_eq!(codec.record_bytes, 10);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 10 }]
    );
}

#[test]
fn battle_seam_records_complete_data_bd_row_ownership() {
    let codec = descriptor(NativeFileFamily::BattleRecords);
    assert_eq!(codec.native_path, "Data BD");
    assert_eq!(codec.record_bytes, 346);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 346 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn treasure_seam_records_complete_data_td_row_ownership() {
    let codec = descriptor(NativeFileFamily::TreasureRecords);
    assert_eq!(codec.native_path, "Data TD");
    assert_eq!(codec.record_bytes, 48);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 48 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn shop_seam_records_complete_data_sd_row_ownership() {
    let codec = descriptor(NativeFileFamily::ShopRecords);
    assert_eq!(codec.native_path, "Data SD");
    assert_eq!(codec.record_bytes, 3002);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange {
            start: 0,
            end: 3002
        }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn complex_encounter_seam_records_complete_data_ed2_row_ownership() {
    let codec = descriptor(NativeFileFamily::ComplexEncounters);
    assert_eq!(codec.native_path, "Data ED2");
    assert_eq!(codec.record_bytes, 520);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 520 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn rogue_encounter_seam_records_complete_data_td2_row_ownership() {
    let codec = descriptor(NativeFileFamily::RogueEncounters);
    assert_eq!(codec.native_path, "Data TD2");
    assert_eq!(codec.record_bytes, 118);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 118 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::RegenerateEditedRow
    );
}

#[test]
fn timed_encounter_seam_records_partial_data_td3_ownership() {
    let codec = descriptor(NativeFileFamily::TimedEncounters);
    assert_eq!(codec.native_path, "Data TD3");
    assert_eq!(codec.record_bytes, 40);
    assert_eq!(
        codec.owned_byte_ranges,
        [OwnedByteRange { start: 0, end: 22 }]
    );
    assert_eq!(
        codec.compatibility_overlay,
        CompatibilityOverlayPolicy::OverlayOwnedBytes
    );
}

#[test]
fn imported_no_edit_round_trip_preserves_rows_and_trailing_bytes() {
    let mut source = vec![0xa5; SCENARIO_MESSAGE_CODEC.record_bytes * 2];
    source[0] = 1;
    source[1] = b'Z';
    source[SCENARIO_MESSAGE_CODEC.record_bytes] = 1;
    source[SCENARIO_MESSAGE_CODEC.record_bytes + 1] = b'X';
    source.extend_from_slice(&[0xde, 0xad, 0xbe]);

    let decoded = decode_messages(&source);
    let output = encode_messages(&decoded.messages, Some(&source)).expect("round trip");

    assert_eq!(output, source);
    assert_eq!(decoded.trailing_bytes, [0xde, 0xad, 0xbe]);
}

#[test]
fn edited_import_changes_only_its_owned_row_and_preserves_tail() {
    let mut source = vec![0xa5; SCENARIO_MESSAGE_CODEC.record_bytes * 2];
    source[0] = 1;
    source[1] = b'Z';
    source[SCENARIO_MESSAGE_CODEC.record_bytes] = 1;
    source[SCENARIO_MESSAGE_CODEC.record_bytes + 1] = b'X';
    source.extend_from_slice(&[0xde, 0xad, 0xbe]);
    let mut decoded = decode_messages(&source);
    decoded.messages[1].text = "Go".into();
    decoded.messages[1].authored = true;

    let output = encode_messages(&decoded.messages, Some(&source)).expect("edited compile");

    assert_eq!(
        &output[..SCENARIO_MESSAGE_CODEC.record_bytes],
        &source[..SCENARIO_MESSAGE_CODEC.record_bytes]
    );
    let edited =
        &output[SCENARIO_MESSAGE_CODEC.record_bytes..SCENARIO_MESSAGE_CODEC.record_bytes * 2];
    assert_eq!(&edited[..3], b"\x02Go");
    assert!(edited[3..].iter().all(|byte| *byte == 0));
    assert_eq!(
        &output[SCENARIO_MESSAGE_CODEC.record_bytes * 2..],
        &[0xde, 0xad, 0xbe]
    );
}

#[test]
fn sparse_authored_messages_compile_deterministic_zero_gaps() {
    let messages = vec![ScenarioMessage {
        identity: StableId("message:2".into()),
        native_id: NativeRecordId(2),
        text: "Third".into(),
        authored: true,
    }];

    let output = encode_messages(&messages, None).expect("fresh compile");

    assert_eq!(output.len(), SCENARIO_MESSAGE_CODEC.record_bytes * 3);
    assert!(
        output[..SCENARIO_MESSAGE_CODEC.record_bytes * 2]
            .iter()
            .all(|byte| *byte == 0)
    );
    assert_eq!(
        &output[SCENARIO_MESSAGE_CODEC.record_bytes * 2..][..6],
        b"\x05Third"
    );
}

#[test]
fn message_writer_rejects_more_than_255_classic_bytes() {
    let message = ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "x".repeat(256),
        authored: true,
    };

    assert!(matches!(
        encode_messages(&[message], None),
        Err(MessageCodecError::TextTooLong { bytes: 256, .. })
    ));
}
