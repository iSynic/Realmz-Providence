use super::fixtures::controlled_catalog_with_id;
use crate::reference_catalog::{apply_item_artwork, reference_catalog_preview};
use providence_core::model::{ProjectSnapshot, StableId};
use providence_core::reference_library::ReferenceCatalog;
use providence_core::session::EditorSession;
use providence_storage::{ProjectStore, ReferenceCatalogStore};
use serde_json::{Value, json};
use std::fs;

#[test]
fn artwork_loss_after_preview_leaves_the_item_and_history_unchanged() {
    use providence_core::{model::ProjectSnapshot, session::EditorSession};
    use providence_storage::ProjectStore;
    let (temporary, catalog, _) = controlled_catalog_with_id(9000);
    let library_root = temporary.path().join("catalog");
    let (library, _) = ReferenceCatalogStore::open(&library_root).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("artwork-loss".into()));
    let project = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    snapshot.scenario_item_rules = empty_item_rules(&project);
    let mut session = EditorSession::new(snapshot.clone());
    let params =
        json!({"identity": "divinity:vault-icon:9000", "recordIndex": 0, "expectedRevision": 0});
    let asset = &catalog
        .assets
        .iter()
        .find(|a| a.descriptor.identity.0 == "divinity:vault-icon:9000")
        .unwrap()
        .descriptor;
    for blob in [&asset.blob, asset.classic_payload_blob.as_ref().unwrap()] {
        assert!(reference_catalog_preview(Some(&catalog), Some(&library), &params).is_ok());
        let path = library_root
            .join("blobs")
            .join("sha256")
            .join(blob.0.strip_prefix("sha256:").unwrap());
        let unavailable = path.with_extension("unavailable");
        fs::rename(&path, &unavailable).unwrap();
        let error = apply_item_artwork(
            &mut session,
            Some(&project),
            Some(&catalog),
            Some(&library),
            &params,
        )
        .unwrap_err();
        assert!(error.contains("Choose another picture"), "{error}");
        assert_eq!(session.snapshot(), &snapshot);
        assert_eq!(session.revision().0, 0);
        assert!(!session.can_undo());
        fs::rename(unavailable, path).unwrap();
    }
    apply_item_artwork(
        &mut session,
        Some(&project),
        Some(&catalog),
        Some(&library),
        &params,
    )
    .unwrap();
    assert_eq!(session.revision().0, 1);
    assert_eq!(
        session.snapshot().scenario_item_rules[0].definition.icon_id,
        9000
    );
}
fn empty_item_rules(
    project: &ProjectStore,
) -> Vec<providence_core::model::SourcedScenarioItemRule> {
    providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        project.put_blob(&vec![0; 20_000]).unwrap(),
        None,
    )
    .unwrap()
    .rules
}

#[test]
fn item_picker_search_selection_and_history_use_the_existing_bounded_catalog() {
    let (temporary, catalog, _) = controlled_catalog_with_id(9000);
    let (library, _) = ReferenceCatalogStore::open(temporary.path().join("catalog")).unwrap();
    let mut snapshot =
        providence_core::model::ProjectSnapshot::new_authored(StableId("item-picker".into()));
    let project = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    snapshot.scenario_item_rules = providence_core::codecs::decode_scenario_item_rules(
        &vec![0; 20_000],
        None,
        project.put_blob(&vec![0; 20_000]).unwrap(),
        None,
    )
    .unwrap()
    .rules;
    for (index, name) in [
        (101, "Winged Guardian Figurine"),
        (
            102,
            "Silvermoon Guardian Figurine — Beneath the Northern Watchtower",
        ),
    ] {
        snapshot.scenario_item_rules[index].definition.name = name.into();
        snapshot.scenario_item_rules[index]
            .definition
            .unidentified_name = "Carved figure".into();
    }
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let second = verify_bounded_search(&mut session, &before);
    verify_picker_history(&mut session, &project, &catalog, &library, &second, &before);
}

fn verify_bounded_search(session: &mut EditorSession, before: &ProjectSnapshot) -> Value {
    let search = |session: &mut EditorSession, params| {
        crate::dispatch_result(session, "item.list", params).unwrap()
    };
    let first = search(
        session,
        json!({"scope": "scenario", "query": " FIGURINE ", "limit": 1}),
    );
    assert_eq!(first["total"], 2);
    assert_eq!(first["truncated"], true);
    assert_eq!(first["items"].as_array().unwrap().len(), 1);
    let second = search(
        session,
        json!({"scope": "scenario", "query": "figurine", "offset": 1, "limit": 1}),
    );
    assert_eq!(second["items"][0]["classicId"], 902);
    assert_eq!(second["items"][0]["recordIndex"], 102);
    assert_eq!(second["items"][0]["editable"], true);
    assert_eq!(second["items"][0]["iconId"], 0);
    assert_eq!(second["truncated"], false);
    assert!(second["items"][0].get("definition").is_none());
    assert!(second.get("snapshot").is_none());
    assert_eq!(
        search(
            session,
            json!({"scope": "scenario", "query": "carved figure"})
        )["total"],
        2
    );
    assert_eq!(
        search(
            session,
            json!({"scope": "scenario", "query": "no such item"})
        )["total"],
        0
    );
    let capped = search(session, json!({"scope": "scenario", "limit": 9999}));
    assert_eq!(capped["items"].as_array().unwrap().len(), 128);
    assert_eq!(session.snapshot(), before);
    assert!(!session.can_undo());
    second
}

fn verify_picker_history(
    session: &mut EditorSession,
    project: &ProjectStore,
    catalog: &ReferenceCatalog,
    library: &ReferenceCatalogStore,
    second: &Value,
    before: &ProjectSnapshot,
) {
    let search = |session: &mut EditorSession, params| {
        crate::dispatch_result(session, "item.list", params).unwrap()
    };
    apply_item_artwork(
        session,
        Some(project),
        Some(catalog),
        Some(library),
        &json!({"identity": "divinity:vault-icon:9000", "recordIndex": second["items"][0]["recordIndex"], "expectedRevision": second["revision"]}),
    ).unwrap();
    let applied = search(session, json!({"scope": "scenario", "query": "902"}));
    assert_eq!(applied["total"], 1);
    assert_eq!(applied["items"][0]["iconId"], 9000);
    assert_eq!(applied["items"][0]["name"], second["items"][0]["name"]);
    assert_eq!(
        session.snapshot().scenario_item_rules[101],
        before.scenario_item_rules[101]
    );
    crate::dispatch_result(
        session,
        "history.undo",
        json!({"expectedRevision": applied["revision"]}),
    )
    .unwrap();
    let undone = search(session, json!({"scope": "scenario", "query": "902"}));
    assert_eq!(undone["items"][0]["iconId"], 0);
    crate::dispatch_result(
        session,
        "history.redo",
        json!({"expectedRevision": undone["revision"]}),
    )
    .unwrap();
    assert_eq!(
        search(session, json!({"scope": "scenario", "query": "902"}))["items"][0]["iconId"],
        9000
    );
}
