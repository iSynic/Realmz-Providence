use crate::{demo::demo_snapshot, dispatch_result};
use providence_core::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};
use providence_core::text_authoring::{DIVINITY_TEXT_SEPARATOR, MessageTextChange};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::io::Cursor;

#[test]
fn reviewed_file_import_is_atomic_durable_and_one_undo_after_save_reopen() {
    let temporary = tempfile::tempdir().unwrap();
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let path = temporary.path().join("Export Text.txt");
    dispatch_result(&mut session, "text.export-file", json!({"path":path})).unwrap();
    assert_eq!(session.revision(), Revision(0));
    let content = ["Café “Gate”", "Captain's new message", "Last"].join(DIVINITY_TEXT_SEPARATOR);
    std::fs::write(&path, &content).unwrap();
    let review = dispatch_result(
        &mut session,
        "text.import-review",
        json!({"expectedRevision":0,"path":path,"limit":1}),
    )
    .unwrap();
    assert_eq!(review["total"], 3);
    assert_eq!(review["items"].as_array().unwrap().len(), 1);
    assert_eq!(review["canApply"], true);
    let params = json!({"expectedRevision":0,"path":path,"reviewToken":review["reviewToken"]});
    let inspect = dispatch_result(&mut session,"text.import-inspect",json!({"expectedRevision":0,"path":path,"reviewToken":review["reviewToken"],"identity":"message:47"})).unwrap();
    assert_eq!(inspect["change"]["text"], "Captain's new message");
    assert_eq!(inspect["change"]["expectedText"], snapshot.messages[1].text);
    let mut output = Vec::new();
    crate::transport::serve_io(
        &mut session,
        Some(&store),
        Cursor::new(
            json!({"id":1,"method":"text.import-apply","params":params}).to_string() + "\n",
        ),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["revision"], 1);
    let saved =
        crate::dispatch_result_with_store(&mut session, Some(&store), "project.save", json!({}))
            .unwrap();
    assert_eq!(saved["canUndo"], true);
    let (_, mut reopened) = ProjectStore::open_session(temporary.path().join("project")).unwrap();
    assert_eq!(reopened.snapshot().messages[0].text, "Café “Gate”");
    dispatch_result(&mut reopened, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(reopened.snapshot(), &snapshot);
    dispatch_result(&mut reopened, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(reopened.snapshot(), session.snapshot());
}

#[test]
fn changed_file_revision_allocation_and_invalid_text_cannot_partially_apply() {
    let temporary = tempfile::tempdir().unwrap();
    let path = temporary.path().join("review.txt");
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let content = ["First", "Second", "Third"].join(DIVINITY_TEXT_SEPARATOR);
    std::fs::write(&path, &content).unwrap();
    let review = dispatch_result(
        &mut session,
        "text.import-review",
        json!({"expectedRevision":0,"path":path}),
    )
    .unwrap();
    std::fs::write(&path, content.replace("Third", "changed outside editor")).unwrap();
    let params = json!({"expectedRevision":0,"path":path,"reviewToken":review["reviewToken"]});
    assert!(
        dispatch_result(&mut session, "text.import-apply", params)
            .unwrap_err()
            .contains("changed since review")
    );
    std::fs::write(
        &path,
        ["First", "🐉", "Third"].join(DIVINITY_TEXT_SEPARATOR),
    )
    .unwrap();
    let invalid = dispatch_result(
        &mut session,
        "text.import-review",
        json!({"expectedRevision":0,"path":path}),
    )
    .unwrap();
    assert_eq!(invalid["invalid"], 1);
    assert_eq!(invalid["canApply"], false);
    assert!(
        dispatch_result(
            &mut session,
            "text.import-apply",
            json!({"expectedRevision":0,"path":path,"reviewToken":invalid["reviewToken"]})
        )
        .is_err()
    );
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn stale_or_duplicated_import_rows_cannot_partially_change_the_document() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let changes = before
        .messages
        .iter()
        .take(2)
        .map(|message| MessageTextChange {
            identity: message.identity.clone(),
            native_id: message.native_id,
            expected_text: message.text.clone(),
            text: "Valid".into(),
        })
        .collect::<Vec<_>>();
    let mut stale = changes.clone();
    stale[1].expected_text = "Other record".into();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::AuthorStrings(
                    providence_core::text_authoring::StringEdit::Import { changes: stale }
                )
            })
            .is_err()
    );
    let mut duplicated = changes.clone();
    duplicated.push(changes[0].clone());
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::AuthorStrings(
                    providence_core::text_authoring::StringEdit::Import {
                        changes: duplicated
                    }
                )
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn strings_presence_does_not_create_labels_in_a_fresh_project() {
    let mut session = EditorSession::new(demo_snapshot());
    let result = dispatch_result(&mut session, "message.list", json!({})).unwrap();
    assert_eq!(result["optionLabelsPresent"], false);
    assert!(session.snapshot().option_labels.is_empty());
    let result = dispatch_result(
        &mut session,
        "text.inspect-draft",
        json!({"text":"Café 🐉","family":"option-label"}),
    )
    .unwrap();
    assert_eq!(result["feedback"]["replacementCharacters"], 1);
    assert_eq!(result["feedback"]["issues"][0]["column"], 6);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn local_string_drafts_allocate_only_on_apply_and_are_strict_atomic_history_commands() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let allocation = dispatch_result(&mut session, "text.allocate", json!({})).unwrap();
    let id = allocation["nativeId"].clone();
    assert_eq!(session.snapshot(), &before);
    let mut draft =
        json!({"family":"message","nativeId":id,"expectedText":null,"text":"Café “new”"});
    dispatch_result(
        &mut session,
        "text.apply-draft",
        json!({"expectedRevision":0,"draft":draft}),
    )
    .unwrap();
    assert_eq!(session.revision(), Revision(1));
    let created = session.snapshot().clone();
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(session.snapshot(), &before);
    dispatch_result(&mut session, "history.redo", json!({"expectedRevision":2})).unwrap();
    assert_eq!(session.snapshot(), &created);
    for text in ["🐉".into(), "a".repeat(256)] {
        draft["text"] = json!(text);
        assert!(
            dispatch_result(
                &mut session,
                "text.apply-draft",
                json!({"expectedRevision":3,"draft":draft})
            )
            .is_err()
        );
        assert_eq!(session.snapshot(), &created);
    }
    draft["expectedText"] = json!("incorrect baseline");
    draft["text"] = json!("Replacement");
    assert!(
        dispatch_result(
            &mut session,
            "text.apply-draft",
            json!({"expectedRevision":3,"draft":draft})
        )
        .is_err()
    );
    let mut fresh_snapshot = before.clone();
    fresh_snapshot.option_labels.clear();
    fresh_snapshot
        .classic_sources
        .retain(|source| source.native_path != "Data OD");
    let mut fresh = EditorSession::new(fresh_snapshot);
    assert!(dispatch_result(&mut fresh,"text.apply-draft",json!({"expectedRevision":0,"draft":{"family":"option-label","nativeId":0,"expectedText":null,"text":"Leave"}})).is_err());
}

