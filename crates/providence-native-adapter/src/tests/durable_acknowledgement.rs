use super::*;
use crate::catalogs::{CatalogViews, OpenMonsterLibrary};
use crate::demo::demo_snapshot;
use crate::transport::serve_io;
use crate::transport::serve_io_with_libraries;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::MonsterLibraryStore;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

fn message_request(id: u64, revision: u64) -> String {
    json!({
        "id": id, "method": "message.update",
        "params": {"expectedRevision": revision, "identity": "message:12", "text": "Changed"}
    })
    .to_string()
        + "\n"
}

#[test]
fn failed_portable_checkpoint_reports_unknown_and_stops_before_the_next_request() {
    let temporary = tempdir().unwrap();
    let snapshot = demo_snapshot();
    let store = ProjectStore::create(temporary.path(), &snapshot).unwrap();
    let acknowledged = fs::read(store.snapshot_path()).unwrap();
    let retained = temporary.path().join("last-acknowledged.json");
    fs::rename(store.snapshot_path(), &retained).unwrap();
    fs::create_dir(store.snapshot_path()).unwrap();
    let mut session = EditorSession::new(snapshot.clone());
    let mut output = Vec::new();
    let requests = message_request(1, 0) + &message_request(2, 1);
    serve_io(
        &mut session,
        Some(&store),
        Cursor::new(requests),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["id"], 1);
    assert_eq!(response["ok"], false);
    assert_eq!(response["outcomeUnknown"], true);
    assert!(response.get("result").is_none());
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .contains("reopen the project")
    );
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(fs::read(&retained).unwrap(), acknowledged);
    fs::remove_dir(store.snapshot_path()).unwrap();
    fs::rename(retained, store.snapshot_path()).unwrap();
    let (_, reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.revision(), Revision(0));
    assert_eq!(reopened.snapshot(), &snapshot);
}

#[test]
fn known_rejection_keeps_the_transport_open_without_claiming_uncertainty() {
    let mut session = EditorSession::new(demo_snapshot());
    let mut output = Vec::new();
    let requests = message_request(1, 99) + &message_request(2, 0);
    serve_io(&mut session, None, Cursor::new(requests), &mut output).unwrap();
    let responses: Vec<Value> = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["ok"], false);
    assert!(responses[0].get("outcomeUnknown").is_none());
    assert_eq!(responses[1]["ok"], true);
    assert!(responses[1].get("outcomeUnknown").is_none());
    assert_eq!(session.revision(), Revision(1));
}

struct DisconnectedWriter;

impl std::io::Write for DisconnectedWriter {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "reader exited",
        ))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn a_lost_response_does_not_undo_the_already_durable_command() {
    let temporary = tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &demo_snapshot()).unwrap();
    let mut session = EditorSession::new(demo_snapshot());
    let error = serve_io(
        &mut session,
        Some(&store),
        Cursor::new(message_request(1, 0)),
        DisconnectedWriter,
    )
    .expect_err("the reply connection is closed");
    assert!(error.contains("reader exited"));
    let (_, reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().messages[0].text, "Changed");
    assert!(reopened.can_undo());
}

#[test]
fn failed_library_checkpoint_does_not_accept_a_following_project_mutation() {
    let temporary = tempdir().unwrap();
    let (store, session) = MonsterLibraryStore::create(
        temporary.path().join("library"),
        StableId("library:checkpoint-failure".into()),
    )
    .unwrap();
    let mut library = OpenMonsterLibrary { store, session };
    let acknowledged = fs::read(library.store.catalog_path()).unwrap();
    let retained = temporary.path().join("last-acknowledged.json");
    fs::rename(library.store.catalog_path(), &retained).unwrap();
    fs::create_dir(library.store.catalog_path()).unwrap();
    let requests = library_import_request(temporary.path()) + &message_request(2, 0);
    let mut project = EditorSession::new(demo_snapshot());
    let mut output = Vec::new();
    serve_io_with_libraries(
        &mut project,
        None,
        CatalogViews::default(),
        Some(&mut library),
        None,
        Cursor::new(requests),
        &mut output,
    )
    .unwrap();
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["id"], 1);
    assert_eq!(response["ok"], false);
    assert_eq!(response["outcomeUnknown"], true);
    assert!(response.get("result").is_none());
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .contains("reopen the library")
    );
    assert_eq!(project.revision(), Revision(0));
    assert_eq!(library.session.revision(), Revision(1));
    assert_eq!(fs::read(&retained).unwrap(), acknowledged);
    fs::remove_dir(library.store.catalog_path()).unwrap();
    fs::rename(retained, library.store.catalog_path()).unwrap();
    let (_, reopened) =
        MonsterLibraryStore::open_session(temporary.path().join("library")).unwrap();
    assert_eq!(reopened.revision(), Revision(0));
    assert!(reopened.catalog().sources.is_empty());
}

fn library_import_request(root: &std::path::Path) -> String {
    let path = root.join("Monster Scrap Book");
    let mut bytes = vec![0; providence_core::monster_library::MONSTER_SCRAPBOOK_RECORD_BYTES];
    bytes[0] = 8;
    bytes[1] = 3;
    bytes[170..181].copy_from_slice(b"Bell Keeper");
    fs::write(&path, bytes).unwrap();
    json!({"id": 1, "method": "monster-library.import-built-ins", "params": {
        "expectedRevision": 0, "path": path, "evidenceRevision": "controlled-fixture",
        "evidencePath": "durable-acknowledgement/Monster Scrap Book",
    }})
    .to_string()
        + "\n"
}
