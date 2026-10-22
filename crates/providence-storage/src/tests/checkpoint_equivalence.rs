//! A session checkpoint must write exactly the manifest a full checkpoint would.

use super::*;

fn execute(session: &mut EditorSession, command: EditorCommand) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap();
}

fn assert_saves_like_full(store: &ProjectStore, session: &EditorSession, step: &str) {
    store
        .checkpoint_session(session, &json!({"method": step}))
        .unwrap();
    let durable = fs::read(store.snapshot_path()).unwrap();
    let (full, _) = store.prepare_full_snapshot(session.snapshot()).unwrap();
    assert_eq!(
        String::from_utf8(durable).unwrap(),
        String::from_utf8(full).unwrap(),
        "{step}"
    );
}

fn picture(blob: BlobId, byte_length: u64) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("equivalence-picture".into()),
        label: "Picture".into(),
        kind: "picture".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob,
        byte_length,
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
    }
}

#[test]
fn session_checkpoints_match_full_checkpoints_through_ordinary_edits_and_history() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Equivalence")).unwrap();
    let mut session = EditorSession::new(snapshot("Equivalence"));
    assert_saves_like_full(&store, &session, "first save");
    let edits = [
        EditorCommand::UpdateMessageText {
            identity: StableId("message:12".into()),
            text: "Changed".into(),
        },
        EditorCommand::CreateMessage {
            native_id: NativeRecordId(3),
            text: "Earlier".into(),
        },
        EditorCommand::UpsertQuestLabel {
            label: QuestLabel {
                id: 4,
                label: "Quest".into(),
                note: String::new(),
            },
        },
        EditorCommand::CreateMap {
            level_type: LevelType::Dungeon,
        },
        EditorCommand::DeleteQuestLabel { id: 4 },
        EditorCommand::Undo,
        EditorCommand::Redo,
        EditorCommand::Undo,
        EditorCommand::UpdateMessageText {
            identity: StableId("message:12".into()),
            text: "After undo".into(),
        },
    ];
    for (index, command) in edits.into_iter().enumerate() {
        execute(&mut session, command);
        assert_saves_like_full(&store, &session, &format!("edit {index}"));
    }
    assert_saves_like_full(&store, &session, "unchanged save");
}

#[test]
fn session_checkpoints_match_full_checkpoints_for_multi_segment_and_unnormalized_changes() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Base")).unwrap();
    assert_saves_like_full(&store, &EditorSession::new(snapshot("Base")), "base");

    // Several segments change at once, as monster and battle repairs do.
    let mut changed = snapshot("Base");
    changed.messages[0].text = "Changed".into();
    changed.world.maps[0].tiles[0] = 9;
    changed.quest_labels.push(QuestLabel {
        id: 2,
        label: "Quest".into(),
        note: String::new(),
    });
    assert_saves_like_full(&store, &EditorSession::new(changed.clone()), "multiple");

    // A command may leave records out of canonical order; the checkpoint must normalize them.
    let mut unnormalized = changed;
    unnormalized.messages.insert(
        0,
        ScenarioMessage {
            identity: StableId("message:30".into()),
            native_id: NativeRecordId(30),
            text: "Later".into(),
            authored: true,
        },
    );
    let (session_bytes, _, _) = store.prepare_session_snapshot(&unnormalized).unwrap();
    let (full_bytes, _) = store.prepare_full_snapshot(&unnormalized).unwrap();
    assert_eq!(session_bytes, full_bytes);
}

#[test]
fn session_checkpoints_validate_blobs_like_full_checkpoints() {
    let temporary = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(temporary.path(), &snapshot("Assets")).unwrap();
    let blob = store.put_blob(b"fixture").unwrap();
    let mut with_asset = snapshot("Assets");
    with_asset.assets.push(picture(blob.clone(), 7));
    assert_saves_like_full(&store, &EditorSession::new(with_asset.clone()), "asset");

    let mut wrong_length = with_asset.clone();
    wrong_length.assets[0].byte_length = 8;
    assert!(store.prepare_full_snapshot(&wrong_length).is_err());
    assert!(
        store
            .checkpoint_session(
                &EditorSession::new(wrong_length),
                &json!({"method": "length"})
            )
            .is_err()
    );

    // A blob verified by an earlier save is checked again once its file is gone.
    assert_saves_like_full(
        &store,
        &EditorSession::new(with_asset.clone()),
        "asset again",
    );
    fs::remove_file(store.blob_path(&blob).unwrap()).unwrap();
    with_asset.messages[0].text = "Edited".into();
    assert!(store.prepare_full_snapshot(&with_asset).is_err());
    assert!(
        store
            .checkpoint_session(
                &EditorSession::new(with_asset),
                &json!({"method": "missing"})
            )
            .is_err()
    );
}
