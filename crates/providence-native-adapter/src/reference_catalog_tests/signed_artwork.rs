use super::fixtures::controlled_catalog_with_id;
use super::rebuilt_selection::verify_rebuilt_item_artwork_inputs;
use crate::reference_catalog::apply_item_artwork;
use providence_core::codecs::ResourceEntry;
use providence_core::model::{AssetDescriptor, ClassicSourceBlob, ProjectSnapshot, StableId};
use providence_core::reference_library::ReferenceCatalog;
use providence_core::session::EditorSession;
use providence_storage::{ProjectStore, ReferenceCatalogStore};
use serde_json::json;
use std::fs;

#[test]
fn signed_item_artwork_survives_storage_classic_output_and_rebuilt_selection() {
    let (temporary, catalog, _) = controlled_catalog_with_id(-189);
    let (library, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("signed-artwork".into()));
    let root = temporary.path().join("project");
    let project = ProjectStore::create(&root, &snapshot).unwrap();
    let source = project.put_blob(&vec![0; 20_000]).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        source.clone(),
        None,
    )
    .unwrap()
    .rules;
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data NI".into(),
        blob: source,
        byte_length: 20_000,
    });
    let mut asset = catalog
        .assets
        .iter()
        .find(|entry| entry.descriptor.kind == "bag-item")
        .unwrap()
        .descriptor
        .clone();
    asset.identity = StableId("item-artwork:-189".into());
    asset.kind = "icon".into();
    snapshot = assign_with_history(snapshot, &project, &catalog, &library);
    verify_unused_artwork(&snapshot, &project, &temporary);
    reject_invalid_artwork(&snapshot, &asset);
    project.save_snapshot(&snapshot).unwrap();
    let (reopened, saved) = ProjectStore::open(&root).unwrap();
    assert_eq!(saved, snapshot);
    let session = EditorSession::new(saved);
    let (first, data) = compile_signed_exports(&temporary, &session, &reopened);
    verify_owned_bytes(&session, &reopened, &temporary, &data);
    let picture = verify_resource_selection(&session, &reopened, &first, &asset);
    let (imported_store, imported) = reimport_artwork(&temporary, &first, &asset);
    verify_reimported_export(&temporary, &imported, &imported_store, &data, &picture);
}

fn assign_with_history(
    mut snapshot: ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
) -> ProjectSnapshot {
    let before = snapshot.clone();
    let mut assigning = EditorSession::new(snapshot);
    apply_item_artwork(
        &mut assigning,
        Some(project),
        Some(catalog),
        Some(library),
        &json!({"identity": "divinity:bag-item:-189", "recordIndex": 0, "expectedRevision": 0}),
    )
    .unwrap();
    snapshot = assigning.snapshot().clone();
    crate::dispatch_result_with_store(
        &mut assigning,
        Some(project),
        "history.undo",
        json!({"expectedRevision": 1}),
    )
    .unwrap();
    assert_eq!(assigning.snapshot(), &before);
    crate::dispatch_result_with_store(
        &mut assigning,
        Some(project),
        "history.redo",
        json!({"expectedRevision": 2}),
    )
    .unwrap();
    assert_eq!(assigning.snapshot(), &snapshot);
    snapshot
}

