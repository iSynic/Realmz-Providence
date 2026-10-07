use crate::{
    catalogs::{CatalogViews, OpenMonsterLibrary},
    transport::serve_io_with_libraries,
};
use providence_core::{
    model::{MonsterSet, NativeRecordId, ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::{MonsterLibraryStore, ProjectStore};
use serde_json::{Value, json};
use std::io::Cursor;

fn exchange(
    project: &mut EditorSession,
    store: &ProjectStore,
    library: &mut OpenMonsterLibrary,
    method: &str,
    params: Value,
) -> Value {
    let input = json!({"id": 1, "method": method, "params": params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io_with_libraries(
        project,
        Some(store),
        CatalogViews::default(),
        Some(library),
        None,
        Cursor::new(input),
        &mut output,
    )
    .unwrap();
    serde_json::from_slice(&output).unwrap()
}

fn create(
    project: &mut EditorSession,
    store: &ProjectStore,
    library: &mut OpenMonsterLibrary,
) -> String {
    let mut params = json!({"expectedRevision": 0, "action": "create-library", "label": "Guardian", "preferredScenarioMonsterId": 9.0});
    let prepared = exchange(
        project,
        store,
        library,
        "monster-library.operation.prepare",
        params.clone(),
    );
    assert_eq!(prepared["ok"], true, "{prepared}");
    assert!(prepared["result"]["total"].as_u64().unwrap() > 128);
    params["reviewHash"] = prepared["result"]["reviewHash"].clone();
    params["operationId"] = json!("a".repeat(64));
    let applied = exchange(
        project,
        store,
        library,
        "monster-library.operation.commit",
        params.clone(),
    );
    assert_eq!(applied["ok"], true, "{applied}");
    let receipt = exchange(
        project,
        store,
        library,
        "monster.operation.status",
        json!({"operationId": "a".repeat(64), "domain": "library",
        "expectedIntent": {"method": "monster-library.operation.commit", "params": params}}),
    );
    assert_eq!(receipt["result"]["outcome"], "committed");
    assert_eq!(project.revision(), Revision(0));
    applied["result"]["selectedIdentity"]
        .as_str()
        .unwrap()
        .to_owned()
}

#[test]
fn monster_library_authoring_transport_reviews_paged_effects_and_persists_both_stores() {
    let temporary = tempfile::tempdir().unwrap();
    let project_root = temporary.path().join("project");
    let library_root = temporary.path().join("library");
    let snapshot = ProjectSnapshot::new_authored(StableId("authoring-transfer".into()));
    let store = ProjectStore::create(&project_root, &snapshot).unwrap();
    let mut project = EditorSession::new(snapshot);
    let (library_store, library_session) =
        MonsterLibraryStore::create(&library_root, StableId("authoring-library".into())).unwrap();
    let mut library = OpenMonsterLibrary {
        store: library_store,
        session: library_session,
    };
    let identity = create(&mut project, &store, &mut library);
    let mut params = json!({"expectedRevision": 0, "expectedLibraryRevision": 1,
        "entryIds": [identity], "mode": "exact-all-sets", "replace": false, "section": "allocations"});
    let prepared = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.prepare",
        params.clone(),
    );
    assert_eq!(prepared["ok"], true, "{prepared}");
    assert_eq!(prepared["result"]["items"][0]["targetId"], 9);
    params["reviewHash"] = prepared["result"]["reviewHash"].clone();
    params["operationId"] = json!("b".repeat(64));
    let applied = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.commit",
        params,
    );
    assert_eq!(applied["ok"], true, "{applied}");
    assert_eq!(project.undo_history().len(), 1);
    let (_, reopened) = ProjectStore::open_session(&project_root).unwrap();
    assert_eq!(reopened.revision(), Revision(1));
    assert!(
        reopened
            .snapshot()
            .monster_sets
            .iter()
            .all(|set| set.monsters.iter().any(|record| record.native_id.0 == 9))
    );
    let (_, reopened_library) = MonsterLibraryStore::open_session(&library_root).unwrap();
    assert_eq!(reopened_library.revision(), Revision(1));
    assert_eq!(
        reopened_library.catalog().custom_entries[0].label,
        "Guardian"
    );
    assert!(reopened_library.can_undo());
}

#[test]
fn monster_library_authoring_stale_library_review_cannot_mutate_the_project() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("stale-transfer".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut project = EditorSession::new(snapshot);
    let (library_store, library_session) = MonsterLibraryStore::create(
        temporary.path().join("library"),
        StableId("stale-library".into()),
    )
    .unwrap();
    let mut library = OpenMonsterLibrary {
        store: library_store,
        session: library_session,
    };
    let identity = create(&mut project, &store, &mut library);
    let mut params = json!({"expectedRevision": 0, "expectedLibraryRevision": 1, "entryIds": [identity], "mode": "normal"});
    let prepared = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.prepare",
        params.clone(),
    );
    let changed = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.draft.apply",
        json!({"expectedRevision": 1,
        "draft": {"identity": identity, "fields": {"armor": 18.0}}, "operationId": "c".repeat(64)}),
    );
    assert_eq!(changed["ok"], true, "{changed}");
    params["reviewHash"] = prepared["result"]["reviewHash"].clone();
    params["operationId"] = json!("d".repeat(64));
    let rejected = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.commit",
        params,
    );
    assert_eq!(rejected["ok"], false);
    assert_eq!(project.revision(), Revision(0));
    assert!(project.snapshot().monster_sets.is_empty());
    assert_eq!(library.session.revision(), Revision(2));
}

