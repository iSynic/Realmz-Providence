use super::*;
use crate::{
    map_paint::LandTerrainPaint,
    model::{BlobId, LevelType, ScenarioApplicationContract},
    session::{
        EditorCommand, EditorSession, ExpectedRevisionCommand, LandMapCellPaint, Revision,
        SessionHistoryEntry,
    },
};

fn authored() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("import-history".into()))
}

fn execute(session: &mut EditorSession, command: EditorCommand) {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command,
        })
        .unwrap();
}

fn imported() -> ProjectSnapshot {
    let mut builder = EditorSession::new(authored());
    execute(
        &mut builder,
        EditorCommand::CreateMap {
            level_type: LevelType::Land,
        },
    );
    let mut snapshot = builder.snapshot().clone();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "b".repeat(64))),
    };
    snapshot
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
                cells: vec![LandMapCellPaint { x: 3, y: 4, tile }],
            },
        },
    );
}

#[test]
fn import_replaces_prior_history_and_paint_undo_repaint_stays_above_the_baseline() {
    let mut session = EditorSession::new(authored());
    execute(
        &mut session,
        EditorCommand::CreateMap {
            level_type: LevelType::Land,
        },
    );
    execute(
        &mut session,
        EditorCommand::CreateMap {
            level_type: LevelType::Dungeon,
        },
    );
    execute(&mut session, EditorCommand::Undo);
    assert!(session.can_undo() && session.can_redo());
    let baseline = imported();
    session
        .commit_classic_scenario_import(session.revision(), baseline.clone())
        .unwrap();
    assert!(!session.can_undo() && !session.can_redo());
    paint(&mut session, 90);
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo() && session.can_redo());
    let before_rejected_undo = session.persisted_state();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::Undo
            })
            .is_err()
    );
    assert_eq!(session.persisted_state(), before_rejected_undo);
    paint(&mut session, 164);
    assert_eq!(session.snapshot().world.maps[0].tiles[363], 164);
    assert!(session.can_undo() && !session.can_redo());
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo());
    execute(&mut session, EditorCommand::Redo);
    let mut reopened = EditorSession::from_persisted_state(session.persisted_state());
    execute(&mut reopened, EditorCommand::Undo);
    assert_eq!(reopened.snapshot(), &baseline);
    assert!(!reopened.can_undo());
}

#[test]
fn identical_source_reimport_still_establishes_a_new_baseline() {
    let baseline = imported();
    let mut session = EditorSession::new(baseline.clone());
    paint(&mut session, 90);
    session
        .commit_classic_scenario_import(session.revision(), baseline.clone())
        .unwrap();
    assert_eq!(session.snapshot(), &baseline);
    assert!(!session.can_undo() && !session.can_redo());
}

fn legacy_painted_state() -> PersistedSessionState {
    let baseline = imported();
    let mut session = EditorSession::new(baseline.clone());
    paint(&mut session, 90);
    PersistedSessionState {
        snapshot: session.snapshot().clone(),
        revision: Revision(2),
        undo: vec![
            SessionHistoryEntry {
                snapshot: authored(),
                changed_entities: vec![baseline.project_id.clone()],
                references_unchanged: false,
            },
            SessionHistoryEntry {
                snapshot: baseline,
                changed_entities: vec![StableId("land:0".into())],
                references_unchanged: false,
            },
        ],
        redo: vec![],
    }
}

#[test]
fn legacy_reopen_preserves_paint_undo_but_excludes_the_import() {
    let state = legacy_painted_state();
    let applied = state.snapshot.clone();
    let mut session = EditorSession::from_persisted_state(state);
    assert_eq!(session.snapshot(), &applied);
    assert_eq!(session.revision(), Revision(2));
    assert_eq!(session.undo_history().len(), 1);
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &imported());
    assert!(!session.can_undo());
    execute(&mut session, EditorCommand::Redo);
    assert_eq!(session.snapshot(), &applied);
}

#[test]
fn legacy_redo_recovers_an_undone_import_without_making_it_undoable_again() {
    let old = legacy_painted_state();
    let mut session = EditorSession::from_persisted_state(PersistedSessionState {
        snapshot: authored(),
        revision: Revision(4),
        undo: vec![],
        redo: vec![
            SessionHistoryEntry {
                snapshot: old.snapshot.clone(),
                changed_entities: vec![StableId("land:0".into())],
                references_unchanged: false,
            },
            SessionHistoryEntry {
                snapshot: imported(),
                changed_entities: vec![StableId("import-history".into())],
                references_unchanged: false,
            },
        ],
    });
    assert_eq!(session.redo_history().len(), 2);
    execute(&mut session, EditorCommand::Redo);
    assert_eq!(session.snapshot(), &imported());
    assert!(!session.can_undo() && session.can_redo());
    execute(&mut session, EditorCommand::Redo);
    assert_eq!(session.snapshot(), &old.snapshot);
    execute(&mut session, EditorCommand::Undo);
    assert_eq!(session.snapshot(), &imported());
    assert!(!session.can_undo());
}

#[test]
fn ordinary_project_wide_edits_are_not_mistaken_for_imports() {
    let baseline = imported();
    let mut session = EditorSession::new(baseline.clone());
    execute(
        &mut session,
        EditorCommand::SetScenarioApplication {
            contract: ScenarioApplicationContract::default(),
        },
    );
    let mut reopened = EditorSession::from_persisted_state(session.persisted_state());
    assert!(reopened.can_undo());
    execute(&mut reopened, EditorCommand::Undo);
    assert_eq!(reopened.snapshot(), &baseline);
}
