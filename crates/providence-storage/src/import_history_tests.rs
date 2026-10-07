use super::*;
use providence_core::session::{EditorSession, PersistedSessionState, SessionHistoryEntry};
use providence_core::{
    map_paint::LandTerrainPaint,
    model::{LevelType, ProjectOrigin, StableId},
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

fn imported_fixture(store: &ProjectStore, authored: &ProjectSnapshot) -> ProjectSnapshot {
    let mut builder = EditorSession::new(authored.clone());
    execute(
        &mut builder,
        EditorCommand::CreateMap {
            level_type: LevelType::Land,
        },
    );
    let mut imported = builder.snapshot().clone();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: store
            .put_blob(b"controlled import-history fixture")
            .unwrap(),
    };
    imported
}

fn paint(session: &mut EditorSession, tile: i16) {
    let tileset_id = session.snapshot().world.maps[0]
        .runtime
        .as_ref()
        .unwrap()
        .tileset_id
        .clone();
    execute(
        session,
        EditorCommand::PaintLandTerrain {
            identity: StableId("land:0".into()),
            paint: LandTerrainPaint {
                tileset_id,
                cells: vec![LandMapCellPaint { x: 0, y: 0, tile }],
            },
        },
    );
}

#[test]
fn scenario_import_baseline_and_post_import_paint_history_survive_reopen() {
    let temporary = tempfile::tempdir().unwrap();
    let authored = ProjectSnapshot::new_authored(StableId("import-store".into()));
    let store = ProjectStore::create(temporary.path(), &authored).unwrap();
    let baseline = imported_fixture(&store, &authored);
    let mut session = EditorSession::new(authored);
    session
        .commit_classic_scenario_import(Revision(0), baseline.clone())
        .unwrap();
    store
        .checkpoint_session(
            &session,
            &serde_json::json!({"method": "project.import-classic-scenario"}),
        )
        .unwrap();
    let (store, mut session) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo() && !session.can_redo());
    paint(&mut session, 90);
    store
        .checkpoint_session(
            &session,
            &serde_json::json!({"method": "map.paint-terrain"}),
        )
        .unwrap();
    let (store, mut session) = ProjectStore::open_session(temporary.path()).unwrap();
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo() && session.can_redo());
    store
        .checkpoint_session(&session, &serde_json::json!({"method": "history.undo"}))
        .unwrap();
    let (store, mut session) = ProjectStore::open_session(temporary.path()).unwrap();
    assert!(!session.can_undo() && session.can_redo());
    paint(&mut session, 164);
    assert!(!session.can_redo());
    store
        .checkpoint_session(
            &session,
            &serde_json::json!({"method": "map.paint-terrain"}),
        )
        .unwrap();
    let (_, mut session) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[0], 164);
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo());
}

fn write_legacy_history(store: &ProjectStore, state: &PersistedSessionState) {
    let blob = store.put_blob(&serde_json::to_vec(state).unwrap()).unwrap();
    store
        .open_database()
        .unwrap()
        .execute(
            "INSERT OR REPLACE INTO metadata(key,value) VALUES ('session_state_blob',?1)",
            [&blob.0],
        )
        .unwrap();
}

#[test]
fn legacy_import_history_reopens_without_changing_authored_truth_or_losing_redo_recovery() {
    let temporary = tempfile::tempdir().unwrap();
    let authored = ProjectSnapshot::new_authored(StableId("legacy-import-store".into()));
    let store = ProjectStore::create(temporary.path(), &authored).unwrap();
    let imported = imported_fixture(&store, &authored);
    let mut painter = EditorSession::new(imported.clone());
    paint(&mut painter, 90);
    let painted = painter.snapshot().clone();
    let import_entry = SessionHistoryEntry {
        snapshot: authored.clone(),
        changed_entities: vec![authored.project_id.clone()],
        references_unchanged: false,
    };
    let paint_entry = SessionHistoryEntry {
        snapshot: imported.clone(),
        changed_entities: vec![StableId("land:0".into())],
        references_unchanged: false,
    };
    store.save_snapshot(&painted).unwrap();
    write_legacy_history(
        &store,
        &PersistedSessionState {
            snapshot: painted.clone(),
            revision: Revision(2),
            undo: vec![import_entry, paint_entry],
            redo: vec![],
        },
    );
    let before = fs::read(store.snapshot_path()).unwrap();
    let (_, mut reopened) = ProjectStore::open_session(temporary.path()).unwrap();
    assert_eq!(fs::read(store.snapshot_path()).unwrap(), before);
    assert_eq!(reopened.snapshot(), &painted);
    assert_eq!(reopened.undo_history().len(), 1);
    execute(&mut reopened, EditorCommand::Undo);
    assert_eq!(reopened.snapshot(), &imported);
    assert!(!reopened.can_undo());

    assert_legacy_redo_recovery(&store, authored, imported, painted);
}

fn assert_legacy_redo_recovery(
    store: &ProjectStore,
    authored: ProjectSnapshot,
    imported: ProjectSnapshot,
    painted: ProjectSnapshot,
) {
    store.save_snapshot(&authored).unwrap();
    write_legacy_history(
        store,
        &PersistedSessionState {
            snapshot: authored.clone(),
            revision: Revision(4),
            undo: vec![],
            redo: vec![
                SessionHistoryEntry {
                    snapshot: painted,
                    changed_entities: vec![StableId("land:0".into())],
                    references_unchanged: false,
                },
                SessionHistoryEntry {
                    snapshot: imported.clone(),
                    changed_entities: vec![authored.project_id],
                    references_unchanged: false,
                },
            ],
        },
    );
    let (_, mut recovered) = ProjectStore::open_session(store.root()).unwrap();
    assert_eq!(recovered.redo_history().len(), 2);
    execute(&mut recovered, EditorCommand::Redo);
    assert_eq!(recovered.snapshot(), &imported);
    assert!(!recovered.can_undo() && recovered.can_redo());
    store
        .checkpoint_session(&recovered, &serde_json::json!({"method": "history.redo"}))
        .unwrap();
    let (_, mut recovered) = ProjectStore::open_session(store.root()).unwrap();
    assert!(!recovered.can_undo() && recovered.can_redo());
    execute(&mut recovered, EditorCommand::Redo);
    assert_eq!(recovered.snapshot().world.maps[0].tiles[0], 90);
}
