use super::*;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_store;
use crate::read_snapshot;
use crate::session_summary::user_visible_path;
use crate::transport::serve_io;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;

#[test]
fn explicit_snapshot_export_reopens_the_same_canonical_snapshot() {
    let temp = tempfile::tempdir().expect("temporary directory");
    let path = temp.path().join("project.providence.json");
    let mut session = EditorSession::new(demo_snapshot());

    dispatch_result(
        &mut session,
        "message.update",
        json!({
            "expectedRevision": 0,
            "identity": "message:12",
            "text": "Persisted through the portable snapshot"
        }),
    )
    .expect("update");
    dispatch_result(
        &mut session,
        "project.export-snapshot",
        json!({ "path": path.to_string_lossy() }),
    )
    .expect("export snapshot");

    let reopened = read_snapshot(&path).expect("reopen");
    assert_eq!(reopened, *session.snapshot());
}

#[test]
fn project_backed_save_uses_portable_truth_path_without_a_copy() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store = ProjectStore::create(temporary.path(), &demo_snapshot()).expect("create store");
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "message.update",
        json!({
            "expectedRevision": 0,
            "identity": "message:12",
            "text": "Saved to project truth"
        }),
    )
    .expect("update");
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .expect("checkpoint edit");

    let saved = dispatch_result_with_store(&mut session, Some(&store), "project.save", json!({}))
        .expect("save project truth");

    assert_eq!(saved["revision"], 1);
    assert_eq!(saved["path"], json!(store.snapshot_path()));
    assert_eq!(
        store.load_snapshot().unwrap().messages[0].text,
        "Saved to project truth"
    );
    assert_eq!(
        saved["snapshotSha256"],
        store.index_summary().unwrap().snapshot_sha256
    );
    assert_eq!(saved["canUndo"], true);
    let (_, reopened) =
        ProjectStore::open_session(temporary.path()).expect("reopen explicitly saved project");
    assert_eq!(reopened.revision(), Revision(1));
    assert!(reopened.can_undo());
    assert_eq!(
        reopened.snapshot().messages[0].text,
        "Saved to project truth"
    );
}

#[test]
fn project_backed_save_as_creates_an_independent_portable_project() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let source_root = temporary.path().join("source-project");
    let destination_root = temporary.path().join("destination-project");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(&source_root, &snapshot).expect("create source project");
    let mut session = EditorSession::new(snapshot);
    dispatch_result(
        &mut session,
        "message.update",
        json!({
            "expectedRevision": 0,
            "identity": "message:12",
            "text": "Saved As portable truth"
        }),
    )
    .expect("update source");
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .expect("checkpoint source edit");

    let saved = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.save-as",
        json!({"path": destination_root}),
    )
    .expect("save as project");
    assert_eq!(saved["revision"], 1);
    assert_eq!(saved["canUndo"], true);
    assert_eq!(saved["canRedo"], false);
    assert_saved_destination_paths(&saved, &destination_root);
    let (_, mut destination_session) =
        ProjectStore::open_session(&destination_root).expect("open saved-as session");
    assert_eq!(destination_session.revision(), Revision(1));
    destination_session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("saved-as history remains available");
    assert_ne!(
        destination_session.snapshot().messages[0].text,
        "Saved As portable truth"
    );
    assert_eq!(
        store.load_snapshot().unwrap().messages[0].text,
        "Saved As portable truth"
    );

    let error = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "project.save-as",
        json!({"path": destination_root}),
    )
    .expect_err("Save As must not replace an existing project");
    assert!(error.contains("refusing to replace existing Save As destination"));
}

#[test]
fn project_store_session_checkpoints_each_successful_mutation() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(temporary.path(), &snapshot).expect("create store");
    let request = json!({
        "id": 1,
        "method": "message.update",
        "params": {
            "expectedRevision": 0,
            "identity": "message:12",
            "text": "Persisted without an explicit Save command"
        }
    });
    let input = format!("{}\n", serde_json::to_string(&request).unwrap());
    let mut output = Vec::new();
    let mut session = EditorSession::new(snapshot);

    serve_io(&mut session, Some(&store), Cursor::new(input), &mut output)
        .expect("serve one stored command");

    let response: Value = serde_json::from_slice(&output).expect("response JSON");
    assert_eq!(response["ok"], true);
    let reopened = store.load_snapshot().expect("portable checkpoint");
    assert_eq!(
        reopened.messages[0].text,
        "Persisted without an explicit Save command"
    );
    assert_eq!(store.journal().unwrap().len(), 1);

    undo_reopened_project(temporary.path());
    redo_reopened_project(temporary.path());
    let (_, reopened_redo) =
        ProjectStore::open_session(temporary.path()).expect("restore redone process session");
    assert_eq!(reopened_redo.revision(), Revision(3));
    assert_eq!(
        reopened_redo.snapshot().messages[0].text,
        "Persisted without an explicit Save command"
    );
}

fn assert_saved_destination_paths(saved: &Value, destination_root: &std::path::Path) {
    let displayed_destination = user_visible_path(
        destination_root
            .canonicalize()
            .expect("canonical destination"),
    );
    assert_eq!(saved["projectPath"], json!(displayed_destination.clone()));
    assert_eq!(
        saved["path"],
        json!(displayed_destination.join("project.providence.json"))
    );
}

fn undo_reopened_project(root: &std::path::Path) {
    let (store, mut reopened_session) =
        ProjectStore::open_session(root).expect("restore process session");
    assert_eq!(reopened_session.revision(), Revision(1));
    let undo = json!({
        "id": 2,
        "method": "history.undo",
        "params": { "expectedRevision": 1 }
    });
    let mut undo_output = Vec::new();
    serve_io(
        &mut reopened_session,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&undo).unwrap())),
        &mut undo_output,
    )
    .expect("undo in reopened adapter process");
    let undo_response: Value = serde_json::from_slice(&undo_output).expect("undo response");
    assert_eq!(undo_response["ok"], true);
}

fn redo_reopened_project(root: &std::path::Path) {
    let (store, mut reopened_undo) =
        ProjectStore::open_session(root).expect("restore undone process session");
    assert_eq!(reopened_undo.revision(), Revision(2));
    assert_eq!(
        reopened_undo.snapshot().messages[0].text,
        "The western gate is sealed until moonrise."
    );
    let redo = json!({
        "id": 3,
        "method": "history.redo",
        "params": { "expectedRevision": 2 }
    });
    let mut redo_output = Vec::new();
    serve_io(
        &mut reopened_undo,
        Some(&store),
        Cursor::new(format!("{}\n", serde_json::to_string(&redo).unwrap())),
        &mut redo_output,
    )
    .expect("redo in second reopened adapter process");
    let redo_response: Value = serde_json::from_slice(&redo_output).expect("redo response");
    assert_eq!(redo_response["ok"], true);
}