#[test]
fn option_drafts_search_and_bounded_catalogs_keep_exact_ids() {
    use providence_core::model::{NativeRecordId, OptionLabelRecord, StableId};
    let mut snapshot = demo_snapshot();
    snapshot.option_labels = (0..300)
        .map(|id| OptionLabelRecord {
            identity: StableId(format!("option-label:{id}")),
            native_id: NativeRecordId(id),
            text: if id == 299 {
                "Café guard guard".into()
            } else {
                format!("Choice {id}")
            },
            authored: false,
        })
        .collect();
    let mut session = EditorSession::new(snapshot);
    let page = dispatch_result(
        &mut session,
        "option-label.list",
        json!({"offset":128,"limit":900}),
    )
    .unwrap();
    assert_eq!(page["items"].as_array().unwrap().len(), 128);
    assert_eq!(page["truncated"], true);
    let found = dispatch_result(
        &mut session,
        "text.find",
        json!({"family":"option-label","query":"GUARD"}),
    )
    .unwrap();
    assert_eq!(found["total"], 2);
    assert_eq!(found["next"]["nativeId"], 299);
    assert_eq!(found["next"]["characterIndex"], 5);
    let next = dispatch_result(
        &mut session,
        "text.find",
        json!({"family":"option-label","query":"guard","afterId":299,"afterCharacterIndex":5}),
    )
    .unwrap();
    assert_eq!(next["next"]["characterIndex"], 11);
    let empty =
        dispatch_result(&mut session, "text.find", json!({"query":"absent phrase"})).unwrap();
    assert_eq!(empty["next"], Value::Null);
    let before = session.snapshot().clone();
    let draft = json!({"family":"option-label","nativeId":300,"expectedText":null,"text":"New café choice"});
    dispatch_result(
        &mut session,
        "text.apply-draft",
        json!({"expectedRevision":0,"draft":draft}),
    )
    .unwrap();
    assert_eq!(session.snapshot().option_labels.len(), 301);
    dispatch_result(&mut session, "history.undo", json!({"expectedRevision":1})).unwrap();
    assert_eq!(session.snapshot(), &before);
    assert!(dispatch_result(&mut session,"text.apply-draft",json!({"expectedRevision":2,"draft":{"family":"option-label","nativeId":300,"expectedText":null,"text":"a".repeat(25)}})).is_err());
}
