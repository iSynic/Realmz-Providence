use crate::codecs::{
    SHOP_RECORD_BYTES, SIMPLE_ENCOUNTER_RECORD_BYTES, TIMED_ENCOUNTER_RECORD_BYTES,
};
use crate::model::ClassicSourceBlob;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

use super::*;
use crate::codecs::{ResourceEntry, write_resource_fork};
use crate::model::{BlobId, CampaignMetadata, ScenarioStartupAuthoring, StableId};

fn declaration(path: &str, bytes: &[u8]) -> ClassicSourceBlob {
    ClassicSourceBlob {
        native_path: path.into(),
        blob: BlobId(format!("sha256:{:x}", Sha256::digest(bytes))),
        byte_length: bytes.len() as u64,
    }
}

fn project_sources(
    sources: Vec<ClassicSourceBlob>,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
) -> Result<RebuiltV7ClassicRecords, String> {
    let mut snapshot = crate::model::ProjectSnapshot::new_authored(StableId(
        "native-record-source-layout-test".into(),
    ));
    snapshot.classic_sources = sources;
    project_rebuilt_v7_classic_records(&snapshot, retained_bytes)
}

#[test]
fn resource_type_bytes_preserve_nul_and_high_bytes_in_json_roundtrip() {
    let resource_type_bytes = [0, 0x7f, 0x80, 0xff];
    let source_bytes = write_resource_fork(&[ResourceEntry {
        resource_type: resource_type_bytes,
        id: -7,
        name: String::new(),
        attributes: 0,
        data: vec![0, 0x80, 0xff],
    }])
    .unwrap();
    for path in [
        "Scenario.rsrc",
        "Scenario.rsf",
        "._Scenario",
        "nested/.rsrc/Scenario",
    ] {
        let records = project_sources(
            vec![declaration(path, &source_bytes)],
            &BTreeMap::from([(path.into(), source_bytes.clone())]),
        )
        .unwrap();

        assert_eq!(records.resources.len(), 1);
        assert_eq!(
            records.resources[0].resource_type_bytes,
            resource_type_bytes
        );

        let encoded = serde_json::to_vec(&records).unwrap();
        assert!(
            !encoded.contains(&0),
            "JSON output must not contain raw NULs"
        );
        let value: serde_json::Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(
            value["resources"][0]["resourceTypeBytes"],
            serde_json::json!([0, 127, 128, 255])
        );
        let decoded: RebuiltV7ClassicRecords = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(decoded, records);
    }
}

#[test]
fn retains_signed_simple_fields_fixed_slots_and_partial_layout_metadata() {
    let mut bytes = vec![0; SIMPLE_ENCOUNTER_RECORD_BYTES + 3];
    bytes[0] = 0xff;
    bytes[32..34].copy_from_slice(&(-123i16).to_be_bytes());
    bytes[100] = 0x10;
    bytes[101] = 0xf1;
    bytes[102] = 0xe2;
    bytes[103] = 0xd3;
    bytes[104..106].copy_from_slice(&(-321i16).to_be_bytes());
    bytes[106] = 0x80;
    let declaration = declaration("Data ED", &bytes);
    let result = project_sources(
        vec![declaration],
        &BTreeMap::from([("Data ED".into(), bytes)]),
    )
    .unwrap();
    assert_eq!(
        result.simple[0].codes,
        vec![-1; 1]
            .into_iter()
            .chain(std::iter::repeat_n(0, 31))
            .collect::<Vec<_>>()
    );
    assert_eq!(result.simple[0].operands[0], -123);
    assert_eq!(result.simple[0].can_back_out_byte, 0x10);
    assert_eq!(result.simple[0].max_times, -15);
    assert_eq!(result.simple[0].caste_success, -30);
    assert_eq!(result.simple[0].reserved_byte, 0xd3);
    assert_eq!(result.simple[0].prompt_message_id, -321);
    assert_eq!(result.simple[0].text_slots.len(), 4);
    assert!(
        result.simple[0]
            .text_slots
            .iter()
            .all(|slot| slot.len() == 80)
    );
    assert_eq!(result.simple[0].text_slots[0][0], 0x80);
    assert_eq!(result.sources[0].layouts[0].complete_records, 1);
    assert_eq!(result.sources[0].layouts[0].trailing_bytes, 3);
}

