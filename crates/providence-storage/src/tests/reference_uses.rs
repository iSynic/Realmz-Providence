use super::*;
use providence_core::model::ExtraCodeRow;

fn battle_project() -> ProjectSnapshot {
    let mut project = snapshot("Shared word consumers");
    project.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(5),
        values: [1, 0, 33, 0, 10],
    });
    project.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:7".into()),
        native_id: NativeRecordId(7),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 2,
            target_native_id: 5,
        }],
    });
    project
}

fn assert_both_uses(store: &ProjectStore) {
    let connection = store.open_database().unwrap();
    let uses: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM derived_reference WHERE source = 'extra-action-point:7'
         AND target_id = '33' AND byte_start = 54 AND byte_end = 56",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(uses, 2, "sound and XAP share the exact field and bytes");
}

#[test]
fn simultaneous_word_consumers_survive_checkpoint_and_reopen() {
    let temporary = tempfile::tempdir().unwrap();
    let project = battle_project();
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    assert_both_uses(&store);
    let outcome = store
        .checkpoint(&project, Revision(1), &json!({"method":"save"}))
        .unwrap();
    assert!(outcome.infrastructure_warning.is_none());
    let (reopened, snapshot) = ProjectStore::open(temporary.path()).unwrap();
    assert_eq!(snapshot, project);
    assert_both_uses(&reopened);
}

#[test]
fn upgrading_old_reference_cache_preserves_portable_data_and_journal() {
    let temporary = tempfile::tempdir().unwrap();
    let project = battle_project();
    let store = ProjectStore::create(temporary.path(), &project).unwrap();
    store
        .checkpoint(&project, Revision(1), &json!({"method":"save"}))
        .unwrap();
    let portable = fs::read(store.snapshot_path()).unwrap();
    let journal = store.journal().unwrap();
    let connection = store.open_database().unwrap();
    connection
        .execute_batch(
            "DROP TABLE derived_reference;
         CREATE TABLE derived_reference(source TEXT NOT NULL, field TEXT NOT NULL,
             target_kind TEXT NOT NULL, target_id TEXT NOT NULL, resolution TEXT NOT NULL,
             native_path TEXT, byte_start INTEGER, byte_end INTEGER, PRIMARY KEY(source, field));
         CREATE INDEX reference_target ON derived_reference(target_kind, target_id);",
        )
        .unwrap();
    drop(connection);
    store
        .index_summary()
        .expect("old key marks cache dirty and rebuilds it");
    assert_both_uses(&store);
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), portable);
    assert_eq!(store.journal().unwrap(), journal);
    assert_eq!(store.load_snapshot().unwrap(), project);
}
