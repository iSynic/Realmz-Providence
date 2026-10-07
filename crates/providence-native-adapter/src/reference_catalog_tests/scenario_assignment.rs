use super::fixtures::controlled_catalog_with_id;
use crate::reference_catalog::{MAX_PREVIEW_BYTES, apply_scenario_item_artwork};
use providence_core::model::{AssetDescriptor, ProjectSnapshot, StableId};
use providence_core::session::{EditorCommand, EditorSession};
use providence_storage::{ProjectStore, ReferenceCatalogStore};
use serde_json::{Value, json};
use std::fs;

#[test]
fn scenario_assignment_reuses_owned_artwork_and_rejects_invalid_selection() {
    let (temp, catalog, _) = controlled_catalog_with_id(-164);
    let (library, _) = ReferenceCatalogStore::open(temp.path().join("catalog")).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-artwork".into()));
    let project = ProjectStore::create(temp.path().join("project"), &snapshot).unwrap();
    let mut native_items = vec![0; 20000];
    for record in 0..200 {
        native_items[record * 100 + 2..record * 100 + 4]
            .copy_from_slice(&(800_i16 + record as i16).to_be_bytes());
    }
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &native_items,
        None,
        project.put_blob(&native_items).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    let mut icon = catalog.assets[0].descriptor.clone();
    icon.kind = "icon".into();
    for blob in [&icon.blob, icon.classic_payload_blob.as_ref().unwrap()] {
        project
            .put_blob(&library.read_blob_bounded(blob, MAX_PREVIEW_BYTES).unwrap())
            .unwrap();
    }
    snapshot.assets.push(icon.clone());
    snapshot
        .classic_sources
        .push(providence_core::model::ClassicSourceBlob {
            native_path: "Data NI".into(),
            blob: snapshot.scenario_item_rules[0].source_blob.clone(),
            byte_length: 20000,
        });
    let params = json!({"identity":icon.identity,"recordIndex":0,"expectedRevision":0});
    let mut session = EditorSession::new(snapshot.clone());
    assign_owned_artwork(&mut session, &project, &params, &snapshot);
    verify_callers(&session);
    let reopened = verify_owned_history(&mut session, &project, &snapshot);
    verify_owned_export(&temp, &project, &reopened, &snapshot, &icon);
    reject_invalid_selection(&snapshot, &project, &params, &icon);
}

fn assign_owned_artwork(
    session: &mut EditorSession,
    project: &ProjectStore,
    params: &Value,
    snapshot: &ProjectSnapshot,
) {
    crate::dispatch_result_with_catalogs(
        session,
        Some(project),
        crate::CatalogViews::default(),
        None,
        "scenario-item.use-scenario-artwork",
        params.clone(),
    )
    .unwrap();
    assert_eq!(session.revision().0, 1);
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        -164
    );
    assert_eq!(session.snapshot().assets, snapshot.assets);
    assert!(apply_scenario_item_artwork(session, Some(project), params).is_err());
}

fn verify_callers(session: &EditorSession) {
    let uses = crate::artwork_conflict::item_uses(
        session,
        &json!({"expectedRevision":1,"resourceId":-164,"limit":999}),
    )
    .unwrap();
    assert_eq!(uses["limit"], 32);
    assert_eq!(uses["total"], 1);
    assert_eq!(uses["items"][0]["identity"], "classic.item.800");
    assert_eq!(uses["items"][0]["field"], "iconId");
    let mut many = session.snapshot().clone();
    for item in many.scenario_item_rules.iter_mut().take(35) {
        item.definition.icon_id = -164;
    }
    let many = EditorSession::new(many);
    let tail = crate::artwork_conflict::item_uses(
        &many,
        &json!({"expectedRevision":0,"resourceId":-164,"offset":32,"limit":32}),
    )
    .unwrap();
    assert_eq!(tail["total"], 35);
    assert_eq!(tail["items"].as_array().unwrap().len(), 3);
    assert_eq!(tail["items"][0]["recordIndex"], 32);
    assert_eq!(tail["truncated"], false);
    assert!(
        crate::artwork_conflict::item_uses(
            session,
            &json!({"expectedRevision":0,"resourceId":-164})
        )
        .is_err()
    );
}

