use super::*;
use crate::rebuilt::project_rebuilt_v3_reachable_runtime;
#[path = "tests/extra_code_tail.rs"]
mod extra_code_tail;
mod fixtures;
#[path = "tests/native_tile_values.rs"]
mod native_tile_values;
#[path = "tests/option_captions.rs"]
mod option_captions;
#[path = "tests/rule_selection.rs"]
mod rule_selection;
use crate::model::{BlobId, LevelType, StableId};
use fixtures::*;

const MEDIA: &[u8] = b"controlled tileset payload";

#[test]
fn v7_finalization_retains_raw_slots_signed_bounds_and_safe_native_labels() {
    let (mut snapshot, raw) = v7_slots_fixture();
    let media_path = add_media(&mut snapshot);
    let inputs = [RebuiltV3FileInput {
        path: &media_path,
        bytes: MEDIA,
    }];
    let application = application_media_for(&snapshot);
    let mut artifact = compile_rebuilt_v3_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &inputs,
    )
    .unwrap();
    let originals = BTreeMap::from([("Data ED".into(), raw.clone())]);
    finalize_rebuilt_v7_document_set(&mut artifact, &snapshot, &compiler(), &originals, &inputs)
        .unwrap();
    assert_eq!(artifact.manifest.manifest.schema_version, 7);
    let responses = &artifact.content.document.simple_encounters[0].responses;
    assert_eq!(responses.len(), 4);
    assert_eq!(responses[0].label, "AÄ\nB");
    assert_eq!(responses[1].label, "Charge ahead");
    let facts = artifact.content.document.classic_records.as_ref().unwrap();
    assert_eq!(facts.sources[0].sha256, sha256_hex(&raw));
    assert_eq!(facts.sources[0].layouts[0].trailing_bytes, 3);
    assert_eq!(facts.simple[0].text_slots[1][0], 80);
    let rectangles = &artifact.world.document.maps[0].random_rectangles;
    assert_eq!(rectangles.len(), 20);
    for (slot, row) in rectangles.iter().enumerate() {
        assert_eq!(row.id.0, format!("land:0:random:{slot}"));
        assert_eq!(
            (row.top, row.left, row.bottom, row.right),
            (-10, -20, -30, 120)
        );
        assert_eq!(row.chance_ten_thousand, slot as i16);
    }
    let first = artifact.manifest.canonical_json.clone();
    finalize_rebuilt_v7_document_set(&mut artifact, &snapshot, &compiler(), &originals, &inputs)
        .unwrap();
    assert_eq!(artifact.manifest.canonical_json, first);
}

#[test]
fn imported_native_monster_values_select_schema_v6_for_every_package_document() {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut set = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    set.monsters[0].magic_to_hit = i8::MIN;
    set.monsters[0].weapon = i16::MIN;
    snapshot.monster_sets.push(set);

    let artifact = compile_rebuilt_document_set(&snapshot, &compiler(), &[])
        .expect("representable imported monster values use schema v6");
    assert_eq!(artifact.manifest.manifest.schema_version, 6);
    assert_eq!(
        artifact.manifest.manifest.schema_hash,
        super::super::REBUILT_V6_SCHEMA_SHA256
    );
    let manifest: serde_json::Value =
        serde_json::from_slice(&artifact.manifest.canonical_json).unwrap();
    let content: serde_json::Value =
        serde_json::from_slice(&artifact.content.canonical_json).unwrap();
    let world: serde_json::Value = serde_json::from_slice(&artifact.world.canonical_json).unwrap();
    let scenario: serde_json::Value = serde_json::from_slice(&artifact.scenario_json).unwrap();
    let assets: serde_json::Value = serde_json::from_slice(&artifact.asset_index_json).unwrap();
    assert_eq!(manifest["schemaVersion"], 6);
    for document in [content, world, scenario, assets] {
        assert_eq!(document["schemaVersion"], 6);
    }
    assert_eq!(
        manifest["schemaHash"],
        super::super::REBUILT_V6_SCHEMA_SHA256
    );
    assert_eq!(artifact.content.document.monsters[0].magic_to_hit, i8::MIN);
    assert_eq!(
        artifact.content.document.monsters[0].random_weapon_table,
        32_768
    );
}

