use super::*;
use crate::session_history::compress_local_session_snapshot;
use providence_core::{
    model::{LevelType, StableId},
    session::{EditorCommand, ExpectedRevisionCommand, LandMapCellPaint},
};

fn execute(session: &mut EditorSession, command: EditorCommand) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap();
}

fn checkpoint(store: &ProjectStore, session: &EditorSession, method: &str) {
    store
        .checkpoint_session(session, &serde_json::json!({"method": method}))
        .unwrap();
}

fn fixture(root: &std::path::Path) -> (ProjectStore, EditorSession) {
    let snapshot = ProjectSnapshot::new_authored(StableId("history-checkpoint".into()));
    let store = ProjectStore::create(root, &snapshot).unwrap();
    let mut session = EditorSession::new(snapshot);
    execute(
        &mut session,
        EditorCommand::CreateMap {
            level_type: LevelType::Land,
        },
    );
    checkpoint(&store, &session, "map.create");
    execute(
        &mut session,
        EditorCommand::PaintLandMapCells {
            identity: StableId("land:0".into()),
            cells: vec![LandMapCellPaint {
                x: 0,
                y: 0,
                tile: 90,
            }],
        },
    );
    checkpoint(&store, &session, "map.paint-cells");
    (store, session)
}

#[test]
fn history_reuses_exact_portable_manifest_with_canonical_semantics() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    for _ in 0..16 {
        for (command, method) in [
            (EditorCommand::Undo, "history.undo"),
            (EditorCommand::Redo, "history.redo"),
        ] {
            let previous = store.current_session_manifest().unwrap();
            let entries = if method == "history.undo" {
                previous.undo
            } else {
                previous.redo
            };
            let expected_bytes = decompress_local_session_snapshot(
                &store
                    .read_local_session_blob(&entries.last().unwrap().snapshot)
                    .unwrap(),
            )
            .unwrap();
            execute(&mut session, command);
            let reused = store
                .prepare_history_snapshot(&session, method)
                .unwrap()
                .expect("portable history fast path");
            assert_eq!(reused.0, expected_bytes);
            let canonical = store.prepare_full_snapshot(session.snapshot()).unwrap();
            assert_eq!(
                store.load_snapshot_document(&reused.0).unwrap(),
                store.load_snapshot_document(&canonical.0).unwrap()
            );
            checkpoint(&store, &session, method);
            let (_, reopened) = ProjectStore::open_session(temporary.path()).unwrap();
            assert_eq!(reopened.persisted_state(), session.persisted_state());
        }
    }
}

#[test]
fn stale_history_metadata_falls_back_to_canonical_state() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    let mut manifest = store.current_session_manifest().unwrap();
    manifest.revision.0 += 10;
    replace_metadata(&store, &manifest);
    execute(&mut session, EditorCommand::Undo);
    assert!(
        store
            .prepare_history_snapshot(&session, "history.undo")
            .unwrap()
            .is_none()
    );
    checkpoint(&store, &session, "history.undo");
    assert_eq!(
        ProjectStore::open_session(temporary.path())
            .unwrap()
            .1
            .snapshot(),
        session.snapshot()
    );
}

#[test]
fn incompatible_history_metadata_is_not_reused() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    let mut manifest = store.current_session_manifest().unwrap();
    manifest.format_version += 1;
    replace_metadata(&store, &manifest);
    execute(&mut session, EditorCommand::Undo);
    assert!(
        store
            .prepare_history_snapshot(&session, "history.undo")
            .unwrap()
            .is_none()
    );
}

#[test]
fn missing_local_history_falls_back_without_losing_the_command() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    let mut manifest = store.current_session_manifest().unwrap();
    manifest.undo.last_mut().unwrap().snapshot.0 = format!("sha256:{}", "0".repeat(64));
    replace_metadata(&store, &manifest);
    execute(&mut session, EditorCommand::Undo);
    assert!(
        store
            .prepare_history_snapshot(&session, "history.undo")
            .unwrap()
            .is_none()
    );
    checkpoint(&store, &session, "history.undo");
    assert_eq!(
        ProjectStore::open_session(temporary.path())
            .unwrap()
            .1
            .snapshot(),
        session.snapshot()
    );
}

#[test]
fn valid_but_wrong_historical_snapshot_is_not_authority() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    let mut manifest = store.current_session_manifest().unwrap();
    let wrong = fs::read(store.snapshot_path()).unwrap();
    manifest.undo.last_mut().unwrap().snapshot = store
        .put_local_session_blob(&compress_local_session_snapshot(&wrong).unwrap())
        .unwrap();
    replace_metadata(&store, &manifest);
    execute(&mut session, EditorCommand::Undo);
    assert!(
        store
            .prepare_history_snapshot(&session, "history.undo")
            .unwrap()
            .is_none()
    );
    checkpoint(&store, &session, "history.undo");
    assert_eq!(
        ProjectStore::open_session(temporary.path())
            .unwrap()
            .1
            .snapshot(),
        session.snapshot()
    );
}

#[test]
fn corrupt_authored_segment_is_never_acknowledged_as_a_successful_undo() {
    let temporary = tempfile::tempdir().unwrap();
    let (store, mut session) = fixture(temporary.path());
    let manifest = store.current_session_manifest().unwrap();
    let bytes = decompress_local_session_snapshot(
        &store
            .read_local_session_blob(&manifest.undo.last().unwrap().snapshot)
            .unwrap(),
    )
    .unwrap();
    let portable = store.portable_snapshot_manifest(&bytes).unwrap().unwrap();
    let id = portable.segments.get("world").unwrap();
    fs::write(store.blob_path(id).unwrap(), b"corrupt segment").unwrap();
    let before = fs::read(store.snapshot_path()).unwrap();
    execute(&mut session, EditorCommand::Undo);
    assert!(matches!(
        store.checkpoint_session(&session, &serde_json::json!({"method":"history.undo"})),
        Err(StoreError::BlobDigestMismatch(_))
    ));
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
}

fn replace_metadata(store: &ProjectStore, manifest: &StoredSessionManifest) {
    let blob = store
        .put_local_session_blob(&serde_json::to_vec(manifest).unwrap())
        .unwrap();
    store
        .open_database()
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO metadata(key,value) VALUES ('session_state_blob',?1)",
            [&blob.0],
        )
        .unwrap();
}
