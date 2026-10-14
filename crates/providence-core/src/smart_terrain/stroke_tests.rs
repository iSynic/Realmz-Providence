use super::*;
use crate::map_selection::{
    MapSelectionRequest, SelectionOperation, SelectionShape, preview_map_selection,
};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};

fn fixture() -> ProjectSnapshot {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("strokes".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut snapshot = session.snapshot().clone();
    snapshot.world.maps[0].tiles.fill(156);
    snapshot
}

fn shape(snapshot: &ProjectSnapshot, kind: SelectionShape, end: (u8, u8)) -> Vec<MapCoordinate> {
    preview_map_selection(
        snapshot,
        &StableId("land:0".into()),
        &MapSelectionRequest {
            shape: kind,
            start: MapCoordinate { x: 20, y: 20 },
            end: MapCoordinate { x: end.0, y: end.1 },
            filled: false,
            operation: SelectionOperation::Replace,
            current: vec![],
            path: vec![],
        },
    )
    .unwrap()
}

fn intent(preset: &str, mask: Vec<MapCoordinate>, tolerance: ShapeTolerance) -> SmartTerrainIntent {
    SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: preset.into(),
        atlas_blob: None,
        mapping_revision: 0,
        mask,
        tolerance,
    }
}

#[test]
fn outlined_ellipses_are_connected_and_water_resolves_without_broken_joins() {
    let snapshot = fixture();
    for end in [
        (36, 32),
        (33, 30),
        (30, 33),
        (32, 28),
        (28, 32),
        (22, 30),
        (30, 22),
    ] {
        let mask = shape(&snapshot, SelectionShape::Ellipse, end);
        let mut reached = BTreeSet::from([(mask[0].x, mask[0].y)]);
        loop {
            let before = reached.len();
            for cell in &mask {
                if reached
                    .iter()
                    .any(|(x, y)| cell.x.abs_diff(*x) + cell.y.abs_diff(*y) == 1)
                {
                    reached.insert((cell.x, cell.y));
                }
            }
            if before == reached.len() {
                break;
            }
        }
        assert_eq!(reached.len(), mask.len(), "Disconnected ellipse {end:?}");
        let plan = preview(
            &snapshot,
            &StableId("land:0".into()),
            &intent("water", mask, ShapeTolerance::Literal),
        )
        .unwrap();
        assert!(
            plan.unresolved.is_empty(),
            "Water ellipse {end:?}: {:?}",
            plan.unresolved
        );
        if end.0 > 25 && end.1 > 25 {
            assert!(
                plan.paint
                    .painted_cells
                    .iter()
                    .all(|cell| !(40..=43).contains(&cell.tile)),
                "A closed ellipse acquired open stream caps: {end:?}"
            );
        }
    }
}

#[test]
fn thin_forests_and_mountains_widen_within_tolerance_without_losing_the_stroke_or_hole() {
    let snapshot = fixture();
    for kind in [
        SelectionShape::Line,
        SelectionShape::Rectangle,
        SelectionShape::Ellipse,
    ] {
        let mask = shape(&snapshot, kind, (33, 28));
        for preset in ["forest", "mountains"] {
            let literal = preview(
                &snapshot,
                &StableId("land:0".into()),
                &intent(preset, mask.clone(), ShapeTolerance::Literal),
            )
            .unwrap();
            for tolerance in [
                ShapeTolerance::Gentle,
                ShapeTolerance::Balanced,
                ShapeTolerance::Strong,
            ] {
                let plan = preview(
                    &snapshot,
                    &StableId("land:0".into()),
                    &intent(preset, mask.clone(), tolerance),
                )
                .unwrap();
                assert!(
                    plan.unresolved.is_empty(),
                    "{preset} {kind:?} {tolerance:?}: {} -> {} warnings",
                    literal.unresolved.len(),
                    plan.unresolved.len()
                );
                assert!(mask.iter().all(|cell| plan.effective_mask.contains(cell)));
                assert!(plan.added_cells.iter().all(|cell| {
                    mask.iter().any(|other| {
                        cell.x.abs_diff(other.x) + cell.y.abs_diff(other.y) <= tolerance.cells()
                    })
                }));
                if kind != SelectionShape::Line {
                    assert!(
                        !plan
                            .effective_mask
                            .contains(&MapCoordinate { x: 26, y: 24 })
                    );
                }
            }
        }
    }
}

#[test]
fn connected_family_selects_an_entire_applied_stroke_across_artwork_variants() {
    for preset in ["water", "mountains", "forest"] {
        let mut snapshot = fixture();
        let mask = shape(&snapshot, SelectionShape::Line, (33, 28));
        let plan = preview(
            &snapshot,
            &StableId("land:0".into()),
            &intent(preset, mask.clone(), ShapeTolerance::Strong),
        )
        .unwrap();
        for cell in plan.paint.painted_cells {
            snapshot.world.maps[0].tiles[usize::from(cell.y) * 90 + usize::from(cell.x)] =
                cell.tile;
        }
        let selected = shape(&snapshot, SelectionShape::ConnectedFamily, (20, 20));
        assert_eq!(
            selected, plan.effective_mask,
            "{preset} selection stopped at an artwork variant"
        );
    }
}
