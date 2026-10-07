use crate::transport::serve_io;
use providence_core::{
    codecs,
    model::{ProjectSnapshot, StableId},
    session::{EditorSession, Revision},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::Cursor;

fn exchange(
    session: &mut EditorSession,
    store: &ProjectStore,
    method: &str,
    params: Value,
) -> Value {
    let request = json!({"id": 1, "method": method, "params": params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io(session, Some(store), Cursor::new(request), &mut output).unwrap();
    serde_json::from_slice(&output).unwrap()
}

fn fresh() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("item-authoring-fixture".into()))
}

fn allocate(session: &mut EditorSession, store: &ProjectStore) -> Value {
    let revision = session.revision().0;
    let response = exchange(
        session,
        store,
        "item.allocation.review",
        json!({"expectedRevision": revision}),
    );
    assert_eq!(response["ok"], true, "{response}");
    response["result"]["allocation"]["draft"].clone()
}

fn submit(session: &mut EditorSession, store: &ProjectStore, draft: Value, id: char) -> Value {
    let revision = session.revision().0;
    exchange(
        session,
        store,
        "item.draft.apply",
        json!({"expectedRevision": revision,
        "operationId": id.to_string().repeat(64), "draft": draft}),
    )
}

#[test]
fn item_draft_fresh_create_edit_durable_reopen_undo_redo_and_classic_text_round_trip() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &fresh()).unwrap();
    let mut session = EditorSession::new(fresh());
    let mut draft = allocate(&mut session, &store);
    assert_eq!(draft["recordIndex"], 100);
    assert_eq!(session.revision(), Revision(0));
    draft["definition"]["name"] = json!("Épée of Dawn");
    draft["definition"]["cost"] = json!(120.0);
    draft["definition"]["special"] = json!([20, 3, -4, 7, -8]);
    let applied = submit(&mut session, &store, draft.clone(), 'a');
    assert_eq!(applied["ok"], true, "{applied}");
    assert_eq!(applied["result"]["document"]["item"]["cost"], 120);
    assert!(applied["result"].get("snapshot").is_none());
    let (store, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.undo_history().len(), 1);
    assert_classic_item_round_trip(&reopened, &store);
    assert_eq!(
        exchange(
            &mut reopened,
            &store,
            "history.undo",
            json!({"expectedRevision": 1})
        )["ok"],
        true
    );
    assert_eq!(reopened.snapshot(), &fresh());
    assert_eq!(
        exchange(
            &mut reopened,
            &store,
            "history.redo",
            json!({"expectedRevision": 2})
        )["ok"],
        true
    );
    draft["allocation"] = Value::Null;
    draft["definition"]["description"] = json!("A newly authored blade.\nKeeps its special tuple.");
    assert_eq!(submit(&mut reopened, &store, draft, 'b')["ok"], true);
    let (_, saved) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(
        saved.snapshot().scenario_item_rules[0].definition.special,
        [20, 3, -4, 7, -8]
    );
    assert_eq!(saved.undo_history().len(), 2);
}

fn assert_classic_item_round_trip(reopened: &EditorSession, store: &ProjectStore) {
    let first = &reopened.snapshot().scenario_item_rules[0];
    let binary = store.read_blob(&first.source_blob).unwrap();
    assert_eq!(binary, vec![0; 20_000]);
    let numeric =
        codecs::encode_scenario_item_rules(&reopened.snapshot().scenario_item_rules, &binary)
            .unwrap();
    let text = store
        .read_blob(first.text_source_blob.as_ref().unwrap())
        .unwrap();
    let decoded = codecs::decode_scenario_item_rules(
        &numeric,
        Some(&text),
        first.source_blob.clone(),
        first.text_source_blob.clone(),
    )
    .unwrap();
    assert_eq!(decoded.rules[100].definition, first.definition);
}

#[test]
fn item_draft_rejects_stale_revision_occupied_allocation_invalid_text_and_forged_destination() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &fresh()).unwrap();
    let mut session = EditorSession::new(fresh());
    let mut draft = allocate(&mut session, &store);
    draft["definition"]["name"] = json!("First");
    assert_eq!(submit(&mut session, &store, draft.clone(), 'c')["ok"], true);
    let before = session.snapshot().clone();
    let stale = exchange(
        &mut session,
        &store,
        "item.draft.apply",
        json!({"expectedRevision": 0,
        "operationId": "d".repeat(64), "draft": draft}),
    );
    assert_eq!(stale["ok"], false);
    let mut occupied = allocate(&mut session, &store);
    occupied["recordIndex"] = json!(100);
    occupied["definition"]["id"] = json!("classic.item.900");
    occupied["definition"]["classicId"] = json!(900);
    assert_eq!(submit(&mut session, &store, occupied, 'e')["ok"], false);
    let mut invalid = allocate(&mut session, &store);
    invalid["definition"]["name"] = json!("🦉");
    assert_eq!(submit(&mut session, &store, invalid, 'f')["ok"], false);
    let mut forged = allocate(&mut session, &store);
    forged["definition"]["classicId"] = json!(902);
    assert_eq!(submit(&mut session, &store, forged, '1')["ok"], false);
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(1));
}

#[test]
fn item_draft_allocation_respects_retained_unknown_bytes_and_full_custom_range() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &fresh()).unwrap();
    let mut bytes = vec![0; 20_000];
    bytes[100 * 100 + 56] = 0xa5;
    let blob = store.put_blob(&bytes).unwrap();
    let mut snapshot = fresh();
    snapshot.scenario_item_rules = codecs::decode_scenario_item_rules(&bytes, None, blob, None)
        .unwrap()
        .rules;
    let mut session = EditorSession::new(snapshot);
    assert_eq!(allocate(&mut session, &store)["recordIndex"], 101);
    let mut full = session.snapshot().clone();
    for rule in &mut full.scenario_item_rules {
        rule.definition.cost = 1;
    }
    let mut session = EditorSession::new(full);
    let response = exchange(
        &mut session,
        &store,
        "item.allocation.review",
        json!({"expectedRevision": 0}),
    );
    assert_eq!(response["ok"], false);
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .contains("All 100 custom item slots")
    );
}

#[test]
fn item_draft_operation_status_identifies_original_intent_without_replaying() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &fresh()).unwrap();
    let mut session = EditorSession::new(fresh());
    let mut draft = allocate(&mut session, &store);
    draft["definition"]["name"] = json!("Original operation");
    let original = json!({"expectedRevision": 0, "operationId": "2".repeat(64), "draft": draft});
    assert_eq!(
        exchange(&mut session, &store, "item.draft.apply", original.clone())["ok"],
        true
    );
    let params = json!({"operationId": "2".repeat(64), "domain": "project",
        "expectedIntent": {"method": "item.draft.apply", "params": original}});
    let receipt = exchange(
        &mut session,
        &store,
        "item.operation.status",
        params.clone(),
    );
    assert_eq!(receipt["result"]["outcome"], "committed");
    let mut wrong = params;
    wrong["expectedIntent"]["params"]["draft"]["definition"]["cost"] = json!(999);
    assert_eq!(
        exchange(&mut session, &store, "item.operation.status", wrong)["result"]["outcome"],
        "unknown"
    );
    assert_eq!(
        exchange(&mut session, &store, "item.draft.apply", original)["ok"],
        false
    );
    assert_eq!(session.revision(), Revision(1));
}
