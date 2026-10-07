use crate::transport::serve_io;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
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
    let line = json!({"id":1,"method":method,"params":params}).to_string() + "\n";
    let mut output = Vec::new();
    serve_io(session, Some(store), Cursor::new(line), &mut output).unwrap();
    let reply: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    reply["result"].clone()
}

#[test]
fn spell_draft_commands_create_validate_apply_acknowledge_save_reopen_and_compile() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-draft-test".into()));
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let catalog = exchange(
        &mut session,
        &store,
        "spell.catalog",
        json!({"class":5,"level":7,"limit":64,"showUnused":true}),
    );
    assert_eq!(catalog["total"], 15);
    assert_eq!(catalog["items"][14]["classicId"], 5715);
    let reviewed = exchange(
        &mut session,
        &store,
        "spell.allocation.review",
        json!({"expectedRevision":0,"destinationRecordIndex":104}),
    );
    let mut draft = reviewed["allocation"]["draft"].clone();
    draft["definition"]["name"] = json!("  Éclat\u{1}  ");
    draft["definition"]["cost"] = json!(255.0);
    draft["definition"]["saveAdjust"] = json!(-128.0);
    let prepared = exchange(
        &mut session,
        &store,
        "spell.draft.prepare",
        json!({"expectedRevision":0,"draft":draft}),
    );
    assert_eq!(prepared["valid"], true);
    let params = json!({"expectedRevision":0,"draft":draft,"operationId":"b".repeat(64)});
    let applied = exchange(&mut session, &store, "spell.draft.apply", params.clone());
    assert_eq!(applied["document"]["definition"]["cost"], 255);
    assert_eq!(applied["document"]["definition"]["saveAdjust"], -128);
    assert!(applied.get("snapshot").is_none());
    let receipt = exchange(
        &mut session,
        &store,
        "item.operation.status",
        json!({
            "operationId":"b".repeat(64),"domain":"project",
            "expectedIntent":{"method":"spell.draft.apply","params":params}
        }),
    );
    assert_eq!(receipt["outcome"], "committed");
    assert_eq!(receipt["response"]["result"], applied);
    assert_spell_reopen_compile_and_history(temporary.path());
}

fn assert_spell_reopen_compile_and_history(project: &std::path::Path) {
    let (store, mut reopened) = ProjectStore::open_session(project).unwrap();
    let document = exchange(
        &mut reopened,
        &store,
        "spell.open-authoring",
        json!({"identity":"classic.spell.5715"}),
    );
    assert_eq!(document["definition"]["name"], "  Éclat\u{1}  ");
    let binary = project.join("Data Spell");
    let names = project.join("Data Spell.rsrc");
    exchange(
        &mut reopened,
        &store,
        "project.compile-data-spell",
        json!({"path":binary,"textPath":names}),
    );
    let bytes = std::fs::read(&binary).unwrap();
    assert_eq!(bytes.len(), 3150);
    assert_eq!(bytes[104 * 30 + 10], 255);
    exchange(
        &mut reopened,
        &store,
        "history.undo",
        json!({"expectedRevision":1}),
    );
    assert!(reopened.snapshot().scenario_spells.is_empty());
    exchange(
        &mut reopened,
        &store,
        "history.redo",
        json!({"expectedRevision":2}),
    );
    assert_eq!(
        reopened.snapshot().scenario_spells[104].definition.name,
        "  Éclat\u{1}  "
    );
}

#[test]
fn spell_catalog_uses_hydrated_custom_names_and_exact_source_after_copy_review() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-copy-test".into()));
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    let mut draft = exchange(
        &mut session,
        &store,
        "spell.allocation.review",
        json!({"expectedRevision":0}),
    )["allocation"]["draft"]
        .clone();
    draft["definition"]["name"] = json!("Moon Gate");
    exchange(
        &mut session,
        &store,
        "spell.draft.apply",
        json!({"expectedRevision":0,"draft":draft,"operationId":"c".repeat(64)}),
    );
    let page = exchange(
        &mut session,
        &store,
        "spell.catalog",
        json!({"query":"moon","class":5}),
    );
    assert_eq!(page["total"], 1);
    let source = exchange(
        &mut session,
        &store,
        "spell.open-authoring",
        json!({"identity":"classic.spell.5101"}),
    )["copySource"]
        .clone();
    let copy = exchange(
        &mut session,
        &store,
        "spell.allocation.review",
        json!({"expectedRevision":1,"copySource":source}),
    );
    assert_eq!(
        copy["allocation"]["draft"]["definition"]["name"],
        "Moon Gate"
    );
    assert_eq!(copy["allocation"]["draft"]["definition"]["classicId"], 5102);
    assert_eq!(
        copy["allocation"]["draft"]["copySource"]["identity"],
        "classic.spell.5101"
    );
    assert_eq!(session.revision().0, 1);
}
