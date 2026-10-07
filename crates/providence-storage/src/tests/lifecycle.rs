use super::*;

#[test]
fn deleting_sqlite_preserves_imported_annex_and_classic_source_bytes() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store =
        ProjectStore::create(temporary.path(), &snapshot("Imported")).expect("create store");
    let source_bytes = b"controlled Data LD source";
    let source_blob = store.put_blob(source_bytes).expect("store Classic source");
    let annex_bytes = b"controlled compatibility annex";
    let annex_blob = store.put_blob(annex_bytes).expect("store annex");
    let mut imported = snapshot("Imported");
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: annex_blob.clone(),
    };
    imported.classic_sources.push(ClassicSourceBlob {
        native_path: "Data LD".into(),
        blob: source_blob.clone(),
        byte_length: source_bytes.len() as u64,
    });
    store.save_snapshot(&imported).expect("save imported truth");

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (reopened, reopened_snapshot) =
        ProjectStore::open(temporary.path()).expect("reopen imported truth");

    assert_eq!(reopened_snapshot, imported);
    assert_eq!(reopened.read_blob(&source_blob).unwrap(), source_bytes);
    assert_eq!(reopened.read_blob(&annex_blob).unwrap(), annex_bytes);
}

#[test]
fn new_project_creation_is_authored_and_never_overwrites_a_directory() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let root = temporary.path().join("new-project");
    let authored = ProjectSnapshot::new_authored(StableId("new-project".into()));
    let store = ProjectStore::create_new(&root, &authored).expect("create fresh project");

    assert_eq!(store.load_snapshot().unwrap(), authored);
    assert!(matches!(
        ProjectStore::create_new(&root, &authored),
        Err(StoreError::ProjectDirectoryNotEmpty(path)) if path == root
    ));

    let occupied = temporary.path().join("occupied");
    fs::create_dir(&occupied).unwrap();
    fs::write(occupied.join("unrelated.txt"), b"preserve me").unwrap();
    assert!(matches!(
        ProjectStore::create_new(&occupied, &authored),
        Err(StoreError::ProjectDirectoryNotEmpty(path)) if path == occupied
    ));
    assert_eq!(
        fs::read(occupied.join("unrelated.txt")).unwrap(),
        b"preserve me"
    );
}

#[test]
fn save_as_copies_portable_truth_and_history_without_clobbering() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let source_root = temporary.path().join("source-project");
    let destination_root = temporary.path().join("saved-as-project");
    let SaveAsSource {
        store,
        session,
        source_blob,
        annex_blob,
        orphan_blob,
    } = save_as_source(&source_root);

    let outcome = store
        .save_session_as(&session, &destination_root)
        .expect("save portable project as new directory");
    assert_eq!(outcome.snapshot_sha256.len(), 64);
    let (destination_store, mut destination_session) =
        ProjectStore::open_session(&destination_root).expect("open saved-as project");
    assert_eq!(destination_session.revision(), Revision(1));
    assert_eq!(destination_session.snapshot().messages[0].text, "After");
    assert_eq!(
        destination_store.read_blob(&source_blob).unwrap(),
        b"controlled Save As source"
    );
    assert_eq!(
        destination_store.read_blob(&annex_blob).unwrap(),
        b"controlled Save As annex"
    );
    assert!(!destination_store.blob_path(&orphan_blob).unwrap().exists());

    destination_session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo survives Save As");
    assert_eq!(destination_session.snapshot().messages[0].text, "Before");
    destination_store
        .checkpoint_session(&destination_session, &json!({"method": "history.undo"}))
        .expect("checkpoint independent destination");
    let (_, source_session) =
        ProjectStore::open_session(&source_root).expect("reopen unchanged source");
    assert_eq!(source_session.revision(), Revision(1));
    assert_eq!(source_session.snapshot().messages[0].text, "After");

    assert!(matches!(
        store.save_session_as(&session, &destination_root),
        Err(StoreError::ProjectDestinationExists(path)) if path == destination_root.canonicalize().unwrap()
    ));
    assert!(matches!(
        store.save_session_as(&session, source_root.join("nested-copy")),
        Err(StoreError::ProjectDestinationInsideSource(_))
    ));
}

#[test]
fn failed_save_as_does_not_publish_a_partial_project() {
    let temporary = tempfile::tempdir().expect("temporary parent");
    let source_root = temporary.path().join("source-project");
    let destination_root = temporary.path().join("saved-as-project");
    let store =
        ProjectStore::create(&source_root, &snapshot("Before")).expect("create source project");
    let source_blob = store.put_blob(b"exact source").expect("store source");
    let mut imported = snapshot("Before");
    imported.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD2".into(),
        blob: source_blob.clone(),
        byte_length: 12,
    });
    store
        .save_snapshot(&imported)
        .expect("save source-backed truth");
    fs::write(store.blob_path(&source_blob).unwrap(), b"corrupt").expect("corrupt fixture");

    let session = EditorSession::new(imported);
    assert!(matches!(
        store.save_session_as(&session, &destination_root),
        Err(StoreError::BlobDigestMismatch(id)) if id == source_blob
    ));
    assert!(!destination_root.exists());
    assert!(fs::read_dir(temporary.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".providence-save-as-")
    }));
}

struct SaveAsSource {
    store: ProjectStore,
    session: EditorSession,
    source_blob: BlobId,
    annex_blob: BlobId,
    orphan_blob: BlobId,
}

fn save_as_source(source_root: &Path) -> SaveAsSource {
    let mut imported = snapshot("Before");
    let store = ProjectStore::create(source_root, &imported).expect("create source project");
    let source_bytes = b"controlled Save As source";
    let source_blob = store.put_blob(source_bytes).expect("store source payload");
    let annex_bytes = b"controlled Save As annex";
    let annex_blob = store
        .put_blob(annex_bytes)
        .expect("store compatibility annex");
    let orphan_blob = store
        .put_blob(b"unreachable payload")
        .expect("store orphan");
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: annex_blob.clone(),
    };
    imported.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD2".into(),
        blob: source_blob.clone(),
        byte_length: source_bytes.len() as u64,
    });
    store
        .save_snapshot(&imported)
        .expect("save imported source");

    let mut session = EditorSession::new(imported);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "After".into(),
            },
        })
        .expect("edit source project");
    store
        .checkpoint_session(&session, &json!({"method": "message.update"}))
        .expect("checkpoint source edit");

    SaveAsSource {
        store,
        session,
        source_blob,
        annex_blob,
        orphan_blob,
    }
}
