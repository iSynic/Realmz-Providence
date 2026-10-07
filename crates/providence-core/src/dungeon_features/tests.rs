use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn session() -> EditorSession {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dungeon-features".into()));
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Dungeon,
            },
        })
        .unwrap();
    snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles[0] = 0x9161_u16 as i16;
    snapshot.world.maps[0].tiles[1] = 0x8204_u16 as i16;
    EditorSession::new(snapshot)
}

fn edit() -> DungeonFeatureEdit {
    DungeonFeatureEdit {
        cells: vec![MapCoordinate { x: 0, y: 0 }, MapCoordinate { x: 1, y: 0 }],
        changes: vec![
            DungeonFeatureChange {
                primitive: DungeonPrimitive::Wall,
                enabled: false,
            },
            DungeonFeatureChange {
                primitive: DungeonPrimitive::Stairs,
                enabled: true,
            },
        ],
    }
}

fn apply(
    session: &mut EditorSession,
    edit: DungeonFeatureEdit,
) -> Result<crate::session::ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: EditorCommand::ApplyDungeonFeatures {
            identity: StableId("dungeon:0".into()),
            edit,
        },
    })
}

#[test]
fn dungeon_feature_selection_retains_mixed_values_and_managed_markers_in_one_history_entry() {
    let mut session = session();
    let identity = StableId("dungeon:0".into());
    let before = session.snapshot().clone();
    let draft = edit();
    let states = inspect_dungeon_features(&before, &identity, &draft.cells).unwrap();
    assert_eq!(states.len(), 12);
    assert_eq!(
        states
            .iter()
            .find(|state| state.primitive == DungeonPrimitive::Wall)
            .unwrap()
            .enabled,
        None
    );
    let preview = preview_dungeon_features(&before, &identity, &draft).unwrap();
    assert_eq!(preview.managed_cells, 2);
    assert_eq!(session.snapshot(), &before);
    let delta = apply(&mut session, draft).unwrap();
    assert!(delta.references_unchanged);
    assert_eq!(session.revision(), Revision(1));
    let after = session.snapshot().clone();
    for cell in &preview.painted_cells {
        assert_eq!(after.world.maps[0].tiles[usize::from(cell.x)], cell.tile);
        assert_eq!(
            cell.tile as u16 & 0x9060,
            before.world.maps[0].tiles[usize::from(cell.x)] as u16 & 0x9060
        );
    }
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &after);
}

#[test]
fn dungeon_feature_late_invalid_fields_cannot_partially_write_or_add_history() {
    let mut session = session();
    let before = session.snapshot().clone();
    let mut outside = edit();
    outside.cells.push(MapCoordinate { x: 90, y: 0 });
    assert!(apply(&mut session, outside).is_err());
    let mut managed = edit();
    managed.changes.push(DungeonFeatureChange {
        primitive: DungeonPrimitive::ActionPointMarker,
        enabled: false,
    });
    assert!(apply(&mut session, managed).is_err());
    let mut duplicate = edit();
    duplicate.changes.push(duplicate.changes[0].clone());
    assert!(apply(&mut session, duplicate).is_err());
    let mut duplicate_cell = edit();
    duplicate_cell.cells.push(MapCoordinate { x: 0, y: 0 });
    assert!(apply(&mut session, duplicate_cell).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
    assert!(!session.can_undo());
}

#[test]
fn dungeon_feature_noop_and_malformed_geometry_are_safe_and_explicit() {
    let mut session = session();
    let unchanged = DungeonFeatureEdit {
        cells: vec![MapCoordinate { x: 0, y: 0 }],
        changes: vec![DungeonFeatureChange {
            primitive: DungeonPrimitive::Wall,
            enabled: true,
        }],
    };
    let preview = preview_dungeon_features(
        session.snapshot(),
        &StableId("dungeon:0".into()),
        &unchanged,
    )
    .unwrap();
    assert_eq!(preview.unchanged_cells, 1);
    assert!(preview.painted_cells.is_empty());
    assert!(apply(&mut session, unchanged).is_err());
    let mut malformed = session.snapshot().clone();
    malformed.world.maps[0].tiles.truncate(1);
    assert!(preview_dungeon_features(&malformed, &StableId("dungeon:0".into()), &edit()).is_err());
}
