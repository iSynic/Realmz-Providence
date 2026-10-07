use super::*;

#[test]
fn opening_current_index_reuses_it_without_writes() {
    let temporary = tempfile::tempdir().unwrap();
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).unwrap();
    let connection = store.open_database().unwrap();
    connection
        .execute_batch(
            "CREATE TRIGGER prevent_reindex BEFORE DELETE ON entity
         BEGIN SELECT RAISE(ABORT, 'unexpected index rebuild'); END;",
        )
        .unwrap();
    let (_, session, timing) = ProjectStore::open_session_measured(temporary.path()).unwrap();
    assert!(timing.index_reused);
    assert_eq!(session.snapshot(), &initial);
    assert_eq!(ProjectStore::open(temporary.path()).unwrap().1, initial);
    assert_eq!(store.search("Before", 10).unwrap().len(), 1);
}

#[test]
fn index_queries_rebuild_missing_obsolete_and_dirty_indexes_after_opening() {
    let temporary = tempfile::tempdir().unwrap();
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).unwrap();
    for sql in [
        "DELETE FROM metadata WHERE key = 'index_format_version'",
        "UPDATE metadata SET value = 'obsolete' WHERE key = 'index_format_version'",
        "INSERT INTO metadata(key, value) VALUES ('index_dirty', '1')",
    ] {
        store.open_database().unwrap().execute(sql, []).unwrap();
        let (_, session, timing) = ProjectStore::open_session_measured(temporary.path()).unwrap();
        assert!(!timing.index_reused);
        assert_eq!(session.snapshot(), &initial);
        assert_eq!(store.search("Before", 10).unwrap().len(), 1);
    }
    fs::remove_file(store.local_database_path()).unwrap();
    let (_, _, timing) = ProjectStore::open_session_measured(temporary.path()).unwrap();
    assert!(!timing.index_reused);
    assert_eq!(store.search("Before", 10).unwrap().len(), 1);
}

#[test]
fn opening_defers_a_stale_index_without_blocking_snapshot_or_history() {
    let temporary = tempfile::tempdir().unwrap();
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).unwrap();
    let connection = store.open_database().unwrap();
    connection
        .execute_batch(
            "INSERT INTO metadata(key, value) VALUES ('index_dirty', '1');
         CREATE TRIGGER prevent_reindex BEFORE DELETE ON entity
         BEGIN SELECT RAISE(ABORT, 'unexpected index rebuild'); END;",
        )
        .unwrap();
    let (_, session, timing) = ProjectStore::open_session_measured(temporary.path()).unwrap();
    assert!(!timing.index_reused);
    assert_eq!(session.snapshot(), &initial);
    assert_eq!(ProjectStore::open(temporary.path()).unwrap().1, initial);
    assert!(store.search("Before", 10).is_err());
    connection
        .execute_batch("DROP TRIGGER prevent_reindex")
        .unwrap();
    assert_eq!(store.search("Before", 10).unwrap().len(), 1);
}

#[test]
fn external_snapshot_change_invalidates_the_index() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Before")).unwrap();
    store.save_snapshot(&snapshot("External change")).unwrap();
    let (_, session, timing) = ProjectStore::open_session_measured(temporary.path()).unwrap();
    assert!(!timing.index_reused);
    assert_eq!(session.snapshot().messages[0].text, "External change");
    assert!(store.search("Before", 10).unwrap().is_empty());
    assert_eq!(store.search("External change", 10).unwrap().len(), 1);
}

#[test]
fn measured_open_preserves_snapshot_revision_and_undo_without_persisting_timing() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Before")).unwrap();
    let mut session = EditorSession::new(snapshot("Before"));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "After".into(),
            },
        })
        .unwrap();
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .unwrap();
    let bytes = fs::read(store.snapshot_path()).unwrap();
    let (reopened, mut measured, timing) =
        ProjectStore::open_session_measured(temporary.path()).unwrap();
    assert_eq!(measured.snapshot(), session.snapshot());
    assert_eq!(measured.revision(), session.revision());
    assert_eq!(fs::read(reopened.snapshot_path()).unwrap(), bytes);
    for elapsed in [
        timing.snapshot_load_ms,
        timing.index_rebuild_ms,
        timing.history_restore_ms,
    ] {
        assert!(elapsed.is_finite() && elapsed >= 0.0);
    }
    measured
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(measured.snapshot().messages[0].text, "Before");
    let (_, ordinary) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(ordinary.snapshot(), session.snapshot());
    assert_eq!(ordinary.revision(), session.revision());
}
