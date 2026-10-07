use super::fixtures::controlled_catalog_with_id;
use crate::reference_catalog::apply_stock_item_artwork;
use providence_core::codecs::{ResourceEntry, write_resource_fork};
use providence_core::model::{AssetDescriptor, ClassicSourceBlob, ProjectSnapshot, StableId};
use providence_core::rebuilt::{
    ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource,
};
use providence_core::session::{EditorCommand, EditorSession};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::fs;

#[test]
fn stock_assignment_is_a_reference_only_and_rejects_shadowing_and_ambiguity() {
    let (temp, supplied, _) = controlled_catalog_with_id(9000);
    let mut descriptor = supplied.assets[0].descriptor.clone();
    descriptor.identity = StableId("stock:9000".into());
    descriptor.kind = "icon".into();
    let source = StableId("stock-source".into());
    let mut catalog = ApplicationMediaCatalog::empty(StableId("stock".into()));
    catalog.sources.push(ApplicationMediaSource {
        identity: source.clone(),
        native_name: "Stock fixture".into(),
        priority: 1,
        blob: descriptor.blob.clone(),
        byte_length: descriptor.byte_length,
    });
    catalog.assets.push(ApplicationMediaAsset {
        source,
        source_priority: 1,
        descriptor: descriptor.clone(),
    });
    let mut snapshot = ProjectSnapshot::new_authored(StableId("stock-test".into()));
    let project = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20000],
        None,
        project.put_blob(&vec![0; 20000]).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    let params = json!({"identity":"stock:9000","recordIndex":0,"expectedRevision":0});
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data NI".into(),
        blob: snapshot.scenario_item_rules[0].source_blob.clone(),
        byte_length: 20_000,
    });
    let mut session = EditorSession::new(snapshot.clone());
    assign_reference_only(&mut session, &project, &catalog, &params, &descriptor);
    let reopened = verify_stock_history(&mut session, &project);
    verify_stock_export(&temp, &project, &catalog, &reopened);
    reject_scenario_shadowing(&snapshot, &project, &catalog, &params, &descriptor);
    reject_retained_shadowing(&snapshot, &project, &catalog, &params);
    reject_ambiguous_application(&snapshot, &project, catalog, &params);
}

fn assign_reference_only(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ApplicationMediaCatalog,
    params: &Value,
    descriptor: &AssetDescriptor,
) {
    crate::dispatch_result_with_catalogs(
        session,
        Some(project),
        crate::CatalogViews {
            application_media: Some(catalog),
            ..Default::default()
        },
        None,
        "scenario-item.use-stock-artwork",
        params.clone(),
    )
    .unwrap();
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        9000
    );
    assert!(session.snapshot().assets.is_empty());
    assert!(project.read_blob(&descriptor.blob).is_err());
    assert!(
        project
            .read_blob(descriptor.classic_payload_blob.as_ref().unwrap())
            .is_err()
    );
}

fn verify_stock_history(session: &mut EditorSession, project: &ProjectStore) -> EditorSession {
    crate::execute(session, &json!({"expectedRevision":1}), EditorCommand::Undo).unwrap();
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        0
    );
    crate::execute(session, &json!({"expectedRevision":2}), EditorCommand::Redo).unwrap();
    project
        .checkpoint_session(session, &json!({"method":"stock-test"}))
        .unwrap();
    let (_, reopened) = ProjectStore::open_session(project.root()).unwrap();
    assert!(reopened.snapshot().assets.is_empty());
    assert_eq!(
        reopened.snapshot().scenario_item_rules[0]
            .definition
            .icon_id,
        9000
    );
    reopened
}

fn verify_stock_export(
    temp: &tempfile::TempDir,
    project: &ProjectStore,
    catalog: &ApplicationMediaCatalog,
    reopened: &EditorSession,
) {
    let output = temp.path().join("compiled-stock-reference");
    crate::classic_compilation::compile_project_classic_slice_with_application(
        reopened,
        project,
        Some(catalog),
        json!({"directory":output}),
        crate::classic_compilation::ClassicManifestOperation::Publish,
    )
    .unwrap();
    assert!(output.join("Data NI").is_file());
    if output.join("Scenario.rsrc").is_file() {
        let entries = providence_core::codecs::parse_resource_entries(
            &fs::read(output.join("Scenario.rsrc")).unwrap(),
        )
        .unwrap();
        assert!(
            !entries
                .iter()
                .any(|entry| entry.resource_type == *b"cicn" && entry.id == 9000)
        );
    }
}

fn reject_scenario_shadowing(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ApplicationMediaCatalog,
    params: &Value,
    descriptor: &AssetDescriptor,
) {
    let mut shadowed = snapshot.clone();
    shadowed.assets.push(descriptor.clone());
    let mut shadowed_session = EditorSession::new(shadowed.clone());
    assert!(
        apply_stock_item_artwork(&mut shadowed_session, Some(project), Some(catalog), params)
            .is_err()
    );
    assert_eq!(shadowed_session.snapshot(), &shadowed);
}

fn reject_retained_shadowing(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    catalog: &ApplicationMediaCatalog,
    params: &Value,
) {
    let fork = write_resource_fork(&[ResourceEntry {
        resource_type: *b"cicn",
        id: 9000,
        name: "Undecoded".into(),
        attributes: 0,
        data: vec![1, 2, 3],
    }])
    .unwrap();
    let mut retained = snapshot.clone();
    retained.classic_sources.push(ClassicSourceBlob {
        native_path: "Scenario.rsrc".into(),
        blob: project.put_blob(&fork).unwrap(),
        byte_length: fork.len() as u64,
    });
    let mut retained_session = EditorSession::new(retained.clone());
    assert!(
        apply_stock_item_artwork(&mut retained_session, Some(project), Some(catalog), params)
            .is_err()
    );
    assert_eq!(retained_session.snapshot(), &retained);
}

fn reject_ambiguous_application(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    mut catalog: ApplicationMediaCatalog,
    params: &Value,
) {
    catalog.assets.push(catalog.assets[0].clone());
    let mut ambiguous = EditorSession::new(snapshot.clone());
    assert!(
        apply_stock_item_artwork(&mut ambiguous, Some(project), Some(&catalog), params).is_err()
    );
    assert_eq!(ambiguous.snapshot(), snapshot);
}