#[test]
fn incomplete_extra_code_tail_uses_v6_without_fabricating_an_executable_row() {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot
        .classic_sources
        .push(crate::model::ClassicSourceBlob {
            native_path: "Data EDCD".into(),
            blob: BlobId(format!("sha256:{}", "b".repeat(64))),
            byte_length: 16,
        });
    add_tail_requests(&mut snapshot);
    let artifact = compile_rebuilt_document_set(&snapshot, &compiler(), &[])
        .expect("tail is guarded metadata");
    assert_eq!(artifact.manifest.manifest.schema_version, 6);
    assert_eq!(
        artifact.manifest.manifest.schema_hash,
        super::super::REBUILT_V6_SCHEMA_SHA256
    );
    let scenario: serde_json::Value = serde_json::from_slice(&artifact.scenario_json).unwrap();
    assert_eq!(
        scenario["extraCodeTail"],
        serde_json::json!({"rowId":1,"availableBytes":6})
    );
    let instructions = scenario["programs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "xap:0")
        .unwrap()["instructions"]
        .as_array()
        .unwrap();
    assert_eq!(instructions[0]["extraCode"], serde_json::Value::Null);
    assert_eq!(instructions[1]["extraCode"], serde_json::Value::Null);
    assert_eq!(
        instructions[2]["extraCode"],
        serde_json::json!([0, 0, 0, 0, 0])
    );
    for bytes in [
        &artifact.content.canonical_json,
        &artifact.world.canonical_json,
        &artifact.asset_index_json,
    ] {
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(bytes).unwrap()["schemaVersion"],
            6
        );
    }
}

#[test]
fn document_set_is_deterministic_and_feeds_the_exact_manifest_inputs() {
    let first = compile_rebuilt_document_set(&snapshot(), &compiler(), &[]).unwrap();
    let second = compile_rebuilt_document_set(&snapshot(), &compiler(), &[]).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.manifest.manifest.files.len(), 4);
    assert_eq!(first.manifest.manifest.capabilities.len(), 3);
    assert_eq!(first.content.document.kind, "realmz2.content");
    assert_eq!(first.world.document.kind, "realmz2.world");
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&first.scenario_json).unwrap()["kind"],
        "realmz2.scenario"
    );
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&first.asset_index_json).unwrap()["kind"],
        "realmz2.assets"
    );
    assert_eq!(
        first.manifest.manifest.content_id,
        "794158913ed65b25098e4c8e7b1192c0728b96ec76c50bfe1e3ff2bcbd63eef1"
    );
}

#[test]
fn retained_battles_declare_the_application_battle_atlas_dependency() {
    let capabilities = package_capabilities_for_assets(&[], true, false);
    assert!(
        capabilities
            .iter()
            .any(|capability| capability == "realmz.presentation.battle-atlas-v1")
    );
    assert!(
        package_capabilities_for_assets(&[], false, false)
            .iter()
            .all(|capability| capability != "realmz.presentation.battle-atlas-v1")
    );
}

#[test]
fn deferred_legacy_references_declare_the_runtime_capability() {
    let capabilities = package_capabilities_for_assets(&[], false, true);
    assert!(
        capabilities
            .iter()
            .any(|capability| capability == "realmz.scenario.deferred-references-v1")
    );
}

#[test]
fn imported_invalid_start_is_preserved_and_declares_deferred_validation() {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.start_location = Some(crate::model::StartLocation {
        map: StableId("land:999".into()),
        coordinate: crate::model::MapCoordinate { x: 90, y: 23 },
    });

    let artifact = compile_rebuilt_document_set(&snapshot, &compiler(), &[]).unwrap();

    assert!(
        artifact
            .manifest
            .manifest
            .capabilities
            .iter()
            .any(|capability| capability == "realmz.scenario.deferred-references-v1")
    );
    assert_eq!(artifact.manifest.manifest.start.map_id.0, "land:999");
    assert_eq!(
        [
            artifact.manifest.manifest.start.x,
            artifact.manifest.manifest.start.y
        ],
        [90, 23]
    );
}

