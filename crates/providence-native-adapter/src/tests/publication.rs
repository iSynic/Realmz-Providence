use super::*;
use crate::classic_compilation::ClassicManifestOperation;
use crate::classic_compilation::compile_project_classic_slice_with_application;
use crate::classic_publication::publish_classic_directory;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::rebuilt_export_plan;
use crate::rebuilt_publication::publish_rebuilt_archive;
use providence_core::codecs::ACTION_POINT_LEVEL_BYTES;
use providence_core::compiler::NativeManifest;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::CampaignContactProvenance;
use providence_core::model::CampaignMetadata;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::LevelType;
use providence_core::model::MapCoordinate;
use providence_core::model::MapLevel;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::model::StartLocation;
use providence_core::rebuilt::RebuiltV3CompilerIdentity;
use providence_core::rebuilt::RebuiltV3FileInput;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

#[test]
fn rebuilt_package_inspection_requires_a_persistent_project_store() {
    let mut session = EditorSession::new(demo_snapshot());
    let error = dispatch_result_with_store(
        &mut session,
        None,
        "project.inspect-rebuilt-package",
        json!({
            "compilerCommit": "controlled-commit",
            "minimumEngineVersion": "0.1.0"
        }),
    )
    .expect_err("media resolution must not bypass durable project storage");
    assert_eq!(
        error,
        "project.inspect-rebuilt-package requires serve-project so declared media can be read from the durable blob store"
    );
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn rebuilt_archive_publication_is_atomic_extension_checked_and_no_clobber() {
    let documents = [
        ("content.json", b"content".as_slice()),
        ("world.json", b"world".as_slice()),
        ("scenario.json", b"scenario".as_slice()),
        ("assets/index.json", b"assets".as_slice()),
    ];
    let inputs = documents
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect::<Vec<_>>();
    let snapshot = publication_snapshot();
    let manifest = providence_core::rebuilt::compile_rebuilt_v3_manifest(
        &snapshot,
        &RebuiltV3CompilerIdentity {
            version: "0.1.0".into(),
            commit: "controlled-commit".into(),
            minimum_engine_version: "0.1.0".into(),
        },
        &["realmz.world.topology-v2".into()],
        &inputs,
    )
    .expect("manifest");
    assert_rebuilt_export_plan(&manifest, &inputs);
    let temporary = tempdir().expect("temporary root");
    let path = temporary.path().join("fixture.REALMZ2");

    let bytes = publish_rebuilt_archive(&path, &manifest, &inputs).expect("publish archive");
    let published = fs::read(&path).expect("read published archive");
    assert_eq!(bytes, published.len() as u64);
    let original = published.clone();
    let error = publish_rebuilt_archive(&path, &manifest, &inputs)
        .expect_err("existing package must not be overwritten");
    assert!(error.contains("refusing to overwrite"));
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(
        publish_rebuilt_archive(&temporary.path().join("fixture.zip"), &manifest, &inputs),
        Err("Rebuilt package output path must end in .realmz2".into())
    );
    assert!(
        publish_rebuilt_archive(
            &temporary.path().join("missing").join("fixture.realmz2"),
            &manifest,
            &inputs
        )
        .unwrap_err()
        .contains("output directory does not exist")
    );
}

#[test]
fn no_edit_inspection_is_exact_with_preserved_missing_imported_reference() {
    let temporary = tempdir().expect("temporary root");
    let mut initial = ProjectSnapshot::new_authored(StableId("no-edit-adapter".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &initial)
        .expect("create project store");
    let mut data_ld = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE * 2];
    data_ld[0..2].copy_from_slice(&(-1091_i16).to_be_bytes());
    let data_dd = vec![0; ACTION_POINT_LEVEL_BYTES];
    let data_ld_blob = store.put_blob(&data_ld).expect("store Data LD");
    let data_dd_blob = store.put_blob(&data_dd).expect("store Data DD");
    let annex_blob = store.put_blob(b"no-edit annex").expect("store annex");
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -1091;
    initial.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Unresolved legacy overlay".into(),
        tiles,
        runtime: None,
    });
    initial.origin = ProjectOrigin::Imported {
        compatibility_annex: annex_blob,
    };
    initial.classic_sources = vec![
        ClassicSourceBlob {
            native_path: "Data DD".into(),
            blob: data_dd_blob,
            byte_length: data_dd.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Data LD".into(),
            blob: data_ld_blob,
            byte_length: data_ld.len() as u64,
        },
    ];
    let session = EditorSession::new(initial);

    let inspected = compile_project_classic_slice_with_application(
        &session,
        &store,
        None,
        json!({}),
        ClassicManifestOperation::InspectNoEdit,
    )
    .expect("inspect exact no-edit reconstruction");
    assert_eq!(inspected["exact"], true);
    assert_eq!(inspected["files"].as_array().unwrap().len(), 2);
    assert_eq!(inspected["publishStatus"], "ready-with-warnings");
    assert!(
        inspected["publishBlockerCounts"]
            .as_object()
            .unwrap()
            .is_empty()
    );
    assert!(!temporary.path().join("classic-output").exists());
}

