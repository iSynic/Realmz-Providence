use super::action_step_fixtures::{header, placed_snapshot};
use super::*;

fn edit(
    session: &mut EditorSession,
    command: EditorCommand,
) -> Result<crate::session::ChangeProjection, SessionError> {
    session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command,
    })
}

#[test]
fn action_point_header_edits_preserve_marked_unmarked_secret_and_solid_cells() {
    for raw in [112, 1112, -112, -1112, 2112, 3112, 0x6000 | 1112] {
        for chance in [-1, 0, 75] {
            let mut snapshot = placed_snapshot();
            snapshot.world.maps[0].tiles[91] = raw;
            let before = snapshot.world.maps.clone();
            let mut session = EditorSession::new(snapshot);
            let mut row = session.snapshot().world.action_points[0].clone();
            row.chance_percent = chance;
            row.post_action_x = 8;
            edit(
                &mut session,
                EditorCommand::UpdateActionPoint {
                    action_point: Box::new(row),
                },
            )
            .unwrap();
            assert_eq!(
                session.snapshot().world.maps,
                before,
                "tile {raw}, chance {chance}"
            );
            edit(&mut session, EditorCommand::Undo).unwrap();
            assert_eq!(session.snapshot().world.maps, before);
        }
    }
}

#[test]
fn action_point_edit_preserves_imported_overlap_and_native_precedence() {
    let mut snapshot = placed_snapshot();
    let mut other = snapshot.world.action_points[0].clone();
    other.record_index = 7;
    other.identity = StableId("action-point:land:0:7".into());
    snapshot.world.action_points[0].chance_percent = 0;
    snapshot.world.action_points.insert(0, other.clone());
    let mut session = EditorSession::new(snapshot);
    other.chance_percent = 50;
    edit(
        &mut session,
        EditorCommand::UpdateActionPoint {
            action_point: Box::new(other),
        },
    )
    .unwrap();
    let edited = session
        .snapshot()
        .world
        .action_points
        .iter()
        .find(|row| row.record_index == 7)
        .unwrap();
    let status = crate::action_point_activation::project(session.snapshot(), edited);
    assert_eq!(
        status.shadowed_by,
        Some(StableId("action-point:land:0:0".into()))
    );
    assert_eq!(session.snapshot().world.action_points.len(), 2);
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 0);
}

#[test]
fn action_point_marker_edit_is_explicit_atomic_and_shared_with_dormant_rows() {
    let mut session = EditorSession::new(placed_snapshot());
    let before = session.snapshot().clone();
    let mut draft_header = header();
    draft_header.chance_percent = 0;
    let draft = ActionPointRecordDraft {
        source: before.world.action_points[0].identity.clone(),
        descriptor: "Dormant sign".into(),
        header: draft_header,
        entry_marker: Some(true),
        steps: Vec::new(),
    };
    edit(&mut session, EditorCommand::ApplyActionPointDraft { draft }).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 1000);
    assert_eq!(session.snapshot().world.action_points[0].chance_percent, 0);
    edit(&mut session, EditorCommand::Undo).unwrap();
    assert_eq!(session.snapshot(), &before);
    edit(&mut session, EditorCommand::Redo).unwrap();
    mark(
        &mut session,
        before.world.action_points[0].identity.clone(),
        false,
    )
    .unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 0);
}

#[test]
fn action_point_secret_marker_rejection_rolls_back_all_draft_changes() {
    let mut snapshot = placed_snapshot();
    snapshot.world.maps[0].tiles[91] = 3112;
    let before = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    let result = edit(
        &mut session,
        EditorCommand::ApplyActionPointDraft {
            draft: ActionPointRecordDraft {
                source: before.world.action_points[0].identity.clone(),
                descriptor: "Must roll back".into(),
                header: header(),
                entry_marker: Some(false),
                steps: Vec::new(),
            },
        },
    );
    assert!(result.is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn action_point_dormant_move_marks_destination_and_preserves_old_secret() {
    let mut snapshot = placed_snapshot();
    snapshot.world.maps[0].tiles[91] = 3112;
    let mut session = EditorSession::new(snapshot);
    let mut row = session.snapshot().world.action_points[0].clone();
    row.chance_percent = 0;
    row.coordinate = Some(MapCoordinate { x: 2, y: 1 });
    row.classic_door_id = 102;
    edit(
        &mut session,
        EditorCommand::UpdateActionPoint {
            action_point: Box::new(row),
        },
    )
    .unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 3112);
    assert_eq!(session.snapshot().world.maps[0].tiles[92], 1000);
}

#[test]
fn action_point_dungeon_marker_change_preserves_directional_walls_and_notes() {
    let mut snapshot = placed_snapshot();
    snapshot.world.maps[0].level_type = LevelType::Dungeon;
    snapshot.world.maps[0].identity = StableId("dungeon:0".into());
    snapshot.world.maps[0].tiles[91] = 0x696;
    let row = &mut snapshot.world.action_points[0];
    row.level_type = LevelType::Dungeon;
    row.identity = StableId("action-point:dungeon:0:0".into());
    let source = row.identity.clone();
    let mut session = EditorSession::new(snapshot);
    mark(&mut session, source.clone(), true).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 0x1696);
    mark(&mut session, source, false).unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[91], 0x696);
}

