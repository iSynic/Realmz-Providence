use crate::byte_inspection::fixed_record_family;
use crate::catalog_libraries::application_library_report;
use crate::catalog_libraries::reference_catalog_report;
use crate::comparisons::normalized_project_comparison;
use crate::comparisons::normalized_project_semantic_comparison;
use crate::joined_dungeon::JoinedCertificationChecks;
use crate::projects::valid_new_project_id;

use providence_core::{
    model::{BattleRecord, NativeRecordId, StableId},
    rebuilt::ApplicationMediaCatalog,
    reference_library::ReferenceCatalog,
};
use serde_json::json;

#[test]
fn new_project_ids_are_portable_and_stable() {
    assert!(valid_new_project_id("war-in-the-sword-lands"));
    assert!(valid_new_project_id("realmz2"));
    assert!(!valid_new_project_id(""));
    assert!(!valid_new_project_id("War In The Sword Lands"));
    assert!(!valid_new_project_id("-scenario"));
    assert!(!valid_new_project_id("scenario-"));
    assert!(!valid_new_project_id("scenario_path"));
}

#[test]
fn project_comparison_ignores_only_project_identity() {
    let first =
        providence_core::model::ProjectSnapshot::new_authored(StableId("first-project".into()));
    let mut second =
        providence_core::model::ProjectSnapshot::new_authored(StableId("second-project".into()));

    let equivalent = normalized_project_comparison(first.clone(), second.clone()).unwrap();
    assert_eq!(equivalent["equivalent"], true);
    assert_eq!(equivalent["mismatchedTopLevelFields"], json!([]));
    assert_eq!(
        equivalent["firstCanonicalSha256"],
        equivalent["secondCanonicalSha256"]
    );

    second
        .messages
        .push(providence_core::model::ScenarioMessage {
            identity: StableId("message:7".into()),
            native_id: providence_core::model::NativeRecordId(7),
            text: "Changed authored truth".into(),
            authored: true,
        });
    let different = normalized_project_comparison(first, second).unwrap();
    assert_eq!(different["equivalent"], false);
    assert_eq!(different["mismatchedTopLevelFields"], json!(["messages"]));
    assert_ne!(
        different["firstCanonicalSha256"],
        different["secondCanonicalSha256"]
    );
}

#[test]
fn semantic_comparison_excludes_identity_source_provenance_and_codec_write_state() {
    let first =
        providence_core::model::ProjectSnapshot::new_authored(StableId("first-project".into()));
    let mut second = first.clone();
    second.project_id = StableId("reimported-project".into());
    second.origin = providence_core::model::ProjectOrigin::Imported {
        compatibility_annex: providence_core::model::BlobId("sha256:reimported-annex".into()),
    };
    second
        .classic_sources
        .push(providence_core::model::ClassicSourceBlob {
            native_path: "Data DD".into(),
            blob: providence_core::model::BlobId("sha256:edited-source".into()),
            byte_length: 40,
        });

    let equivalent = normalized_project_semantic_comparison(first.clone(), second.clone()).unwrap();
    assert_eq!(equivalent["equivalent"], true);
    assert_eq!(
        equivalent["excludedFields"],
        json!([
            "projectId",
            "origin",
            "classicSources",
            "codecAuthoringFlags",
            "nestedSourceProvenance",
            "inactiveClassicRows"
        ])
    );
    assert_eq!(
        equivalent["sourceProvenanceRequiresSeparateByteVerification"],
        true
    );

    second
        .messages
        .push(providence_core::model::ScenarioMessage {
            identity: StableId("message:7".into()),
            native_id: providence_core::model::NativeRecordId(7),
            text: "Changed authored truth".into(),
            authored: true,
        });
    let different = normalized_project_semantic_comparison(first, second).unwrap();
    assert_eq!(different["equivalent"], false);
    assert_eq!(different["mismatchedTopLevelFields"], json!(["messages"]));
}

#[test]
fn semantic_comparison_ignores_reimported_map_provenance_and_empty_native_rows() {
    let edited = edited_land_fixture();
    let mut reimported = edited.clone();
    reimported.project_id = StableId("reimported".into());
    reimported.world.maps[0]
        .runtime
        .as_mut()
        .expect("runtime")
        .source_blob = Some(providence_core::model::BlobId(
        "sha256:emitted-data-rd".into(),
    ));
    reimported
        .world
        .action_points
        .push(providence_core::model::ActionPoint {
            identity: StableId("action-point:land:0:1".into()),
            level_type: providence_core::model::LevelType::Land,
            level_index: 0,
            record_index: 1,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 0,
            actions: Vec::new(),
        });

    let equivalent =
        normalized_project_semantic_comparison(edited.clone(), reimported.clone()).unwrap();
    assert_eq!(equivalent["equivalent"], true);
    assert_eq!(equivalent["mismatchedTopLevelFields"], json!([]));

    reimported.world.maps[0].tiles[0] = 155;
    let different = normalized_project_semantic_comparison(edited, reimported).unwrap();
    assert_eq!(different["equivalent"], false);
    assert_eq!(different["mismatchedTopLevelFields"], json!(["world"]));
}