#[test]
fn monster_library_explicit_replacement_does_not_require_a_free_auto_allocation() {
    let temporary = tempfile::tempdir().unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("full-monster-range".into()));
    snapshot.monster_sets.push(MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: (1..=i16::MAX as u32)
            .map(|id| providence_core::session::new_monster_template(NativeRecordId(id)).unwrap())
            .collect(),
    });
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut project = EditorSession::new(snapshot);
    let (store_library, session_library) = MonsterLibraryStore::create(
        temporary.path().join("library"),
        StableId("replacement-library".into()),
    )
    .unwrap();
    let mut library = OpenMonsterLibrary {
        store: store_library,
        session: session_library,
    };
    let identity = create(&mut project, &store, &mut library);
    let automatic = json!({"expectedRevision": 0, "expectedLibraryRevision": 1, "entryIds": [identity], "mode": "normal", "section": "allocations"});
    let rejected = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.prepare",
        automatic.clone(),
    );
    assert_eq!(rejected["ok"], false);
    assert!(rejected["error"].as_str().unwrap().contains("no free"));
    let mut explicit = automatic.clone();
    explicit["targetNativeId"] = json!(32767);
    explicit["replace"] = json!(true);
    let prepared = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.prepare",
        explicit.clone(),
    );
    assert_eq!(prepared["ok"], true, "{prepared}");
    assert_eq!(prepared["result"]["items"][0]["targetId"], 32767);
    assert_eq!(
        prepared["result"]["items"][0]["reason"],
        "explicit-replacement"
    );
    assert_eq!(project.revision(), Revision(0));
    explicit["targetNativeId"] = json!(0);
    let invalid = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.transfer.prepare",
        explicit,
    );
    assert_eq!(invalid["ok"], false);
    assert_eq!(project.snapshot().monster_sets[0].monsters.len(), 32767);
}

#[test]
fn monster_library_preferred_id_validation_names_the_control_without_mutating() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("library-id-validation".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut project = EditorSession::new(snapshot);
    let (library_store, library_session) = MonsterLibraryStore::create(
        temporary.path().join("library"),
        StableId("id-validation-library".into()),
    )
    .unwrap();
    let mut library = OpenMonsterLibrary {
        store: library_store,
        session: library_session,
    };
    let identity = create(&mut project, &store, &mut library);
    let before = library.session.persisted_state();
    for preferred in [
        json!("invalid"),
        json!(9.5),
        json!(-1),
        json!(4294967296_u64),
        json!(32768),
    ] {
        let result = exchange(
            &mut project,
            &store,
            &mut library,
            "monster-library.draft.prepare",
            json!({"expectedRevision": 1, "draft": {
                "identity": identity, "fields": {}, "preferredScenarioMonsterId": preferred
            }}),
        );
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["result"]["valid"], false, "{result}");
        assert_eq!(
            result["result"]["issues"][0]["field"],
            "preferredScenarioMonsterId"
        );
        assert_eq!(library.session.persisted_state(), before);
    }
    let valid = exchange(
        &mut project,
        &store,
        &mut library,
        "monster-library.draft.prepare",
        json!({"expectedRevision": 1, "draft": {
            "identity": identity, "fields": {}, "preferredScenarioMonsterId": 17.0
        }}),
    );
    assert_eq!(valid["result"]["valid"], true, "{valid}");
    assert_eq!(library.session.persisted_state(), before);
    assert_eq!(project.revision(), Revision(0));
}