#[test]
fn owned_edit_inspection_is_bounded_and_does_not_waive_publish_readiness() {
    let temporary = tempdir().expect("temporary root");
    let mut initial = ProjectSnapshot::new_authored(StableId("owned-edit-adapter".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &initial)
        .expect("create project store");
    let mut data_ld = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE * 2];
    data_ld[0..2].copy_from_slice(&(-1091_i16).to_be_bytes());
    let data_dd = vec![0; ACTION_POINT_LEVEL_BYTES];
    let data_ld_blob = store.put_blob(&data_ld).expect("store Data LD");
    let data_dd_blob = store.put_blob(&data_dd).expect("store Data DD");
    let annex_blob = store.put_blob(b"owned-edit annex").expect("store annex");
    let mut tiles = vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE];
    tiles[0] = -1090;
    initial.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Edited unresolved legacy overlay".into(),
        tiles,
        runtime: None,
    });
    initial.origin = ProjectOrigin::Imported {
        compatibility_annex: annex_blob,
    };
    initial.classic_sources = vec![
        ClassicSourceBlob {
            native_path: "Data DD".into(),
            blob: data_dd_blob,
            byte_length: data_dd.len() as u64,
        },
        ClassicSourceBlob {
            native_path: "Data LD".into(),
            blob: data_ld_blob,
            byte_length: data_ld.len() as u64,
        },
    ];
    let session = EditorSession::new(initial);

    let inspected = compile_project_classic_slice_with_application(
        &session,
        &store,
        None,
        json!({"limit": 1}),
        ClassicManifestOperation::InspectOwnedEdit,
    )
    .expect("inspect fixed-record ownership");
    assert_eq!(inspected["withinDeclaredOwnership"], true);
    assert_eq!(inspected["fileCount"], 2);
    assert_eq!(inspected["exactFileCount"], 1);
    assert_eq!(inspected["changedFilesTotal"], 1);
    assert_eq!(inspected["changedFilesTruncated"], false);
    assert_eq!(inspected["changedFiles"][0]["family"], "land-maps");
    assert_ne!(inspected["publishStatus"], "ready");
    assert!(!temporary.path().join("classic-output").exists());
}

#[test]
fn classic_directory_publication_is_atomic_validated_and_no_clobber() {
    let temporary = tempdir().expect("temporary root");
    let output = temporary.path().join("published-scenario");
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "action-reference.retarget",
        json!({
            "expectedRevision": 0,
            "source": "action-point:land:0:17",
            "slot": 0,
            "targetNativeId": 47
        }),
    )
    .expect("repair before certification compile");

    let first = dispatch_result(
        &mut session,
        "project.compile-classic-slice",
        json!({"directory": output}),
    )
    .expect("publish complete Classic directory");
    let original = fs::read(output.join("Data DD")).expect("published Data DD");
    let error = dispatch_result(
        &mut session,
        "project.compile-classic-slice",
        json!({"directory": output}),
    )
    .expect_err("existing output must not be overwritten");
    assert!(error.contains("refusing to overwrite"));
    assert_eq!(fs::read(output.join("Data DD")).unwrap(), original);
    assert_eq!(first["files"].as_array().unwrap().len(), 6);
    assert!(fs::read_dir(temporary.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".providence-classic-")
    }));

    assert_classic_destination_rejections(&mut session, temporary.path());
    assert_classic_manifest_rejections(temporary.path());
}

#[test]
fn compatibility_classification_refuses_an_uncertified_rebuilt_package() {
    let mut session = EditorSession::new(demo_snapshot());
    let result =
        dispatch_result(&mut session, "compatibility.classify", json!({})).expect("classification");
    assert_eq!(result[0]["target"], "classic-certification-slice");
    assert_eq!(result[0]["status"], "blocked");
    assert_eq!(result[1]["target"], "rebuilt-package-v3");
    assert_eq!(result[1]["status"], "blocked");
    assert!(
        result[1]["blockers"]
            .as_array()
            .unwrap()
            .iter()
            .any(|blocker| blocker["code"] == "rebuilt.terrain-catalog.unavailable")
    );
    let compile_error = dispatch_result(
        &mut session,
        "project.compile-classic-slice",
        json!({"directory": "unused"}),
    )
    .expect_err("dangling reference must block certification compile");
    assert!(compile_error.contains("reference.unresolved"));
}