#[test]
fn absent_source_has_no_fabricated_metadata_and_hash_mismatch_fails() {
    assert!(
        project_sources(vec![], &BTreeMap::new())
            .unwrap()
            .sources
            .is_empty()
    );
    let bytes = vec![0; 2];
    let mut bad = declaration("Data ED", &bytes);
    bad.blob = BlobId(format!("sha256:{}", "0".repeat(64)));
    assert!(project_sources(vec![bad], &BTreeMap::from([("Data ED".into(), bytes)])).is_err());
}

#[test]
fn projects_every_shop_slot_and_signed_timed_word() {
    let mut timed = vec![0; TIMED_ENCOUNTER_RECORD_BYTES];
    timed[..2].copy_from_slice(&(-9i16).to_be_bytes());
    let mut shop = vec![0; SHOP_RECORD_BYTES];
    shop[..2].copy_from_slice(&(-4i16).to_be_bytes());
    shop[2000] = 255;
    let sources = [
        declaration("Data SD", &shop),
        declaration("Data TD3", &timed),
    ];
    let bytes = BTreeMap::from([("Data SD".into(), shop), ("Data TD3".into(), timed)]);
    let result = project_sources(sources.to_vec(), &bytes).unwrap();
    assert_eq!(result.timed[0].words[0], -9);
    assert_eq!(result.shops[0].item_ids.len(), 1000);
    assert_eq!(result.shops[0].item_ids[0], -4);
    assert_eq!(result.shops[0].quantities.len(), 1000);
    assert_eq!(result.shops[0].quantities[0], 255);
}