#[test]
fn action_point_paint_uses_the_tile_marker_and_never_recreates_it_from_chance() {
    for (raw, chance, expected) in [(1112, 0, 1156), (112, 100, 156), (3112, 0, 3156)] {
        let mut snapshot = placed_snapshot();
        snapshot.world.maps[0].tiles[91] = raw;
        snapshot.world.action_points[0].chance_percent = chance;
        let mut session = EditorSession::new(snapshot);
        edit(
            &mut session,
            EditorCommand::PaintLandMapCells {
                identity: StableId("land:0".into()),
                cells: vec![LandMapCellPaint {
                    x: 1,
                    y: 1,
                    tile: 156,
                }],
            },
        )
        .unwrap();
        assert_eq!(session.snapshot().world.maps[0].tiles[91], expected);
    }
}

#[test]
fn action_point_marker_edits_require_the_expected_revision() {
    let mut session = EditorSession::new(placed_snapshot());
    let source = session.snapshot().world.action_points[0].identity.clone();
    mark(&mut session, source.clone(), true).unwrap();
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::ApplyActionPointDraft {
                    draft: session
                        .action_point_entry_marker_draft(&source, false)
                        .unwrap()
                },
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn action_point_clear_keeps_an_unmarked_colocated_dormant_record_unmarked() {
    for raw in [112, 1112, 3112] {
        let mut snapshot = placed_snapshot();
        snapshot.world.maps[0].tiles[91] = raw;
        let mut other = snapshot.world.action_points[0].clone();
        other.record_index = 7;
        other.identity = StableId("action-point:land:0:7".into());
        other.chance_percent = 0;
        snapshot.world.action_points.push(other);
        let mut session = EditorSession::new(snapshot);
        edit(
            &mut session,
            EditorCommand::ClearActionPoint {
                source: StableId("action-point:land:0:0".into()),
            },
        )
        .unwrap();
        assert_eq!(session.snapshot().world.maps[0].tiles[91], raw);
    }
}

#[test]
fn action_point_activation_preserves_secret_and_unknown_information() {
    for (raw, marker, secret, editable) in [
        (112, false, "none", true),
        (-1112, true, "none", true),
        (2112, true, "revealed", false),
        (3112, true, "hidden", false),
    ] {
        let mut snapshot = placed_snapshot();
        snapshot.world.maps[0].tiles[91] = raw;
        let row = &mut snapshot.world.action_points[0];
        row.actions = vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 33,
                target_native_id: 0,
            },
            ClassicAction {
                slot: 2,
                raw_opcode: 777,
                target_native_id: 0,
            },
        ];
        let status =
            crate::action_point_activation::project(&snapshot, &snapshot.world.action_points[0]);
        assert_eq!(status.entry_marker, Some(marker));
        assert_eq!(status.secret, secret);
        assert_eq!(status.marker_editable, editable);
        assert_eq!(status.check_slots, [0]);
        assert_eq!(status.unknown_slots, [2]);
        snapshot.world.maps.clear();
        let unavailable =
            crate::action_point_activation::project(&snapshot, &snapshot.world.action_points[0]);
        assert_eq!(unavailable.entry_marker, None);
        assert!(!unavailable.marker_editable);
    }
}

fn mark(
    session: &mut EditorSession,
    source: StableId,
    enabled: bool,
) -> Result<crate::session::ChangeProjection, SessionError> {
    let draft = session.action_point_entry_marker_draft(&source, enabled)?;
    edit(session, EditorCommand::ApplyActionPointDraft { draft })
}
