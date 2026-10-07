use super::*;
use rusqlite::OptionalExtension;

#[test]
fn checkpoint_persists_authored_state_before_mirroring_the_command() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let edited = snapshot("After");
    store
        .checkpoint(
            &edited,
            Revision(1),
            &json!({"method": "message.update", "text": "After"}),
        )
        .expect("checkpoint");

    assert_eq!(store.load_snapshot().unwrap(), edited);
    let journal = store.journal().expect("journal");
    assert_eq!(journal.len(), 1);
    assert_eq!(journal[0].0, Revision(1));
    assert_eq!(journal[0].1["method"], "message.update");
}

#[test]
fn session_revision_undo_and_redo_survive_process_reopen() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let mut session = EditorSession::new(initial);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "After".into(),
            },
        })
        .expect("edit");
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .expect("checkpoint edit and history");

    let (store, mut reopened) =
        ProjectStore::open_session(temporary.path()).expect("restore edited session");
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().messages[0].text, "After");
    let undone = reopened
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo after reopen");
    assert!(undone.references_unchanged);
    assert_eq!(reopened.snapshot().messages[0].text, "Before");
    store
        .checkpoint_session(&reopened, &json!({"method": "history.undo"}))
        .expect("checkpoint undone state");

    let (_, mut reopened_undo) =
        ProjectStore::open_session(temporary.path()).expect("restore undone session");
    assert_eq!(reopened_undo.revision(), Revision(2));
    let redone = reopened_undo
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .expect("redo after second reopen");
    assert!(redone.references_unchanged);
    assert_eq!(reopened_undo.snapshot().messages[0].text, "After");
}

#[test]
fn older_local_history_without_effect_metadata_stays_conservative() {
    let entry: StoredSessionHistoryEntry = serde_json::from_value(json!({
        "snapshot": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "changedEntities": ["land:0"]
    }))
    .expect("read older local history entry");
    assert!(!entry.references_unchanged);
}

#[test]
fn segmented_session_history_stays_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let mut session = EditorSession::new(initial);
    for edit in 1..=SESSION_HISTORY_ENTRY_LIMIT + 6 {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::UpdateMessageText {
                    identity: StableId("message:12".into()),
                    text: format!("Edit {edit}"),
                },
            })
            .expect("edit");
    }
    store
        .checkpoint_session(&session, &json!({"method": "message.update", "edit": 70}))
        .expect("segmented checkpoint");
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "Edit 71".into(),
            },
        })
        .expect("one more edit");
    store
        .checkpoint_session(&session, &json!({"method": "message.update", "edit": 71}))
        .expect("replacement segmented checkpoint");

    let connection = store.open_database().expect("open local database");
    let session_pointers: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM command_journal WHERE session_state_blob IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .expect("count session pointers");
    assert_eq!(session_pointers, 1);

    let local_blobs = fs::read_dir(
        store
            .local_session_root()
            .join("blobs")
            .join(BLOB_ALGORITHM),
    )
    .expect("local session blob directory")
    .count();
    assert_eq!(local_blobs, SESSION_HISTORY_ENTRY_LIMIT + 1);
    let (_, reopened) = ProjectStore::open_session(temporary.path()).expect("reopen session");
    assert_eq!(reopened.revision(), Revision(71));
    assert_eq!(
        reopened.persisted_state().undo.len(),
        SESSION_HISTORY_ENTRY_LIMIT
    );
    assert_eq!(reopened.snapshot().messages[0].text, "Edit 71");
}

#[test]
fn command_journal_retains_only_the_newest_bounded_rows() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let current = snapshot("Current");
    let store = ProjectStore::create(temporary.path(), &current).expect("create store");
    let mut connection = store.open_database().expect("open local database");
    let transaction = connection.transaction().expect("begin seed transaction");
    for revision in 1..=300_i64 {
        transaction
            .execute(
                "INSERT INTO command_journal(revision, command_json, snapshot_sha256) VALUES (?1, '{}', 'seed')",
                params![revision],
            )
            .expect("seed journal row");
    }
    transaction.commit().expect("commit seed transaction");
    drop(connection);

    store
        .checkpoint(&current, Revision(301), &json!({"method": "current"}))
        .expect("bounded journal checkpoint");
    let journal = store.journal().expect("read bounded journal");
    assert_eq!(journal.len(), COMMAND_JOURNAL_ENTRY_LIMIT);
    assert_eq!(journal.first().unwrap().0, Revision(46));
    assert_eq!(journal.last().unwrap().0, Revision(301));
}

#[test]
fn legacy_monolithic_session_checkpoint_still_reopens() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let mut session = EditorSession::new(initial);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "Legacy checkpoint".into(),
            },
        })
        .expect("edit");
    store
        .save_snapshot(session.snapshot())
        .expect("save portable truth");
    let legacy = store
        .put_blob(&serde_json::to_vec(&session.persisted_state()).unwrap())
        .expect("store legacy monolithic state");
    let connection = store.open_database().expect("open local database");
    connection
        .execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('session_state_blob', ?1)",
            params![legacy.0],
        )
        .expect("point at legacy state");

    let (_, reopened) = ProjectStore::open_session(temporary.path()).expect("reopen legacy");
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(reopened.snapshot().messages[0].text, "Legacy checkpoint");
    assert_eq!(reopened.persisted_state().undo.len(), 1);
}

#[test]
fn deleting_sqlite_keeps_current_authored_state_but_resets_local_history() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store = ProjectStore::create(temporary.path(), &snapshot("Before")).expect("create store");
    let mut session = EditorSession::new(snapshot("Before"));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "Durable authored value".into(),
            },
        })
        .expect("edit");
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .expect("checkpoint session");

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (_, mut reopened) =
        ProjectStore::open_session(temporary.path()).expect("reopen without local state");
    assert_eq!(reopened.revision(), Revision(0));
    assert_eq!(
        reopened.snapshot().messages[0].text,
        "Durable authored value"
    );
    let error = reopened
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::Undo,
        })
        .expect_err("deleted local history cannot undo");
    assert_eq!(error, SessionError::NothingToUndo);
}

#[test]
fn invalid_local_session_pointer_cannot_block_portable_project_open() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let expected = snapshot("Portable truth");
    let store = ProjectStore::create(temporary.path(), &expected).expect("create store");
    let connection = store.open_database().expect("open local database");
    connection
        .execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('session_state_blob', 'invalid')",
            [],
        )
        .expect("inject invalid local pointer");

    let (reopened, session) =
        ProjectStore::open_session(temporary.path()).expect("portable project still opens");
    assert_eq!(session.snapshot(), &expected);
    assert_eq!(session.revision(), Revision(0));
    let connection = reopened.open_database().expect("reopen local database");
    let pointer: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'session_state_blob'",
            [],
            |row| row.get(0),
        )
        .optional()
        .expect("query repaired metadata");
    assert!(pointer.is_none());
}