#[test]
fn projects_action_rows_with_signed_values_and_empty_rows() {
    let records = program_facts_fixture();
    let land = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data DD" && program.id == 0)
        .unwrap();
    assert_eq!(land.prefix, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert_eq!(land.codes[0], -123);
    assert_eq!(land.operands[0], -456);
    assert!(land.suffix.is_empty());
    let empty_dungeon = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data DDD")
        .unwrap();
    assert_eq!(empty_dungeon.id, 0);
    assert_eq!(empty_dungeon.prefix, vec![0; 8]);
    assert_eq!(empty_dungeon.codes, vec![0; 8]);
    assert_eq!(empty_dungeon.operands, vec![0; 8]);
    assert!(empty_dungeon.suffix.is_empty());
    let extra_action = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data ED3")
        .unwrap();
    assert_eq!(extra_action.codes[0], i16::MIN);
    assert_eq!(extra_action.operands[0], i16::MAX);
}

#[test]
fn projects_complex_extra_codes_and_partial_tails() {
    let records = program_facts_fixture();
    let complex = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data ED2" && program.id == 0)
        .unwrap();
    assert!(complex.prefix.is_empty());
    assert_eq!(complex.codes.len(), 32);
    assert_eq!(complex.codes[0], -128);
    assert_eq!(complex.codes[31], 127);
    assert_eq!(complex.operands[0], -300);
    assert_eq!(complex.operands[31], 300);
    assert_eq!(complex.suffix, vec![0xa5; 424]);
    let empty_complex = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data ED2" && program.id == 1)
        .unwrap();
    assert_eq!(empty_complex.codes, vec![0; 32]);
    assert_eq!(empty_complex.operands, vec![0; 32]);
    assert_eq!(empty_complex.suffix, vec![0; 424]);

    assert_eq!(records.extra_codes[0].id, 0);
    assert_eq!(records.extra_codes[0].values, [-32768, 0, 32767, -7, 1234]);
    assert_eq!(records.extra_codes[1].values, [0; 5]);
    for (path, expected_tail) in [
        ("Data DD", 3),
        ("Data DDD", 3),
        ("Data ED2", 3),
        ("Data ED3", 3),
        ("Data EDCD", 1),
    ] {
        assert_eq!(
            records
                .sources
                .iter()
                .find(|source| source.native_path == path)
                .unwrap()
                .layouts[0]
                .trailing_bytes,
            expected_tail,
            "{path}"
        );
    }
}

#[test]
fn edited_complex_program_facts_follow_effective_encoder_and_keep_original_source() {
    let mut original = vec![0; 520 * 2 + 3];
    original[96..520].fill(0xa5);
    for slot in 0..9 {
        original[160 + slot * 40] = 0;
    }
    original[520..1040].fill(0x5a);
    for slot in 0..9 {
        original[520 + 160 + slot * 40] = 0;
    }
    original[1040..].copy_from_slice(&[0xde, 0xad, 0xbe]);
    let mut snapshot = crate::model::ProjectSnapshot::new_authored(StableId(
        "native-complex-effective-test".into(),
    ));
    snapshot.classic_sources = vec![declaration("Data ED2", &original)];
    snapshot.complex_encounters = crate::codecs::decode_complex_encounters(&original).records;
    snapshot.complex_encounters[0].actions = vec![crate::model::ClassicAction {
        slot: 0,
        raw_opcode: -9,
        target_native_id: -123,
    }];
    snapshot.complex_encounters[0].authored = true;

    let records = project_rebuilt_v7_effective_records(
        &snapshot,
        &BTreeMap::from([("Data ED2".into(), original.clone())]),
    )
    .unwrap();
    let source = records
        .sources
        .iter()
        .find(|source| source.native_path == "Data ED2")
        .unwrap();
    assert_ne!(source.sha256, source.effective_sha256);
    assert_eq!(source.byte_length, original.len() as u64);
    assert_eq!(source.effective_byte_length, original.len() as u64);
    assert_eq!(source.layouts[0].trailing_bytes, 3);
    assert_eq!(&original[1040..], &[0xde, 0xad, 0xbe]);
    let effective = records
        .programs
        .iter()
        .find(|program| program.native_path == "Data ED2" && program.id == 0)
        .unwrap();
    assert_eq!(effective.codes[0], -9);
    assert_eq!(effective.operands[0], -123);
    assert_eq!(effective.suffix, original[96..520]);
}

#[test]
fn edited_imported_timed_row_keeps_original_and_declares_effective_preimage() {
    let mut original = vec![0u8; TIMED_ENCOUNTER_RECORD_BYTES + 3];
    original[..2].copy_from_slice(&3i16.to_be_bytes());
    original[22..40].fill(0x9a);
    original[40..].copy_from_slice(&[0xde, 0xad, 0xbe]);
    let source = declaration("Data TD3", &original);
    let mut snapshot = crate::model::ProjectSnapshot::new_authored(crate::model::StableId(
        "native-record-effective-test".into(),
    ));
    snapshot.classic_sources.push(source);
    let mut imported = crate::codecs::decode_timed_encounters(&original).records;
    imported[0].day = 9;
    imported[0].authored = true;
    snapshot.timed_encounters = imported;

    let result = project_rebuilt_v7_effective_records(
        &snapshot,
        &BTreeMap::from([("Data TD3".into(), original.clone())]),
    )
    .unwrap();
    let source = result
        .sources
        .iter()
        .find(|source| source.native_path == "Data TD3")
        .unwrap();
    let edit = &source.edits[0];
    let expected_hash = format!("{:x}", Sha256::digest(&original));
    assert_eq!(source.sha256, expected_hash);
    assert_eq!(source.byte_length, original.len() as u64);
    assert_ne!(source.effective_sha256, source.sha256);
    assert_eq!(source.effective_byte_length, original.len() as u64);
    assert_eq!(edit.offset, 1);
    assert_eq!(edit.before, vec![3]);
    assert_eq!(edit.after, vec![9]);
    assert_eq!(result.timed[0].words[0], 9);
    assert_eq!(
        &original[22..],
        &[vec![0x9a; 18], vec![0xde, 0xad, 0xbe]].concat()
    );
    assert_eq!(source.layouts[0].trailing_bytes, 3);
}

#[test]
fn action_edits_declare_exact_preimages_and_preserve_source_bytes() {
    let (mut snapshot, originals) = action_sources_fixture();
    edit_action_fields(&mut snapshot);
    let edited = project_rebuilt_v7_effective_records(&snapshot, &originals).unwrap();
    assert_action_edits(&edited, &originals);
    assert_eq!(
        edited
            .programs
            .iter()
            .find(|program| program.native_path == "Data DD" && program.id == 0)
            .unwrap()
            .prefix[5],
        9
    );
    assert_eq!(
        edited
            .programs
            .iter()
            .find(|program| program.native_path == "Data DDD" && program.id == 4)
            .unwrap()
            .prefix[4],
        2
    );
    assert_eq!(
        edited
            .programs
            .iter()
            .find(|program| program.native_path == "Data ED3" && program.id == 0)
            .unwrap()
            .prefix[7],
        37
    );
    assert_eq!(edited.extra_codes[1].values[3], 1224);
}

#[test]
fn rejects_duplicate_declarations_and_undeclared_retained_bytes() {
    let bytes = vec![];
    let source = declaration("Data MD", &bytes);
    assert!(project_sources(vec![source.clone(), source], &BTreeMap::new()).is_err());
    assert!(project_sources(vec![], &BTreeMap::from([("Data MD".into(), bytes)])).is_err());
}

#[test]
fn custom_landlook_source_layout_uses_registered_geometry() {
    let custom_bytes = vec![0; crate::codecs::MAPSTATS_RECORD_BYTES];
    let custom_source = declaration("Data Custom 2 BD", &custom_bytes);
    let custom = project_sources(
        vec![custom_source],
        &BTreeMap::from([("Data Custom 2 BD".into(), custom_bytes)]),
    )
    .unwrap();
    assert_eq!(custom.sources[0].layouts.len(), 1);
    assert_eq!(
        custom.sources[0].layouts[0].family,
        serde_json::to_value(crate::codecs::NativeFileFamily::CustomLandlookMetadata)
            .unwrap()
            .as_str()
            .unwrap()
    );
}

#[test]
fn startup_layout_requires_exact_original_source_identity() {
    let marker_bytes = vec![0; crate::codecs::SCENARIO_STARTUP_BYTES];
    let marker_source = declaration("Original Marker", &marker_bytes);
    let mut snapshot = crate::model::ProjectSnapshot::new_authored(StableId("marker".into()));
    snapshot.campaign = Some(CampaignMetadata::neutral());
    snapshot.classic_sources = vec![marker_source.clone()];
    snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Renamed Marker".into(),
        original_source: Some(marker_source),
        security: None,
    });
    let marker = project_rebuilt_v7_classic_records(
        &snapshot,
        &BTreeMap::from([("Original Marker".into(), marker_bytes.clone())]),
    )
    .unwrap();
    let families = marker.sources[0]
        .layouts
        .iter()
        .map(|layout| layout.family.as_str())
        .collect::<Vec<_>>();
    assert_eq!(families.len(), 2);
    assert!(
        families.contains(
            &serde_json::to_value(crate::codecs::NativeFileFamily::ScenarioStartup)
                .unwrap()
                .as_str()
                .unwrap()
        )
    );
    assert!(
        families.contains(
            &serde_json::to_value(crate::codecs::NativeFileFamily::ScenarioSecurityStartup)
                .unwrap()
                .as_str()
                .unwrap()
        )
    );

    snapshot.classic_sources[0].native_path = "Campaign Title".into();
    snapshot.classic_sources[0].blob =
        BlobId(format!("sha256:{:x}", Sha256::digest(&marker_bytes)));
    snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Campaign Title".into(),
        original_source: None,
        security: None,
    });
    if let Some(campaign) = snapshot.campaign.as_mut() {
        campaign.name = "Campaign Title".into();
    }
    let title_only = project_rebuilt_v7_classic_records(
        &snapshot,
        &BTreeMap::from([("Campaign Title".into(), marker_bytes)]),
    )
    .unwrap();
    assert!(title_only.sources[0].layouts.is_empty());
}

