use super::*;
use crate::model::LandLayout;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};

fn fixture() -> EditorSession {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "layout-review".into(),
    )));
    for revision in 0..2 {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(revision),
                command: EditorCommand::CreateMap {
                    level_type: LevelType::Land,
                },
            })
            .unwrap();
    }
    let mut snapshot = session.snapshot().clone();
    let mut cells = vec![0; LAND_LAYOUT_CELLS];
    cells[0] = -1;
    cells[17] = -1;
    cells[34] = 1;
    cells[100] = 99;
    cells[127] = -42;
    snapshot.world.land_layout = Some(LandLayout { cells });
    EditorSession::new(snapshot)
}

#[test]
fn reviewed_relocation_names_all_previous_cells_and_displaced_map_and_matches_one_history_step() {
    let mut session = fixture();
    let before = session.snapshot().clone();
    let target = StableId("land:0".into());
    let preview = preview_layout_placement(&before, 2, 2, Some(&target)).unwrap();
    assert_eq!(
        preview
            .changes
            .iter()
            .map(|change| (change.row, change.column))
            .collect::<Vec<_>>(),
        [(0, 0), (1, 1), (2, 2)]
    );
    assert_eq!(preview.target.unwrap().identity, Some(target.clone()));
    assert_eq!(
        preview.replaced.unwrap().identity,
        Some(StableId("land:1".into()))
    );
    assert_eq!(session.snapshot(), &before);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::SetLandLayoutCell {
                row: 2,
                column: 2,
                target: Some(target),
            },
        })
        .unwrap();
    let after = session.snapshot().clone();
    let cells = &after.world.land_layout.as_ref().unwrap().cells;
    assert_eq!(
        (cells[0], cells[17], cells[34], cells[100], cells[127]),
        (0, 0, -1, 99, -42)
    );
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
fn missing_and_unrecognized_placements_remain_explicit_and_clear_only_the_selected_cell() {
    let session = fixture();
    let snapshot = session.snapshot();
    let missing = preview_layout_placement(snapshot, 6, 4, None).unwrap();
    assert!(missing.replaced.unwrap().missing);
    assert_eq!(missing.changes.len(), 1);
    let unknown = preview_layout_placement(snapshot, 7, 15, None).unwrap();
    assert_eq!(unknown.replaced.unwrap().native_index, None);
    let current =
        preview_layout_placement(snapshot, 2, 2, Some(&StableId("land:1".into()))).unwrap();
    assert!(current.changes.is_empty());
    assert!(preview_layout_placement(snapshot, 8, 0, None).is_err());
    assert!(preview_layout_placement(snapshot, 0, 0, Some(&StableId("dungeon:0".into()))).is_err());
}
