use super::*;
use crate::session_history::decompress_local_session_snapshot;
use providence_core::session::{PersistedSessionState, SessionHistoryEntry};

fn edit(session: &mut EditorSession, text: &str) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: text.into(),
            },
        })
        .unwrap();
}

fn assert_segmented_history(store: &ProjectStore, session: &EditorSession) {
    let manifest = store.current_session_manifest().unwrap();
    let current = store
        .portable_snapshot_manifest(&fs::read(store.snapshot_path()).unwrap())
        .unwrap()
        .unwrap();
    let expected = session.undo_history().iter().chain(session.redo_history());
    for (stored, entry) in manifest.undo.iter().chain(&manifest.redo).zip(expected) {
        let bytes = decompress_local_session_snapshot(
            &store.read_local_session_blob(&stored.snapshot).unwrap(),
        )
        .unwrap();
        let historical = store
            .portable_snapshot_manifest(&bytes)
            .unwrap()
            .expect("history stays segmented after Save");
        assert_eq!(
            store.load_snapshot_document(&bytes).unwrap(),
            entry.snapshot
        );
        assert_eq!(stored.changed_entities, entry.changed_entities);
        for name in SNAPSHOT_SEGMENTS.iter().filter(|name| **name != "messages") {
            assert_eq!(
                historical.segments[*name], current.segments[*name],
                "unchanged {name}"
            );
        }
    }
    let (_, reopened) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(reopened.persisted_state(), session.persisted_state());
}

#[test]
fn save_and_save_as_keep_segmented_undo_and_redo_independently() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path().join("source"), &snapshot("Before")).unwrap();
    let mut session = EditorSession::new(snapshot("Before"));
    edit(&mut session, "One");
    edit(&mut session, "Two");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    for _ in 0..2 {
        store
            .checkpoint_session(&session, &json!({"method": "project.save"}))
            .unwrap();
        assert_segmented_history(&store, &session);
    }
    let destination = temporary.path().join("copy");
    store.save_session_as(&session, &destination).unwrap();
    let (copy, mut copied) = ProjectStore::open_session(&destination).unwrap();
    assert_segmented_history(&copy, &copied);
    copied
        .execute(ExpectedRevisionCommand {
            expected_revision: copied.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    let outcome = copy
        .checkpoint_session(&copied, &json!({"method": "history.redo"}))
        .unwrap();
    assert!(outcome.history_snapshot_reused);
    assert_eq!(copied.snapshot().messages[0].text, "Two");
    assert_segmented_history(&store, &session);
}

#[test]
fn corrupt_history_only_source_rejects_save_before_replacing_portable_truth() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Current")).unwrap();
    let blob = store.put_blob(b"historical source").unwrap();
    let mut historical = snapshot("Historical");
    historical.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD2".into(),
        blob: blob.clone(),
        byte_length: 17,
    });
    let session = EditorSession::from_persisted_state(PersistedSessionState {
        snapshot: snapshot("Current"),
        revision: Revision(2),
        undo: vec![SessionHistoryEntry {
            snapshot: historical,
            changed_entities: vec![StableId("message:12".into())],
            references_unchanged: false,
        }],
        redo: vec![],
    });
    let before = fs::read(store.snapshot_path()).unwrap();
    fs::write(store.blob_path(&blob).unwrap(), b"corrupt").unwrap();
    assert!(matches!(
        store.checkpoint_session(&session, &json!({"method": "project.save"})),
        Err(StoreError::BlobDigestMismatch(_))
    ));
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
}