#[test]
fn layered_document_set_emits_only_scenario_owned_media() {
    let mut snapshot = snapshot();
    snapshot.world.maps[0].tiles[0] = -7;
    snapshot.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "e".repeat(64))),
        solid: vec![false; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES],
    });
    let mut base_profile = snapshot.terrain_catalog[0].clone();
    base_profile.tile = 4;
    base_profile.combat_build = [[4; 3]; 3];
    snapshot.terrain_catalog.push(base_profile);
    snapshot
        .world
        .action_points
        .push(crate::model::ActionPoint {
            identity: StableId("action-point:land:0:0".into()),
            level_type: LevelType::Land,
            level_index: 0,
            record_index: 0,
            classic_door_id: 0,
            coordinate: Some(crate::model::MapCoordinate { x: 1, y: 1 }),
            post_action_level: 0,
            post_action_x: 1,
            post_action_y: 1,
            chance_percent: 100,
            actions: vec![crate::model::ClassicAction {
                slot: 0,
                raw_opcode: 29,
                target_native_id: 0,
            }],
        });
    let mut markers = vec![
        crate::model::PlayerMapMarker {
            icon_id: 0,
            x: 0,
            y: 0,
        };
        10
    ];
    markers[0] = crate::model::PlayerMapMarker {
        icon_id: 143,
        x: 18,
        y: 23,
    };
    snapshot
        .world
        .player_maps
        .push(crate::model::PlayerMapRecord {
            identity: StableId("player-map:0".into()),
            native_id: crate::model::NativeRecordId(0),
            markers,
            start_x: 7,
            start_y: 9,
            level: 0,
            picture_id: 0,
            icon_size: 16,
            show: 1,
            is_dungeon: false,
            picture_rect: crate::model::PlayerMapRect::default(),
            note: "Application-owned marker proof".into(),
            authored: true,
        });
    let path = add_media(&mut snapshot);
    let application = application_media_for(&snapshot);
    assert!(application.assets.len() > 240);
    let payload = [RebuiltV3FileInput {
        path: &path,
        bytes: MEDIA,
    }];
    let first = compile_rebuilt_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &payload,
    )
    .unwrap();
    let second = compile_rebuilt_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &payload,
    )
    .unwrap();
    assert_eq!(first, second);
    let assets: serde_json::Value = serde_json::from_slice(&first.asset_index_json).unwrap();
    assert_eq!(assets["assets"].as_array().unwrap().len(), 1);
    assert_eq!(assets["assets"][0]["id"], "classic.landlook.2");
    assert_eq!(
        first.world.document.maps[0].cells[0].10,
        Some(StableId("realmz-special-land-neg-7".into()))
    );
    assert_eq!(
        first.world.document.player_maps[0].party_marker_asset_id,
        Some(StableId("application:cicn:138".into()))
    );
    assert_eq!(
        first.world.document.player_maps[0].markers[0].icon_asset_id,
        StableId("application:cicn:143".into())
    );
    assert_eq!(
        first
            .manifest
            .manifest
            .files
            .keys()
            .map(|path| path.as_str())
            .collect::<Vec<_>>(),
        vec![
            "assets/index.json",
            path.as_str(),
            "content.json",
            "scenario.json",
            "world.json",
        ]
    );
}

