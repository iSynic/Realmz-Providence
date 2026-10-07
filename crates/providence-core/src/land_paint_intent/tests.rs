use super::*;
use crate::{
    model::{LevelType, MapLevel, MapRuntimeMetadata},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};

fn fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("land-intent".into()));
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Land".into(),
        tiles: vec![1; 8100],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: Some(0),
            base_scale: None,
            tileset_id: StableId("landlook:0".into()),
            base_tile: Some(0),
            random_rectangles: vec![],
        }),
    });
    snapshot
}

fn intent() -> LandPaintIntent {
    LandPaintIntent {
        tileset_id: StableId("landlook:0".into()),
        cells: (0..5).map(|x| MapCoordinate { x, y: 0 }).collect(),
        operation: LandPaintOperation::Paint,
        selected_tile: 5,
        replace_tile: None,
        variation: LandPaintVariation::Single,
        variation_tiles: vec![],
        fill_percent: 100,
        seed: 1234,
    }
}

#[test]
fn donor_random_oracle_and_changed_cell_cycle_are_stable() {
    // Evaluated with the donor's JavaScript uint32/Math.imul algorithm.
    assert_eq!(
        (0..12)
            .map(|x| stable_random_index(1234, x, 3, x as usize, 5))
            .collect::<Vec<_>>(),
        vec![4, 4, 4, 0, 1, 3, 3, 1, 4, 0, 4, 1]
    );
    let mut request = intent();
    request.variation = LandPaintVariation::CycleGroup;
    request.variation_tiles = vec![1, 5, 6];
    // Unchanged candidates do not advance the cycle, exactly as paintResolver does.
    assert!(
        preview(&fixture(), &StableId("land:0".into()), &request)
            .unwrap()
            .painted_cells
            .is_empty()
    );
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[0] = 2;
    let plan = preview(&snapshot, &StableId("land:0".into()), &request).unwrap();
    assert_eq!(
        plan.painted_cells
            .iter()
            .map(|cell| cell.tile)
            .collect::<Vec<_>>(),
        vec![1, 5, 6]
    );
    request.variation = LandPaintVariation::StableRandom;
    assert_eq!(
        preview(&snapshot, &StableId("land:0".into()), &request).unwrap(),
        preview(&snapshot, &StableId("land:0".into()), &request).unwrap()
    );
}

#[test]
fn intent_preserves_markers_replaces_specials_and_erase_uses_zero_base() {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[..5].copy_from_slice(&[1001, 0x6000 | 2001, -180, 401, 7]);
    let identity = StableId("land:0".into());
    let mut request = intent();
    request.operation = LandPaintOperation::Erase;
    let plan = preview(&snapshot, &identity, &request).unwrap();
    assert_eq!(
        plan.painted_cells
            .iter()
            .map(|cell| cell.tile)
            .collect::<Vec<_>>(),
        vec![1000, 0x6000 | 2000, 0, 0, 0]
    );
    assert!(plan.protected_cells.is_empty());
    let mut session = EditorSession::new(snapshot.clone());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyLandPaintIntent {
                identity,
                intent: request,
            },
        })
        .unwrap();
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(
        &session.snapshot().world.maps[0].tiles[..5],
        &[1000, 0x6000 | 2000, 0, 0, 0]
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().world.maps[0].tiles[4], 0);
}

#[test]
fn bounded_replace_chance_invalid_atlas_and_no_op_never_mutate() {
    let mut snapshot = fixture();
    snapshot.world.maps[0].tiles[1] = 2;
    let identity = StableId("land:0".into());
    let mut request = intent();
    request.operation = LandPaintOperation::Replace;
    request.replace_tile = Some(2);
    let plan = preview(&snapshot, &identity, &request).unwrap();
    assert_eq!(
        plan.painted_cells,
        vec![LandMapCellPaint {
            x: 1,
            y: 0,
            tile: 5
        }]
    );
    request.fill_percent = 0;
    let mut session = EditorSession::new(snapshot.clone());
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::ApplyLandPaintIntent {
                    identity: identity.clone(),
                    intent: request.clone()
                }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &snapshot);
    assert!(!session.can_undo());
    request.fill_percent = 100;
    request.cells.push(request.cells[0]);
    assert!(preview(&snapshot, &identity, &request).is_err());
    request.cells.pop();
    request.tileset_id = StableId("wrong".into());
    assert!(preview(&snapshot, &identity, &request).is_err());
}
