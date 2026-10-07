use super::*;

#[test]
fn project_blob_pruning_keeps_current_and_bounded_undo_truth() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let mut initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let source_bytes = b"retained source payload";
    let source_blob = store.put_blob(source_bytes).expect("store retained source");
    initial.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD2".into(),
        blob: source_blob.clone(),
        byte_length: source_bytes.len() as u64,
    });
    store
        .save_snapshot(&initial)
        .expect("save source-backed initial truth");
    let orphan = store
        .put_blob(b"unreachable payload")
        .expect("store orphan");

    let mut session = EditorSession::new(initial);
    for edit in 0..(SESSION_HISTORY_ENTRY_LIMIT as u64 + 8) {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::UpdateMessageText {
                    identity: StableId("message:12".into()),
                    text: format!("Edit {edit}"),
                },
            })
            .expect("edit message");
        store
            .checkpoint_session(&session, &json!({"method": "message.update"}))
            .expect("checkpoint edit");
    }

    assert_eq!(store.read_blob(&source_blob).unwrap(), source_bytes);
    assert!(!store.blob_path(&orphan).unwrap().exists());
    let project_blob_count = fs::read_dir(temporary.path().join("blobs").join(BLOB_ALGORITHM))
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .count();
    assert!(
        project_blob_count
            <= SNAPSHOT_SEGMENTS.len()
                + SESSION_HISTORY_ENTRY_LIMIT
                + PROJECT_BLOB_PRUNE_INTERVAL as usize
                + 2
    );

    assert_bounded_undo(temporary.path());
    assert_bounded_redo(temporary.path());
}

#[test]
fn content_addressed_blob_ids_are_verified_on_read() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store = ProjectStore::create(temporary.path(), &snapshot("Blob")).unwrap();
    let id = store.put_blob(b"fixture").expect("put blob");
    assert_eq!(
        id.0,
        "sha256:f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d"
    );
    assert_eq!(store.read_blob(&id).unwrap(), b"fixture");
    assert!(matches!(
        store.read_blob(&BlobId("sha256:not-a-digest".into())),
        Err(StoreError::InvalidBlobId(_))
    ));
}

#[test]
fn asset_metadata_cannot_checkpoint_without_its_exact_blob() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let store = ProjectStore::create(temporary.path(), &snapshot("Asset")).expect("create store");
    let mut authored = snapshot("Asset");
    authored.assets.push(AssetDescriptor {
        identity: StableId("missing-asset".into()),
        label: "Missing".into(),
        kind: "picture".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob: BlobId(
            "sha256:f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d".into(),
        ),
        byte_length: 7,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(1),
        height: Some(1),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled fixture".into(),
    });

    assert!(matches!(
        store.save_snapshot(&authored),
        Err(StoreError::Io(_))
    ));
    let blob = store.put_blob(b"fixture").expect("store payload");
    authored.assets[0].blob = blob;
    store
        .save_snapshot(&authored)
        .expect("checkpoint matching asset and blob");
    let classic = store.put_blob(b"PICT").expect("store Classic payload");
    authored.assets[0].classic_payload_blob = Some(classic);
    authored.assets[0].classic_payload_byte_length = Some(5);
    assert!(matches!(
        store.save_snapshot(&authored),
        Err(StoreError::AssetClassicPayloadLengthMismatch {
            expected: 5,
            actual: 4,
            ..
        })
    ));
    authored.assets[0].classic_payload_byte_length = Some(4);
    store
        .save_snapshot(&authored)
        .expect("checkpoint matching source and Classic asset blobs");
    assert_eq!(store.load_snapshot().unwrap().assets, authored.assets);
}

fn assert_bounded_undo(root: &Path) {
    let (reopened_store, mut reopened) =
        ProjectStore::open_session(root).expect("reopen project session");
    for _ in 0..SESSION_HISTORY_ENTRY_LIMIT {
        reopened
            .execute(ExpectedRevisionCommand {
                expected_revision: reopened.revision(),
                command: EditorCommand::Undo,
            })
            .expect("retained undo root reopens");
        reopened_store
            .checkpoint_session(&reopened, &json!({"method": "history.undo"}))
            .expect("checkpoint undo");
    }
    assert!(matches!(
        reopened.execute(ExpectedRevisionCommand {
            expected_revision: reopened.revision(),
            command: EditorCommand::Undo,
        }),
        Err(SessionError::NothingToUndo)
    ));
}

fn assert_bounded_redo(root: &Path) {
    let (_, mut reopened_redo) = ProjectStore::open_session(root).expect("reopen redo session");
    for _ in 0..SESSION_HISTORY_ENTRY_LIMIT {
        reopened_redo
            .execute(ExpectedRevisionCommand {
                expected_revision: reopened_redo.revision(),
                command: EditorCommand::Redo,
            })
            .expect("retained redo root reopens");
    }
    assert!(matches!(
        reopened_redo.execute(ExpectedRevisionCommand {
            expected_revision: reopened_redo.revision(),
            command: EditorCommand::Redo,
        }),
        Err(SessionError::NothingToRedo)
    ));
}
