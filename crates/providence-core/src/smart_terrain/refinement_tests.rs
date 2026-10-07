use super::*;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};

fn fixture() -> (ProjectSnapshot, StableId) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("terrain-refinement".into()));
    let map = water_tests::map();
    let identity = map.identity.clone();
    snapshot.world.maps.push(map);
    (snapshot, identity)
}

fn request(preset: &str, mask: Vec<MapCoordinate>) -> SmartTerrainIntent {
    SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: preset.into(),
        mask,
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Literal,
    }
}

#[test]
fn narrow_mountains_and_forest_preview_every_cell_with_warnings_and_atomic_history() {
    for family in ["mountains", "forest"] {
        for mask in [water_tests::rectangle(9, 1), water_tests::rectangle(1, 9)] {
            let (snapshot, identity) = fixture();
            let intent = request(family, mask.clone());
            let plan = preview(&snapshot, &identity, &intent).unwrap();
            assert_eq!(plan.paint.painted_cells.len(), mask.len());
            assert_eq!(plan.unresolved.len(), mask.len());
            assert!(
                plan.unresolved_reason
                    .as_deref()
                    .unwrap()
                    .starts_with("Warning:")
            );
            assert!(
                plan.paint
                    .painted_cells
                    .iter()
                    .all(|c| rules().presets[family].family.contains(&c.tile))
            );
            let mut session = EditorSession::new(snapshot.clone());
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: session.revision(),
                    command: EditorCommand::ApplySmartTerrain(Apply {
                        identity,
                        intent,
                        atlas: None,
                    }),
                })
                .unwrap();
            assert_eq!(session.undo_history().len(), 1);
            for cell in plan.paint.painted_cells {
                assert_eq!(
                    session.snapshot().world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize],
                    cell.tile
                );
            }
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: session.revision(),
                    command: EditorCommand::Undo,
                })
                .unwrap();
            assert_eq!(session.snapshot(), &snapshot);
        }
    }
}

#[test]
fn painting_beside_each_family_retiles_the_old_edge() {
    for family in ["mountains", "forest", "water"] {
        let (mut snapshot, identity) = fixture();
        let first = preview(
            &snapshot,
            &identity,
            &request(family, water_tests::rectangle(2, 7)),
        )
        .unwrap();
        for cell in first.paint.painted_cells {
            snapshot.world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize] = cell.tile;
        }
        let extension = (10..17).map(|y| MapCoordinate { x: 12, y }).collect();
        let plan = preview(&snapshot, &identity, &request(family, extension)).unwrap();
        assert!(plan.retiled_neighbors.iter().any(|c| c.x == 11), "{family}");
        assert!(
            plan.unresolved.is_empty(),
            "{family}: {:?}",
            plan.unresolved_reason
        );
    }
}

#[test]
fn repaint_recalculates_existing_family_edges_and_keeps_unrelated_artwork() {
    for family in ["mountains", "forest"] {
        let (mut snapshot, identity) = fixture();
        let wrong = rules().presets[family].roles["northEast"][0];
        for cell in water_tests::rectangle(5, 5) {
            snapshot.world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize] = wrong;
        }
        snapshot.world.maps[0].tiles[10 * 90 + 9] = 151;
        let plan = preview(
            &snapshot,
            &identity,
            &request(family, vec![MapCoordinate { x: 12, y: 12 }]),
        )
        .unwrap();
        assert!(plan.retiled_neighbors.len() > 1);
        assert!(
            plan.paint
                .painted_cells
                .iter()
                .any(|c| c.x == 12 && c.y == 12 && c.tile == rules().presets[family].center[0])
        );
        assert!(
            !plan
                .paint
                .painted_cells
                .iter()
                .any(|c| c.x == 9 && c.y == 10)
        );
    }
}

#[test]
fn parallel_streams_are_rebuilt_as_one_broad_waterway() {
    for vertical in [false, true] {
        let (mut snapshot, identity) = fixture();
        let cells = if vertical {
            water_tests::rectangle(2, 12)
        } else {
            water_tests::rectangle(12, 2)
        };
        for cell in &cells {
            snapshot.world.maps[0].tiles[cell.y as usize * 90 + cell.x as usize] =
                if vertical { 38 } else { 39 };
        }
        let intent = request("water", cells.clone());
        let plan = preview(&snapshot, &identity, &intent).unwrap();
        assert!(plan.unresolved.is_empty(), "{:?}", plan.unresolved_reason);
        assert_eq!(plan.paint.painted_cells.len(), cells.len());
        assert!(
            plan.paint
                .painted_cells
                .iter()
                .all(|c| c.tile <= 32 || c.tile == 60)
        );
        let tiles = plan
            .paint
            .painted_cells
            .iter()
            .map(|c| c.tile)
            .collect::<Vec<_>>();
        water_tests::assert_joins(&snapshot.world.maps[0], &cells, &tiles);
        let again = preview(&snapshot, &identity, &intent).unwrap();
        assert_eq!(plan.paint.painted_cells, again.paint.painted_cells);
    }
}

#[test]
fn impossible_water_uses_reviewable_best_fit_and_cancellation_still_rejects() {
    let (snapshot, identity) = fixture();
    let intent = request("water", vec![MapCoordinate { x: 20, y: 20 }]);
    let plan = preview(&snapshot, &identity, &intent).unwrap();
    assert_eq!(plan.paint.painted_cells.len(), 1);
    assert_eq!(plan.unresolved, intent.mask);
    assert!(preview_cancellable(&snapshot, &identity, &intent, &mut || true).is_err());
}

#[test]
fn an_approximate_stroke_does_not_downgrade_a_separate_exact_lake() {
    let (snapshot, identity) = fixture();
    let mut cells = water_tests::rectangle(7, 5);
    let lake = preview(&snapshot, &identity, &request("water", cells.clone())).unwrap();
    cells.push(MapCoordinate { x: 35, y: 35 });
    let combined = preview(&snapshot, &identity, &request("water", cells)).unwrap();
    assert_eq!(combined.unresolved, vec![MapCoordinate { x: 35, y: 35 }]);
    assert!(
        lake.paint
            .painted_cells
            .iter()
            .all(|cell| combined.paint.painted_cells.contains(cell))
    );
}