#[test]
fn semantic_comparison_ignores_battle_write_state_but_not_battle_fields() {
    let mut edited =
        providence_core::model::ProjectSnapshot::new_authored(StableId("edited".into()));
    edited.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid: vec![0; 169],
        distance: 3,
        message_before: 160,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    let mut reimported = edited.clone();
    reimported.project_id = StableId("reimported".into());
    reimported.battles[0].authored = false;

    let equivalent =
        normalized_project_semantic_comparison(edited.clone(), reimported.clone()).unwrap();
    assert_eq!(equivalent["equivalent"], true);
    assert_eq!(equivalent["mismatchedTopLevelFields"], json!([]));

    reimported.battles[0].distance = 4;
    let different = normalized_project_semantic_comparison(edited, reimported).unwrap();
    assert_eq!(different["equivalent"], false);
    assert_eq!(different["mismatchedTopLevelFields"], json!(["battles"]));
}

#[test]
fn owned_byte_diff_family_parser_is_strict_and_fixed_record_only() {
    assert_eq!(
        fixed_record_family("scenario-messages"),
        Some(providence_core::codecs::NativeFileFamily::ScenarioMessages)
    );
    assert_eq!(fixed_record_family("ScenarioMessages"), None);
    assert_eq!(fixed_record_family("scenario-picture-resources"), None);
}

#[test]
fn phase_zero_manifest_is_valid_json_and_pins_the_first_seam() {
    let baseline = include_str!("fixtures/import-seam.json");
    let value: serde_json::Value = serde_json::from_str(baseline).expect("valid baseline JSON");

    assert_eq!(value["manifestVersion"], 1);
    assert_eq!(value["firstMigrationSeam"]["nativePath"], "Data SD2");
    assert_eq!(value["firstMigrationSeam"]["recordBytes"], 256);
    assert!(
        value["repositories"]
            .as_array()
            .expect("repository inventory")
            .iter()
            .any(|repository| repository["role"] == "classic-source-oracle")
    );
}

#[test]
fn application_library_report_requires_the_complete_appearance_denominator() {
    let report = application_library_report(&ApplicationMediaCatalog::empty(StableId(
        "controlled-empty-library".into(),
    )));

    assert_eq!(report["sources"], 0);
    assert_eq!(report["assets"], 0);
    assert_eq!(report["appearanceRoots"], 0);
    assert_eq!(
        report["missingAppearanceResourceIds"]
            .as_array()
            .unwrap()
            .len(),
        240
    );
    assert_eq!(report["appearanceComplete"], false);
    assert_eq!(report["landlookAtlases"]["available"], json!([]));
    assert_eq!(
        report["landlookAtlases"]["missing"],
        json!([0, 1, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    assert_eq!(report["landlookAtlases"]["dungeon"], false);
    assert_eq!(report["ready"], false);
}

#[test]
fn reference_catalog_report_never_claims_an_empty_catalog_is_ready() {
    let report = reference_catalog_report(&ReferenceCatalog::empty(StableId(
        "controlled-empty-reference-catalog".into(),
    )));

    assert_eq!(report["sources"], 0);
    assert_eq!(report["assets"], 0);
    assert_eq!(report["counts"]["bagItems"], 0);
    assert_eq!(report["counts"]["vaultIcons"], 0);
    assert_eq!(report["projectOwnership"], false);
    assert_eq!(report["readOnly"], true);
    assert_eq!(report["ready"], false);
}

#[test]
fn joined_certification_cannot_ignore_a_failed_media_selection() {
    let all_other_checks_ready = JoinedCertificationChecks {
        sources_exact: true,
        topology_valid: true,
        battle_projection_valid: true,
        random_battle_projection_valid: true,
        referenced_battle_projection_valid: true,
        random_ranges_valid: true,
        root_reachability_valid: true,
        reachable_combat_valid: true,
        reachable_runtime_valid: true,
        reachable_media_valid: false,
    };

    assert!(!all_other_checks_ready.ready());
    assert!(
        JoinedCertificationChecks {
            reachable_media_valid: true,
            ..all_other_checks_ready
        }
        .ready()
    );
}

fn edited_land_fixture() -> providence_core::model::ProjectSnapshot {
    let mut edited =
        providence_core::model::ProjectSnapshot::new_authored(StableId("edited".into()));
    edited.world.maps.push(providence_core::model::MapLevel {
        identity: StableId("land:0".into()),
        level_type: providence_core::model::LevelType::Land,
        native_index: 0,
        name: "Land level 0".into(),
        tiles: vec![156; providence_core::model::CLASSIC_MAP_SIZE.pow(2)],
        runtime: Some(providence_core::model::MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: Some(0),
            tileset_id: StableId("classic.landlook.0".into()),
            base_tile: Some(156),
            random_rectangles: Vec::new(),
        }),
    });
    edited
        .world
        .action_points
        .push(providence_core::model::ActionPoint {
            identity: StableId("action-point:land:0:0".into()),
            level_type: providence_core::model::LevelType::Land,
            level_index: 0,
            record_index: 0,
            classic_door_id: 1010,
            coordinate: Some(providence_core::model::MapCoordinate { x: 10, y: 10 }),
            post_action_level: 0,
            post_action_x: 10,
            post_action_y: 10,
            chance_percent: 100,
            actions: vec![providence_core::model::ClassicAction {
                slot: 0,
                raw_opcode: 1,
                target_native_id: 7,
            }],
        });
    edited
}
