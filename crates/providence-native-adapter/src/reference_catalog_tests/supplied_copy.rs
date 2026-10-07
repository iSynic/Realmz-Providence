use super::fixtures::controlled_catalog_with_id;
use crate::reference_catalog::{MAX_PREVIEW_BYTES, copy_artwork};
use providence_core::codecs::{ResourceEntry, write_resource_fork};
use providence_core::model::{AssetDescriptor, ClassicSourceBlob, ProjectSnapshot, StableId};
use providence_core::reference_library::ReferenceCatalog;
use providence_core::session::{EditorCommand, EditorSession};
use providence_storage::{ProjectStore, ReferenceCatalogStore};
use serde_json::{Value, json};
use std::fs;

#[test]
fn supplied_copy_is_independent_renumbered_and_never_overwrites() {
    let (temp, catalog, _) = controlled_catalog_with_id(-164);
    let (library, _) = ReferenceCatalogStore::open(temp.path().join("catalog")).unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("supplied-copy".into()));
    let project = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    let original = &catalog.assets[0].descriptor;
    let params = json!({"identity":original.identity,"resourceId":30126,"expectedRevision":0});
    let mut session = EditorSession::new(snapshot.clone());
    let owned = copy_and_check_identity(&mut session, &project, &catalog, &library, &params);
    reject_duplicate_copy(&mut session, &project, &catalog, &library, &params, &owned);
    verify_copy_history_and_export(&temp, &project, &library, original, &mut session, &owned);
    reject_invalid_numbers(&snapshot, &project, &catalog, &library, &params);
    reject_retained_key(&snapshot, &project, &catalog, &library, &params);
    reject_application_key(&snapshot, &project, &catalog, &library, &params, original);
}

fn copy_and_check_identity(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
) -> ProjectSnapshot {
    let original = &catalog.assets[0].descriptor;
    let available = crate::artwork_conflict::check(session, Some(project), None, params).unwrap();
    assert_eq!(available["available"], true);
    crate::dispatch_result_with_catalogs(
        session,
        Some(project),
        crate::CatalogViews {
            reference_catalog: Some(catalog),
            reference_catalog_store: Some(library),
            ..Default::default()
        },
        None,
        "reference-catalog.copy-icon",
        params.clone(),
    )
    .unwrap();
    assert_eq!(session.revision().0, 1);
    let copied = &session.snapshot().assets[0];
    assert_eq!(copied.classic_resource.as_ref().unwrap().resource_id, 30126);
    assert_eq!(copied.classic_payload_blob, original.classic_payload_blob);
    assert_eq!(
        original.classic_resource.as_ref().unwrap().resource_id,
        -164
    );
    session.snapshot().clone()
}

fn reject_duplicate_copy(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
    owned: &ProjectSnapshot,
) {
    let occupied = crate::artwork_conflict::check(
        session,
        Some(project),
        None,
        &json!({"resourceId":30126,"expectedRevision":1}),
    )
    .unwrap();
    assert_eq!(occupied["available"], false);
    assert_eq!(occupied["existing"]["identity"], "item-artwork:30126");
    assert_eq!(occupied["existing"]["previewCommand"], "icon.preview");
    assert!(occupied.to_string().len() < 1024);
    assert!(crate::artwork_conflict::check(session, Some(project), None, params).is_err());
    assert_eq!(session.snapshot(), owned);
    let mut retry = params.clone();
    retry["expectedRevision"] = json!(1);
    assert!(
        copy_artwork(
            session,
            Some(project),
            Some(catalog),
            Some(library),
            None,
            &retry
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), owned);
}

fn verify_copy_history_and_export(
    temp: &tempfile::TempDir,
    project: &ProjectStore,
    library: &ReferenceCatalogStore,
    original: &AssetDescriptor,
    session: &mut EditorSession,
    owned: &ProjectSnapshot,
) {
    crate::execute(session, &json!({"expectedRevision":1}), EditorCommand::Undo).unwrap();
    assert!(session.snapshot().assets.is_empty());
    crate::execute(session, &json!({"expectedRevision":2}), EditorCommand::Redo).unwrap();
    project
        .checkpoint_session(session, &json!({"method":"supplied-copy-test"}))
        .unwrap();
    let (_, reopened) = ProjectStore::open_session(project.root()).unwrap();
    assert_eq!(reopened.snapshot().assets, owned.assets);
    let out = temp.path().join("compiled");
    crate::classic_compilation::compile_project_classic_slice(
        &reopened,
        project,
        json!({"directory":out}),
    )
    .unwrap();
    let entries = providence_core::codecs::parse_resource_entries(
        &fs::read(out.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    let copied = entries
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == 30126)
        .unwrap();
    assert_eq!(
        copied.data,
        library
            .read_blob_bounded(
                original.classic_payload_blob.as_ref().unwrap(),
                MAX_PREVIEW_BYTES
            )
            .unwrap()
    );
}

fn reject_invalid_numbers(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
) {
    for number in [0_i64, 32768, -32769] {
        let mut invalid = params.clone();
        invalid["resourceId"] = json!(number);
        let mut fresh = EditorSession::new(snapshot.clone());
        assert!(
            copy_artwork(
                &mut fresh,
                Some(project),
                Some(catalog),
                Some(library),
                None,
                &invalid
            )
            .is_err()
        );
        assert_eq!(fresh.snapshot(), snapshot);
    }
}

fn reject_retained_key(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
) {
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"cicn",
        id: 30126,
        name: String::new(),
        attributes: 0,
        data: vec![0],
    }])
    .unwrap();
    let mut retained = snapshot.clone();
    retained.classic_sources.push(ClassicSourceBlob {
        native_path: "Scenario.rsrc".into(),
        blob: project.put_blob(&fork).unwrap(),
        byte_length: fork.len() as u64,
    });
    let mut rejected = EditorSession::new(retained.clone());
    let retained_check =
        crate::artwork_conflict::check(&rejected, Some(project), None, params).unwrap();
    assert_eq!(retained_check["available"], false);
    assert_eq!(retained_check["existing"]["previewCommand"], "");
    assert!(
        copy_artwork(
            &mut rejected,
            Some(project),
            Some(catalog),
            Some(library),
            None,
            params
        )
        .is_err()
    );
    assert_eq!(rejected.snapshot(), &retained);
}

fn reject_application_key(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    params: &Value,
    original: &AssetDescriptor,
) {
    let mut stock =
        providence_core::rebuilt::ApplicationMediaCatalog::empty(StableId("stock".into()));
    let mut stock_icon = original.clone();
    stock_icon.classic_resource.as_mut().unwrap().resource_id = 30126;
    stock
        .assets
        .push(providence_core::rebuilt::ApplicationMediaAsset {
            source: StableId("stock-source".into()),
            source_priority: 1,
            descriptor: stock_icon,
        });
    let mut fresh = EditorSession::new(snapshot.clone());
    let stock_check =
        crate::artwork_conflict::check(&fresh, Some(project), Some(&stock), params).unwrap();
    assert_eq!(stock_check["available"], false);
    assert_eq!(stock_check["existing"]["ownership"], "stock");
    assert!(
        copy_artwork(
            &mut fresh,
            Some(project),
            Some(catalog),
            Some(library),
            Some(&stock),
            params
        )
        .is_err()
    );
    assert_eq!(fresh.snapshot(), snapshot);
}