#[test]
fn rebuilt_content_inspection_never_returns_a_partial_document() {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "missing-content-inputs".into(),
    )));
    let error = dispatch_result(&mut session, "project.inspect-rebuilt-content", json!({}))
        .expect_err("incomplete content document must fail");
    assert_eq!(error, "content.json requires canonical campaign metadata");
}

fn publication_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("publish-fixture".into()));
    snapshot.campaign = Some(CampaignMetadata {
        name: "Publish Fixture".into(),
        version: "1.0".into(),
        author: "Providence".into(),
        creator_user_check: String::new(),
        contact: providence_core::model::CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Authored,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 1,
        maximum_party_levels: 1,
        guidance_authored: true,
        restrictions: providence_core::model::CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 1,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 0, y: 0 },
    });
    snapshot
}

fn assert_rebuilt_export_plan(
    manifest: &providence_core::rebuilt::RebuiltV3ManifestArtifact,
    inputs: &[RebuiltV3FileInput<'_>],
) {
    let plan = serde_json::to_value(rebuilt_export_plan::page(
        &manifest.manifest.files,
        manifest.canonical_json.len(),
        0,
        64,
    ))
    .unwrap();
    assert_eq!(plan["total"], 5);
    assert_eq!(
        plan["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["path"].as_str().unwrap())
            .collect::<Vec<_>>(),
        [
            "assets/index.json",
            "content.json",
            "manifest.json",
            "scenario.json",
            "world.json"
        ]
    );
    for row in plan["items"].as_array().unwrap() {
        let name = row["path"].as_str().unwrap();
        let expected = if name == "manifest.json" {
            manifest.canonical_json.len()
        } else {
            inputs
                .iter()
                .find(|input| input.path == name)
                .unwrap()
                .bytes
                .len()
        };
        assert_eq!(row["bytes"], expected);
    }
}

fn assert_classic_destination_rejections(session: &mut EditorSession, root: &std::path::Path) {
    let existing = root.join("existing");
    fs::create_dir(&existing).unwrap();
    fs::write(existing.join("keep.txt"), b"owned").unwrap();
    let error = dispatch_result(
        session,
        "project.compile-classic-slice",
        json!({"directory": existing}),
    )
    .expect_err("nonempty destination must not be touched");
    assert!(error.contains("refusing to overwrite"));
    assert_eq!(fs::read(existing.join("keep.txt")).unwrap(), b"owned");
    assert_eq!(fs::read_dir(&existing).unwrap().count(), 1);

    let missing_parent = root.join("missing").join("scenario");
    let error = dispatch_result(
        session,
        "project.compile-classic-slice",
        json!({"directory": missing_parent}),
    )
    .expect_err("missing parent must not be created");
    assert!(error.contains("parent directory does not exist"));
    assert!(!root.join("missing").exists());
}

fn assert_classic_manifest_rejections(root: &std::path::Path) {
    let mut invalid = NativeManifest::default();
    invalid.insert_preserved(
        "../escape",
        providence_core::model::BlobId(format!("sha256:{}", "a".repeat(64))),
        b"escape".to_vec(),
    );
    let invalid_output = root.join("invalid");
    let error = publish_classic_directory(&invalid_output, &invalid)
        .expect_err("manifest traversal must be refused");
    assert!(error.contains("one native filename"));
    assert!(!invalid_output.exists());
    assert!(!root.join("escape").exists());

    let mut complete = NativeManifest::default();
    complete.insert_generated(
        "Certified Scenario",
        providence_core::codecs::NativeFileFamily::ScenarioStartup,
        vec![0; 316],
    );
    let wrong_name = root.join("wrong-name");
    let error = publish_classic_directory(&wrong_name, &complete)
        .expect_err("full scenario directory must match its startup filename");
    assert!(error.contains("must be named Certified Scenario"));
    assert!(!wrong_name.exists());

    let exact_name = root.join("Certified Scenario");
    publish_classic_directory(&exact_name, &complete)
        .expect("matching full scenario directory name");
    assert!(exact_name.join("Certified Scenario").is_file());
}