fn program_facts_fixture() -> RebuiltV7ClassicRecords {
    let mut land = vec![0; 40 * 2 + 3];
    land[..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
    land[8..10].copy_from_slice(&(-123i16).to_be_bytes());
    land[24..26].copy_from_slice(&(-456i16).to_be_bytes());

    let dungeon = vec![0; 40 + 3];
    let mut extra_actions = vec![0; 40 + 3];
    extra_actions[8..10].copy_from_slice(&i16::MIN.to_be_bytes());
    extra_actions[24..26].copy_from_slice(&i16::MAX.to_be_bytes());

    let mut complex = vec![0; 520 * 2 + 3];
    complex[0] = 0x80;
    complex[31] = 0x7f;
    complex[32..34].copy_from_slice(&(-300i16).to_be_bytes());
    complex[94..96].copy_from_slice(&300i16.to_be_bytes());
    complex[96..520].fill(0xa5);

    let mut extra_codes = vec![0; 10 * 2 + 1];
    for (slot, value) in [-32768i16, 0, 32767, -7, 1234].into_iter().enumerate() {
        extra_codes[slot * 2..slot * 2 + 2].copy_from_slice(&value.to_be_bytes());
    }

    let originals = BTreeMap::from([
        ("Data DD".to_owned(), land),
        ("Data DDD".to_owned(), dungeon),
        ("Data ED3".to_owned(), extra_actions),
        ("Data ED2".to_owned(), complex),
        ("Data EDCD".to_owned(), extra_codes),
    ]);
    let sources = originals
        .iter()
        .map(|(path, bytes)| declaration(path, bytes))
        .collect();
    project_sources(sources, &originals).unwrap()
}

fn action_sources_fixture() -> (crate::model::ProjectSnapshot, BTreeMap<String, Vec<u8>>) {
    let action_bytes = crate::codecs::ACTION_POINT_LEVEL_BYTES + 3;
    let extra_action_bytes = crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES * 2 + 3;
    let extra_code_bytes = crate::codecs::EXTRA_CODE_RECORD_BYTES * 2 + 3;
    let originals = BTreeMap::from([
        ("Data DD".to_owned(), vec![0; action_bytes]),
        ("Data DDD".to_owned(), vec![0; action_bytes]),
        ("Data ED3".to_owned(), vec![0; extra_action_bytes]),
        ("Data EDCD".to_owned(), vec![0; extra_code_bytes]),
    ]);
    let mut snapshot = crate::model::ProjectSnapshot::new_authored(StableId(
        "native-action-effective-test".into(),
    ));
    snapshot.classic_sources = originals
        .iter()
        .map(|(path, bytes)| declaration(path, bytes))
        .collect();
    snapshot.world.action_points =
        crate::codecs::decode_land_action_points(originals.get("Data DD").unwrap()).records;
    snapshot.world.action_points.extend(
        crate::codecs::decode_dungeon_action_points(originals.get("Data DDD").unwrap()).records,
    );
    snapshot.extra_action_points =
        crate::codecs::decode_extra_action_points(originals.get("Data ED3").unwrap()).records;
    snapshot.extra_codes =
        crate::codecs::decode_extra_codes(originals.get("Data EDCD").unwrap()).rows;

    (snapshot, originals)
}

#[test]
fn unchanged_action_sources_preserve_hashes_and_partial_tails() {
    let (snapshot, originals) = action_sources_fixture();
    let unchanged = project_rebuilt_v7_effective_records(&snapshot, &originals).unwrap();
    for source in &unchanged.sources {
        assert_eq!(
            source.effective_sha256, source.sha256,
            "{}",
            source.native_path
        );
        assert!(source.edits.is_empty(), "{}", source.native_path);
        assert_eq!(source.effective_byte_length, source.byte_length);
        assert_eq!(
            source.layouts[0].trailing_bytes, 3,
            "{}",
            source.native_path
        );
    }
}

fn edit_action_fields(snapshot: &mut crate::model::ProjectSnapshot) {
    snapshot
        .world
        .action_points
        .iter_mut()
        .find(|row| row.identity.0 == "action-point:land:0:0")
        .unwrap()
        .post_action_x = 9;
    snapshot
        .world
        .action_points
        .iter_mut()
        .find(|row| row.identity.0 == "action-point:dungeon:0:4")
        .unwrap()
        .post_action_level = 2;
    snapshot.extra_action_points[0].chance_percent = 37;
    snapshot.extra_codes[1].values[3] = 1224;
}

fn assert_action_edits(edited: &RebuiltV7ClassicRecords, originals: &BTreeMap<String, Vec<u8>>) {
    let expected_edits = [
        ("Data DD", 5usize, vec![0], vec![9]),
        ("Data DDD", 164usize, vec![0], vec![2]),
        ("Data ED3", 7usize, vec![0], vec![37]),
        (
            "Data EDCD",
            16usize,
            vec![0, 0],
            1224i16.to_be_bytes().to_vec(),
        ),
    ];
    for (path, offset, before, after) in expected_edits {
        let source = edited
            .sources
            .iter()
            .find(|source| source.native_path == path)
            .unwrap();
        assert_eq!(source.edits.len(), 1, "{path}");
        assert_eq!(source.edits[0].offset, offset, "{path}");
        assert_eq!(source.edits[0].before, before, "{path}");
        assert_eq!(source.edits[0].after, after, "{path}");
        assert_eq!(
            source.sha256,
            format!("{:x}", Sha256::digest(&originals[path]))
        );
        assert_ne!(source.effective_sha256, source.sha256, "{path}");
        assert_eq!(source.effective_byte_length, originals[path].len() as u64);
        assert_eq!(source.layouts[0].trailing_bytes, 3, "{path}");

        let mut round_trip = originals[path].clone();
        round_trip[offset..offset + before.len()].copy_from_slice(&after);
        assert_eq!(
            source.effective_sha256,
            format!("{:x}", Sha256::digest(round_trip)),
            "{path}"
        );
    }
}