#[test]
fn layered_document_set_ignores_invalid_encounters_outside_the_runtime_closure() {
    let mut snapshot = snapshot();
    snapshot
        .simple_encounters
        .push(crate::model::SimpleEncounter {
            identity: StableId("simple-encounter:99".into()),
            native_id: crate::model::NativeRecordId(99),
            actions: Vec::new(),
            choice_results: [1, 0, 0, 0],
            can_back_out: false,
            max_times: 1,
            caste_success: 0,
            prompt_message_native_id: 32_000,
            texts: [
                "Dormant invalid response".into(),
                String::new(),
                String::new(),
                String::new(),
            ],
            authored: true,
        });
    let media_path = add_media(&mut snapshot);
    let application = application_media_for(&snapshot);

    assert!(matches!(
        super::super::project_rebuilt_v3_world_with_application(&snapshot, &application),
        Err(super::super::RebuiltV3WorldError::Scenario(
            super::super::RebuiltV3ScenarioError::MissingSimpleEncounterMessage {
                message_id: 32_000,
                ..
            }
        ))
    ));
    assert_eq!(
        crate::compatibility::classify_rebuilt_v3_with_application(&snapshot, &application).status,
        crate::compatibility::CompatibilityStatus::Ready
    );

    let media_payload = [RebuiltV3FileInput {
        path: &media_path,
        bytes: MEDIA,
    }];
    let artifact = compile_rebuilt_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &media_payload,
    )
    .expect("the package must derive world dependencies from its reachable scenario");
    let scenario: RebuiltV3ScenarioDocument =
        serde_json::from_slice(&artifact.scenario_json).expect("canonical scenario document");
    assert!(scenario.programs.is_empty());
    assert!(artifact.world.document.triggers.is_empty());
}

#[test]
fn media_payloads_must_exactly_match_the_asset_index() {
    let unexpected = [RebuiltV3FileInput {
        path: "assets/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
        bytes: MEDIA,
    }];
    assert!(matches!(
        compile_rebuilt_document_set(&snapshot(), &compiler(), &unexpected),
        Err(RebuiltV3DocumentSetError::UnexpectedMediaPayload(_))
    ));

    let mut snapshot = snapshot();
    let path = add_media(&mut snapshot);
    assert_eq!(
        compile_rebuilt_document_set(&snapshot, &compiler(), &[]),
        Err(RebuiltV3DocumentSetError::MissingMediaPayload(path.clone()))
    );

    let valid = [RebuiltV3FileInput {
        path: &path,
        bytes: MEDIA,
    }];
    let artifact = compile_rebuilt_document_set(&snapshot, &compiler(), &valid).unwrap();
    assert_eq!(artifact.manifest.manifest.files.len(), 5);
    assert_eq!(
        artifact.manifest.manifest.capabilities,
        [
            "realmz.core.classic-rules-v1",
            "realmz.presentation.content-addressed-media-v1",
            "realmz.presentation.tileset-atlases-v1",
            "realmz.scenario.classic-vm-v1",
            "realmz.world.topology-v2",
        ]
    );

    let duplicate = [valid[0].clone(), valid[0].clone()];
    assert_eq!(
        compile_rebuilt_document_set(&snapshot, &compiler(), &duplicate),
        Err(RebuiltV3DocumentSetError::DuplicateMediaPayload(
            path.clone()
        ))
    );

    let too_short = [RebuiltV3FileInput {
        path: &path,
        bytes: &MEDIA[..MEDIA.len() - 1],
    }];
    assert!(matches!(
        compile_rebuilt_document_set(&snapshot, &compiler(), &too_short),
        Err(RebuiltV3DocumentSetError::MediaLengthMismatch { .. })
    ));

    let mut mismatched_bytes = MEDIA.to_vec();
    mismatched_bytes[0] ^= 0xff;
    let mismatched = [RebuiltV3FileInput {
        path: &path,
        bytes: &mismatched_bytes,
    }];
    assert!(matches!(
        compile_rebuilt_document_set(&snapshot, &compiler(), &mismatched),
        Err(RebuiltV3DocumentSetError::MediaHashMismatch { .. })
    ));

    let mut conflicting = snapshot.clone();
    let mut alias = conflicting.assets[0].clone();
    alias.identity = StableId("classic.landlook.2.alias".into());
    alias.byte_length += 1;
    conflicting.assets.push(alias);
    assert_eq!(
        compile_rebuilt_document_set(&conflicting, &compiler(), &valid),
        Err(RebuiltV3DocumentSetError::ConflictingMediaDeclaration(path))
    );
}