fn verify_unused_artwork(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    temporary: &tempfile::TempDir,
) {
    let mut unused = snapshot.clone();
    unused.scenario_item_rules[0].definition.icon_id = 0;
    let unused_root = temporary.path().join("unused-artwork");
    crate::classic_compilation::compile_project_classic_slice(
        &EditorSession::new(unused),
        project,
        json!({"directory": unused_root}),
    )
    .unwrap();
    let unused_resources = providence_core::codecs::parse_resource_entries(
        &fs::read(unused_root.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    assert!(
        unused_resources
            .iter()
            .any(|entry| entry.resource_type == *b"cicn" && entry.id == -189)
    );
}

fn reject_invalid_artwork(snapshot: &ProjectSnapshot, asset: &AssetDescriptor) {
    for case in ["portrait", "duplicate", "missing-payload", "out-of-range"] {
        let mut invalid = snapshot.clone();
        match case {
            "portrait" => invalid.assets[0].kind = "portrait".into(),
            "duplicate" => {
                let mut duplicate = asset.clone();
                duplicate.identity = StableId("different-artwork".into());
                duplicate.kind = "special-land-tile".into();
                invalid.assets.push(duplicate);
            }
            "missing-payload" => invalid.assets[0].classic_payload_blob = None,
            "out-of-range" => {
                invalid.assets[0]
                    .classic_resource
                    .as_mut()
                    .unwrap()
                    .resource_id = -32769;
                invalid.scenario_item_rules[0].definition.icon_id = -32769;
            }
            _ => unreachable!(),
        }
        assert!(
            providence_core::compatibility::classify_classic_slice(&invalid)
                .blockers
                .iter()
                .any(|blocker| blocker.code == "classic.scenario-icon.invalid"),
            "{case}"
        );
    }
}

fn compile_signed_exports(
    temporary: &tempfile::TempDir,
    session: &EditorSession,
    reopened: &ProjectStore,
) -> (std::path::PathBuf, Vec<u8>) {
    let first = temporary.path().join("classic-first");
    let second = temporary.path().join("classic-second");
    let a = crate::classic_compilation::compile_project_classic_slice(
        session,
        reopened,
        json!({"directory": first}),
    )
    .unwrap();
    let b = crate::classic_compilation::compile_project_classic_slice(
        session,
        reopened,
        json!({"directory": second}),
    )
    .unwrap();
    assert_eq!(a["manifestSha256"], b["manifestSha256"]);
    let data = fs::read(first.join("Data NI")).unwrap();
    assert_eq!(&data[4..6], &(-189_i16).to_be_bytes());
    (first, data)
}

fn verify_owned_bytes(
    session: &EditorSession,
    reopened: &ProjectStore,
    temporary: &tempfile::TempDir,
    data: &[u8],
) {
    let mut baseline = session.snapshot().clone();
    baseline.scenario_item_rules[0].definition.icon_id = 9000;
    baseline.assets[0]
        .classic_resource
        .as_mut()
        .unwrap()
        .resource_id = 9000;
    let baseline_root = temporary.path().join("classic-baseline");
    crate::classic_compilation::compile_project_classic_slice(
        &EditorSession::new(baseline),
        reopened,
        json!({"directory": baseline_root}),
    )
    .unwrap();
    let baseline_bytes = fs::read(baseline_root.join("Data NI")).unwrap();
    assert_eq!(data.len(), baseline_bytes.len());
    assert!(
        data.iter()
            .zip(&baseline_bytes)
            .enumerate()
            .all(|(index, (actual, before))| (4..6).contains(&index) || actual == before)
    );
    let decoded = providence_core::codecs::decode_scenario_item_rules(
        data,
        None,
        session.snapshot().scenario_item_rules[0]
            .source_blob
            .clone(),
        None,
    )
    .unwrap();
    assert_eq!(decoded.rules[0].definition.icon_id, -189);
}

fn verify_resource_selection(
    session: &EditorSession,
    reopened: &ProjectStore,
    first: &std::path::Path,
    asset: &AssetDescriptor,
) -> ResourceEntry {
    let resources = providence_core::codecs::parse_resource_entries(
        &fs::read(first.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    let picture = resources
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == -189)
        .unwrap();
    assert_eq!(
        picture.data,
        reopened
            .read_blob(asset.classic_payload_blob.as_ref().unwrap())
            .unwrap()
    );
    verify_rebuilt_item_artwork_inputs(session.snapshot(), reopened, asset);
    picture.clone()
}

fn reimport_artwork(
    temporary: &tempfile::TempDir,
    first: &std::path::Path,
    asset: &AssetDescriptor,
) -> (ProjectStore, EditorSession) {
    let mut imported_snapshot = ProjectSnapshot::new_authored(StableId("signed-reimport".into()));
    let imported_store =
        ProjectStore::create(temporary.path().join("reimport"), &imported_snapshot).unwrap();
    // Full import captures sources separately from the individual family decoders.
    imported_snapshot.classic_sources =
        crate::scenario_import::capture_scenario_sources(&imported_store, first, "classic-first")
            .unwrap()
            .0;
    let mut imported = EditorSession::new(imported_snapshot);
    crate::rule_import::import_scenario_items(
        &mut imported,
        Some(&imported_store),
        json!({"path": first.join("Data NI"), "expectedRevision": 0}),
    )
    .unwrap();
    crate::classic_media_import::import_classic_media(
        &mut imported,
        Some(&imported_store),
        json!({"directory": first, "expectedRevision": 1}),
    )
    .unwrap();
    assert_eq!(
        imported.snapshot().scenario_item_rules[0]
            .definition
            .icon_id,
        -189
    );
    let imported_asset = imported
        .snapshot()
        .assets
        .iter()
        .find(|entry| {
            entry
                .classic_resource
                .as_ref()
                .is_some_and(|key| key.resource_type == "cicn" && key.resource_id == -189)
        })
        .unwrap();
    assert_eq!(
        imported_asset.classic_payload_blob,
        asset.classic_payload_blob
    );
    verify_rebuilt_item_artwork_inputs(imported.snapshot(), &imported_store, imported_asset);
    (imported_store, imported)
}

fn verify_reimported_export(
    temporary: &tempfile::TempDir,
    imported: &EditorSession,
    imported_store: &ProjectStore,
    data: &[u8],
    picture: &ResourceEntry,
) {
    let roundtrip_root = temporary.path().join("classic-reimported");
    crate::classic_compilation::compile_project_classic_slice(
        imported,
        imported_store,
        json!({"directory": roundtrip_root}),
    )
    .unwrap();
    assert_eq!(fs::read(roundtrip_root.join("Data NI")).unwrap(), data);
    let roundtrip_resources = providence_core::codecs::parse_resource_entries(
        &fs::read(roundtrip_root.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    assert_eq!(
        roundtrip_resources
            .iter()
            .find(|entry| entry.resource_type == *b"cicn" && entry.id == -189)
            .unwrap(),
        picture
    );
}