fn verify_owned_history(
    session: &mut EditorSession,
    project: &ProjectStore,
    snapshot: &ProjectSnapshot,
) -> EditorSession {
    crate::execute(session, &json!({"expectedRevision":1}), EditorCommand::Undo).unwrap();
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        0
    );
    let undone_uses = crate::artwork_conflict::item_uses(
        session,
        &json!({"expectedRevision":2,"resourceId":-164}),
    )
    .unwrap();
    assert_eq!(undone_uses["total"], 0);
    assert_eq!(session.snapshot().assets, snapshot.assets);
    crate::execute(session, &json!({"expectedRevision":2}), EditorCommand::Redo).unwrap();
    project
        .checkpoint_session(session, &json!({"method":"scenario-artwork-test"}))
        .unwrap();
    let (_, reopened) = ProjectStore::open_session(project.root()).unwrap();
    assert_eq!(
        reopened.snapshot().scenario_item_rules[0]
            .definition
            .icon_id,
        -164
    );
    assert_eq!(reopened.snapshot().assets, snapshot.assets);
    reopened
}

fn verify_owned_export(
    temp: &tempfile::TempDir,
    project: &ProjectStore,
    reopened: &EditorSession,
    snapshot: &ProjectSnapshot,
    icon: &AssetDescriptor,
) {
    let first = temp.path().join("first");
    let second = temp.path().join("second");
    let a = crate::classic_compilation::compile_project_classic_slice(
        reopened,
        project,
        json!({"directory":first}),
    )
    .unwrap();
    let b = crate::classic_compilation::compile_project_classic_slice(
        reopened,
        project,
        json!({"directory":second}),
    )
    .unwrap();
    assert_eq!(a["manifestSha256"], b["manifestSha256"]);
    let data = fs::read(first.join("Data NI")).unwrap();
    assert_eq!(&data[4..6], &(-164_i16).to_be_bytes());
    let baseline = temp.path().join("baseline");
    crate::classic_compilation::compile_project_classic_slice(
        &EditorSession::new(snapshot.clone()),
        project,
        json!({"directory":baseline}),
    )
    .unwrap();
    let unchanged = fs::read(baseline.join("Data NI")).unwrap();
    assert_eq!(data.len(), unchanged.len());
    assert!(
        data.iter()
            .zip(&unchanged)
            .enumerate()
            .all(|(index, (after, before))| (4..6).contains(&index) || after == before)
    );
    let entries = providence_core::codecs::parse_resource_entries(
        &fs::read(first.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    let entries: Vec<_> = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"cicn" && entry.id == -164)
        .collect();
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].data,
        project
            .read_blob(icon.classic_payload_blob.as_ref().unwrap())
            .unwrap()
    );
}

fn reject_invalid_selection(
    snapshot: &ProjectSnapshot,
    project: &ProjectStore,
    params: &Value,
    icon: &AssetDescriptor,
) {
    for defect in ["missing", "duplicate", "zero", "kind", "payload", "item"] {
        let mut invalid = snapshot.clone();
        let mut request = params.clone();
        match defect {
            "missing" => request["identity"] = json!("missing"),
            "duplicate" => {
                let mut duplicate = icon.clone();
                duplicate.identity = StableId("duplicate".into());
                invalid.assets.push(duplicate);
            }
            "zero" => {
                invalid.assets[0]
                    .classic_resource
                    .as_mut()
                    .unwrap()
                    .resource_id = 0
            }
            "kind" => invalid.assets[0].kind = "picture".into(),
            "payload" => invalid.assets[0].classic_payload_blob = None,
            "item" => request["recordIndex"] = json!(999),
            _ => unreachable!(),
        }
        let mut rejected = EditorSession::new(invalid.clone());
        assert!(
            apply_scenario_item_artwork(&mut rejected, Some(project), &request).is_err(),
            "{defect}"
        );
        assert_eq!(rejected.snapshot(), &invalid);
        assert_eq!(rejected.revision().0, 0);
    }
}
