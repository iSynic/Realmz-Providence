use super::*;
use providence_core::{
    model::{LevelType, ProjectSnapshot, StableId},
    paint_resources::{PaintResource, PaintResourceCell, PaintResourceKind},
    session::EditorSession,
};

fn resource() -> PaintResource {
    PaintResource {
        identity: StableId("palette:town".into()),
        name: "Town".into(),
        collection: "Buildings".into(),
        kind: PaintResourceKind::Palette,
        level_type: LevelType::Land,
        tileset_id: StableId("landlook:0".into()),
        width: 1,
        height: 1,
        cells: vec![PaintResourceCell {
            x: 0,
            y: 0,
            tile: 20,
        }],
        favorite: false,
    }
}

#[test]
fn local_resources_survive_reopen_index_rebuild_and_save_as_without_snapshot_changes() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = ProjectSnapshot::new_authored(StableId("local-resources".into()));
    let store = ProjectStore::create(temp.path().join("source"), &snapshot).unwrap();
    let before = fs::read(store.snapshot_path()).unwrap();
    let current = store
        .change_paint_resources(
            0,
            PaintResourceChange::Create {
                resource: resource(),
            },
        )
        .unwrap();
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
    assert!(
        store
            .change_paint_resources(
                0,
                PaintResourceChange::Delete {
                    identity: resource().identity
                }
            )
            .is_err()
    );
    fs::remove_file(store.local_database_path()).unwrap();
    let (reopened, _) = ProjectStore::open(store.root()).unwrap();
    assert_eq!(reopened.read_paint_resources().unwrap(), current);
    let target = temp.path().join("copy");
    reopened
        .save_session_as(&EditorSession::new(snapshot), &target)
        .unwrap();
    let (copied, _) = ProjectStore::open(target).unwrap();
    assert_eq!(copied.read_paint_resources().unwrap(), current);
}

#[test]
fn malformed_local_settings_are_preserved_and_never_reset_by_a_write() {
    let temp = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(
        temp.path(),
        &ProjectSnapshot::new_authored(StableId("bad-settings".into())),
    )
    .unwrap();
    let path = store.root().join(crate::LOCAL_DIRECTORY).join(FILE);
    fs::write(&path, b"{ malformed local settings }").unwrap();
    assert!(store.read_paint_resources().is_err());
    assert!(
        store
            .change_paint_resources(
                0,
                PaintResourceChange::Create {
                    resource: resource()
                }
            )
            .is_err()
    );
    assert_eq!(fs::read(path).unwrap(), b"{ malformed local settings }");
}

#[test]
fn competing_writers_cannot_both_accept_the_same_local_revision() {
    let temp = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(
        temp.path(),
        &ProjectSnapshot::new_authored(StableId("race-settings".into())),
    )
    .unwrap();
    let handles: Vec<_> = (0..2)
        .map(|i| {
            let store = store.clone();
            std::thread::spawn(move || {
                let mut entry = resource();
                entry.identity = StableId(format!("palette:{i}"));
                store
                    .change_paint_resources(0, PaintResourceChange::Create { resource: entry })
                    .is_ok()
            })
        })
        .collect();
    let accepted = handles
        .into_iter()
        .map(|handle| usize::from(handle.join().unwrap()))
        .sum::<usize>();
    assert_eq!(accepted, 1);
    assert_eq!(store.read_paint_resources().unwrap().revision, 1);
}

#[test]
fn durable_local_receipts_distinguish_committed_rejected_unknown_and_other_intents() {
    let temp = tempfile::tempdir().unwrap();
    let store = ProjectStore::create(
        temp.path(),
        &ProjectSnapshot::new_authored(StableId("receipts".into())),
    )
    .unwrap();
    let change = PaintResourceChange::Create {
        resource: resource(),
    };
    let committed = "a".repeat(64);
    let rejected = "b".repeat(64);
    store
        .change_paint_resources_recorded(0, change.clone(), &committed)
        .unwrap();
    assert!(
        store
            .paint_resource_operation_status(&committed, 0, &change)
            .unwrap()
            .unwrap()
            .committed
    );
    assert!(
        store
            .change_paint_resources_recorded(0, change.clone(), &rejected)
            .is_err()
    );
    assert!(
        !store
            .paint_resource_operation_status(&rejected, 0, &change)
            .unwrap()
            .unwrap()
            .committed
    );
    assert!(
        store
            .paint_resource_operation_status(&"c".repeat(64), 0, &change)
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .paint_resource_operation_status(&committed, 1, &change)
            .is_err()
    );
    check_replay_and_invalid_ids(&store, &committed, change);
}

fn check_replay_and_invalid_ids(
    store: &ProjectStore,
    committed: &str,
    change: PaintResourceChange,
) {
    assert!(
        store
            .change_paint_resources_recorded(
                1,
                PaintResourceChange::Delete {
                    identity: resource().identity
                },
                committed
            )
            .is_err()
    );
    let before = fs::read(store.root().join(crate::LOCAL_DIRECTORY).join(FILE)).unwrap();
    assert!(
        store
            .change_paint_resources_recorded(1, change, "bad")
            .is_err()
    );
    assert_eq!(
        fs::read(store.root().join(crate::LOCAL_DIRECTORY).join(FILE)).unwrap(),
        before
    );
    assert_eq!(store.read_paint_resources().unwrap().revision, 1);
}