fn add_tail_requests(snapshot: &mut ProjectSnapshot) {
    snapshot.extra_codes = crate::codecs::decode_extra_codes(&[0; 16]).rows;
    let mut source = [0u8; 40];
    for (slot, opcode, row) in [(0, 17i16, 1i16), (1, 73, 1), (2, 92, 0)] {
        source[8 + slot * 2..10 + slot * 2].copy_from_slice(&opcode.to_be_bytes());
        source[24 + slot * 2..26 + slot * 2].copy_from_slice(&row.to_be_bytes());
    }
    snapshot.extra_action_points = crate::codecs::decode_extra_action_points(&source).records;
    snapshot
        .scenario_application
        .as_mut()
        .unwrap()
        .hooks
        .start_game = Some(StableId("extra-action-point:0".into()));
}

fn v7_slots_fixture() -> (ProjectSnapshot, Vec<u8>) {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut raw = vec![0; crate::codecs::SIMPLE_ENCOUNTER_RECORD_BYTES + 3];
    raw[96] = 1;
    raw[106..113].copy_from_slice(&[6, b'A', 0x80, 13, b'B', 0, b'X']);
    raw[186] = 80;
    raw[187..199].copy_from_slice(b"Charge ahead");
    snapshot.simple_encounters = crate::codecs::decode_simple_encounters(&raw).records;
    snapshot.classic_sources = vec![crate::model::ClassicSourceBlob {
        native_path: "Data ED".into(),
        blob: BlobId(format!("sha256:{}", sha256_hex(&raw))),
        byte_length: raw.len() as u64,
    }];
    let runtime = snapshot.world.maps[0].runtime.as_mut().unwrap();
    runtime.random_rectangles = (0..20)
        .map(|slot| crate::model::RandomRectangle {
            identity: StableId(format!("land:0:random:{slot}")),
            top: -10,
            left: -20,
            bottom: -30,
            right: 120,
            chance_ten_thousand: slot,
            battle_range: [-1, -2],
            random_doors: [0; 3],
            random_door_percent: [0; 3],
            only: false,
            option: 0,
            sound_id: 0,
            text_id: 0,
        })
        .collect();
    runtime
        .random_rectangles
        .sort_by_key(|row| row.identity.clone());
    (snapshot, raw)
}

#[test]
fn v7_missing_supplied_shop_row_fails_before_artifact_mutation() {
    let (mut snapshot, raw) = v7_slots_fixture();
    let media_path = add_media(&mut snapshot);
    let inputs = [RebuiltV3FileInput {
        path: &media_path,
        bytes: MEDIA,
    }];
    let application = application_media_for(&snapshot);
    let mut artifact = compile_rebuilt_v3_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &inputs,
    )
    .unwrap();
    let before = artifact.clone();
    let originals = BTreeMap::from([
        ("Data ED".into(), raw),
        (
            "Data SD".into(),
            vec![0; crate::codecs::SHOP_RECORD_BYTES + 3],
        ),
    ]);
    let error = finalize_rebuilt_v7_document_set(
        &mut artifact,
        &snapshot,
        &compiler(),
        &originals,
        &inputs,
    )
    .unwrap_err()
    .to_string();
    assert!(error.contains("Data SD supplied native row 0"), "{error}");
    assert!(error.contains("model/import preservation defect"));
    assert!(error.contains("separate project"));
    assert_eq!(artifact, before);
}

#[test]
fn v7_first_native_family_fails_before_mutating_the_compiled_artifact() {
    let (mut snapshot, raw) = v7_slots_fixture();
    let media_path = add_media(&mut snapshot);
    let inputs = [RebuiltV3FileInput {
        path: &media_path,
        bytes: MEDIA,
    }];
    let application = application_media_for(&snapshot);
    let mut artifact = compile_rebuilt_v3_document_set_with_application(
        &snapshot,
        &application,
        &compiler(),
        &inputs,
    )
    .unwrap();
    let before = artifact.clone();
    snapshot.extra_action_points = crate::codecs::decode_extra_action_points(&[0; 40]).records;
    let originals = BTreeMap::from([("Data ED".into(), raw)]);
    let error = finalize_rebuilt_v7_document_set(
        &mut artifact,
        &snapshot,
        &compiler(),
        &originals,
        &inputs,
    )
    .unwrap_err()
    .to_string();
    assert!(error.contains("Data ED3"), "{error}");
    assert!(
        error.contains("no native source bytes for v7 publication"),
        "{error}"
    );
    assert_eq!(artifact, before);
}
