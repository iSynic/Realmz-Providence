use super::fixtures::controlled_catalog_with_id;
use super::rebuilt_selection::verify_rebuilt_item_artwork_inputs;
use crate::reference_catalog::apply_item_artwork;
use providence_core::codecs::{ResourceEntry, write_resource_fork};
use providence_core::model::{AssetDescriptor, ClassicSourceBlob, ProjectSnapshot, StableId};
use providence_core::reference_library::ReferenceCatalog;
use providence_core::session::EditorSession;
use providence_storage::{ProjectStore, ReferenceCatalogStore};
use serde_json::{Value, json};
use std::fs;

#[test]
fn library_artwork_assignment_retains_payloads_across_save_reopen_and_classic_export() {
    let (temporary, catalog, _) = controlled_catalog_with_id(9000);
    let (library, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("artwork-project".into()));
    let root = temporary.path().join("project");
    let project = ProjectStore::create(&root, &snapshot).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        project.put_blob(&vec![0; 20_000]).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data NI".into(),
        blob: snapshot.scenario_item_rules[0].source_blob.clone(),
        byte_length: 20_000,
    });
    let mut session = EditorSession::new(snapshot);
    let params =
        json!({"identity": "divinity:vault-icon:9000", "recordIndex": 0, "expectedRevision": 0});
    reject_corrupt_destination(&mut session, &project, &catalog, &library, &params, &root);
    assign_library_artwork(&mut session, &project, &catalog, &library, params);
    let asset = session.snapshot().assets[0].clone();
    project.save_snapshot(session.snapshot()).unwrap();
    drop(library);
    let (reopened, snapshot) = ProjectStore::open(&root).unwrap();
    assert_eq!(&snapshot, session.snapshot());
    verify_saved_payloads(&reopened, &asset, &catalog);
    let reopened_session = EditorSession::new(snapshot);
    verify_library_export(&temporary, &reopened_session, &reopened, &asset);
}

fn reject_corrupt_destination(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
    root: &std::path::Path,
) {
    let selected = catalog
        .assets
        .iter()
        .find(|asset| asset.descriptor.identity.0 == "divinity:vault-icon:9000")
        .unwrap();
    let digest = selected
        .descriptor
        .classic_payload_blob
        .as_ref()
        .unwrap()
        .0
        .strip_prefix("sha256:")
        .unwrap();
    let corrupt_path = root.join("blobs").join("sha256").join(digest);
    fs::write(&corrupt_path, b"corrupt destination payload").unwrap();
    let before = session.snapshot().clone();
    assert!(
        apply_item_artwork(session, Some(project), Some(catalog), Some(library), params,).is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision().0, 0);
    assert!(!session.can_undo());
    fs::remove_file(corrupt_path).unwrap();
}

fn assign_library_artwork(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: Value,
) {
    let result = crate::dispatch_result_with_catalogs(
        session,
        Some(project),
        crate::CatalogViews {
            reference_catalog: Some(catalog),
            reference_catalog_store: Some(library),
            ..Default::default()
        },
        None,
        "scenario-item.apply-library-artwork",
        params,
    )
    .unwrap();
    assert_eq!(result["revision"], 1);
    assert!(result.to_string().len() < 4096);
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        9000
    );
}

fn verify_saved_payloads(
    reopened: &ProjectStore,
    asset: &AssetDescriptor,
    catalog: &ReferenceCatalog,
) {
    assert_eq!(
        reopened.read_blob(&asset.blob).unwrap().len() as u64,
        asset.byte_length
    );
    assert_eq!(
        reopened
            .read_blob(asset.classic_payload_blob.as_ref().unwrap())
            .unwrap()
            .len() as u64,
        asset.classic_payload_byte_length.unwrap()
    );
    assert_eq!(catalog.assets[1].descriptor.kind, "vault-icon");
}

fn verify_library_export(
    temporary: &tempfile::TempDir,
    reopened_session: &EditorSession,
    reopened: &ProjectStore,
    asset: &AssetDescriptor,
) {
    let first = temporary.path().join("classic-first");
    let second = temporary.path().join("classic-second");
    let a = crate::classic_compilation::compile_project_classic_slice(
        reopened_session,
        reopened,
        json!({"directory": first}),
    )
    .unwrap();
    let b = crate::classic_compilation::compile_project_classic_slice(
        reopened_session,
        reopened,
        json!({"directory": second}),
    )
    .unwrap();
    assert_eq!(a["manifestSha256"], b["manifestSha256"]);
    let fork = fs::read(first.join("Scenario.rsrc")).unwrap();
    let resources = providence_core::codecs::parse_resource_entries(&fork).unwrap();
    let picture = resources
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == 9000)
        .unwrap();
    assert_eq!(
        picture.data,
        reopened
            .read_blob(asset.classic_payload_blob.as_ref().unwrap())
            .unwrap()
    );
    let items = providence_core::codecs::decode_scenario_item_rules(
        &fs::read(first.join("Data NI")).unwrap(),
        None,
        reopened_session.snapshot().scenario_item_rules[0]
            .source_blob
            .clone(),
        None,
    )
    .unwrap();
    assert_eq!(items.rules[0].definition.icon_id, 9000);
    verify_rebuilt_item_artwork_inputs(reopened_session.snapshot(), reopened, asset);
}

#[test]
fn library_artwork_assignment_rejects_stale_missing_and_undecoded_conflicting_resources() {
    let (temporary, catalog, _) = controlled_catalog_with_id(9000);
    let (library, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("artwork-project".into()));
    let project = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        project.put_blob(&vec![0; 20_000]).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"cicn",
        id: 9000,
        name: String::new(),
        attributes: 0,
        data: vec![1, 2, 3],
    }])
    .unwrap();
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Scenario.rsrc".into(),
        blob: project.put_blob(&fork).unwrap(),
        byte_length: fork.len() as u64,
    });
    let mut session = EditorSession::new(snapshot.clone());
    reject_library_conflicts(&mut session, &project, &catalog, &library, &snapshot);
    reject_unsupported_catalog(&mut session, &project, &catalog, &library, &snapshot);
}

fn reject_library_conflicts(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    snapshot: &ProjectSnapshot,
) {
    for (revision, identity, message) in [
        (1, "divinity:vault-icon:9000", "changed"),
        (0, "missing", "no longer"),
        (0, "divinity:vault-icon:9000", "Different scenario artwork"),
    ] {
        let error = apply_item_artwork(
            session,
            Some(project),
            Some(catalog),
            Some(library),
            &json!({"identity": identity, "recordIndex": 0, "expectedRevision": revision}),
        )
        .unwrap_err();
        assert!(error.contains(message), "{error}");
        assert_eq!(session.snapshot(), snapshot);
        assert_eq!(session.revision().0, 0);
    }
}

fn reject_unsupported_catalog(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    snapshot: &ProjectSnapshot,
) {
    let mut unsupported = catalog.clone();
    for asset in &mut unsupported.assets {
        asset
            .descriptor
            .classic_resource
            .as_mut()
            .unwrap()
            .resource_id = 0;
    }
    let error = apply_item_artwork(
        session,
        Some(project),
        Some(&unsupported),
        Some(library),
        &json!({"identity": "divinity:vault-icon:9000", "recordIndex": 0, "expectedRevision": 0}),
    )
    .unwrap_err();
    assert!(error.contains("not supported by the editor yet"));
    assert!(!error.contains("new scenario picture number"));
    assert_eq!(session.snapshot(), snapshot);
    assert_eq!(session.revision().0, 0);
}
