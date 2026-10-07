use super::*;

#[test]
fn routine_edits_replace_only_their_portable_snapshot_segment() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Before");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    assert_eq!(manifest(&store).segments.len(), SNAPSHOT_SEGMENTS.len());
    let mut session = EditorSession::new(initial);
    for (revision, (method, command, expected)) in segment_edit_cases().into_iter().enumerate() {
        assert_checkpoint_segments(
            &store,
            &mut session,
            revision as u64,
            method,
            command,
            expected,
        );
        if revision == 0 {
            assert_eq!(store.search("After", 10).unwrap().len(), 1);
        }
    }
    let loaded = ProjectStore::load_snapshot_file(store.snapshot_path())
        .expect("load segmented snapshot directly");
    assert_eq!(loaded, *session.snapshot());
    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (_, reopened) = ProjectStore::open(temporary.path()).expect("open without SQLite");
    assert_eq!(reopened, *session.snapshot());
}

fn manifest(store: &ProjectStore) -> PortableSnapshotManifest {
    let root = fs::read(store.snapshot_path()).expect("read portable manifest");
    store
        .portable_snapshot_manifest(&root)
        .expect("parse portable manifest")
        .expect("snapshot stays segmented")
}

fn assert_checkpoint_segments(
    store: &ProjectStore,
    session: &mut EditorSession,
    revision: u64,
    method: &str,
    command: EditorCommand,
    expected: &[&str],
) {
    let before = manifest(store);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(revision),
            command,
        })
        .expect("execute segment-scoped command");
    store
        .checkpoint_session(session, &json!({"method": method}))
        .expect("checkpoint segment-scoped command");
    let after = manifest(store);
    let changes = SNAPSHOT_SEGMENTS
        .iter()
        .filter(|name| before.segments.get(**name) != after.segments.get(**name))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(changes, expected, "{method}");
}

#[test]
fn imported_resource_removal_rewrites_only_assets_and_removals_and_survives_sqlite_loss() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let initial = snapshot("Imported resource removal");
    let store = ProjectStore::create(temporary.path(), &initial).expect("create store");
    let imported = with_imported_icon(&store, initial);
    store
        .save_snapshot(&imported)
        .expect("save imported snapshot");
    let before_bytes = fs::read(store.snapshot_path()).expect("read before manifest");
    let before = store
        .portable_snapshot_manifest(&before_bytes)
        .unwrap()
        .unwrap();
    let mut session = EditorSession::new(imported);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RemoveAsset {
                identity: StableId("classic-resource:cicn:392".into()),
            },
        })
        .expect("remove imported asset");
    store
        .checkpoint_session(&session, &json!({"method": "icon.remove"}))
        .expect("checkpoint removal");
    let after_bytes = fs::read(store.snapshot_path()).expect("read after manifest");
    let after = store
        .portable_snapshot_manifest(&after_bytes)
        .unwrap()
        .unwrap();
    let changes = SNAPSHOT_SEGMENTS
        .iter()
        .filter(|name| before.segments.get(**name) != after.segments.get(**name))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(changes, ["assets", "classicResourceRemovals"]);

    fs::remove_file(store.local_database_path()).expect("delete rebuildable database");
    let (_, reopened) = ProjectStore::open(temporary.path()).expect("reopen without SQLite");
    assert_eq!(reopened, *session.snapshot());
    assert_eq!(
        reopened.classic_resource_removals,
        [ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 392,
        }]
    );
}

fn with_imported_icon(store: &ProjectStore, initial: ProjectSnapshot) -> ProjectSnapshot {
    let source_blob = store.put_blob(b"source png").expect("store source payload");
    let classic_blob = store
        .put_blob(b"classic cicn")
        .expect("store Classic payload");
    let annex_blob = store.put_blob(b"annex").expect("store annex");
    let mut imported = initial;
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: annex_blob,
    };
    imported.assets.push(AssetDescriptor {
        identity: StableId("classic-resource:cicn:392".into()),
        label: "Giant Frog".into(),
        kind: "combat-icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 392,
        }),
        scenario_music_slot: None,
        blob: source_blob,
        byte_length: 10,
        classic_payload_blob: Some(classic_blob),
        classic_payload_byte_length: Some(12),
        extension: Some("png".into()),
        width: Some(64),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: providence_core::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    });
    imported
}
fn segment_edit_cases() -> Vec<(&'static str, EditorCommand, &'static [&'static str])> {
    vec![
        (
            "message.update",
            EditorCommand::UpdateMessageText {
                identity: StableId("message:12".into()),
                text: "After".into(),
            },
            &["messages"],
        ),
        (
            "map.update-cell",
            EditorCommand::UpdateLandMapCell {
                identity: StableId("land:0".into()),
                x: 0,
                y: 0,
                tile: 4,
            },
            &["world"],
        ),
        (
            "quest-label.upsert",
            EditorCommand::UpsertQuestLabel {
                label: QuestLabel {
                    id: 7,
                    label: "Bridge secured".into(),
                    note: String::new(),
                },
            },
            &["questLabels"],
        ),
        (
            "monster.create",
            EditorCommand::CreateMonster {
                set_id: 0,
                native_id: NativeRecordId(3),
            },
            &["monsterSets", "monsterDescriptions"],
        ),
    ]
}
