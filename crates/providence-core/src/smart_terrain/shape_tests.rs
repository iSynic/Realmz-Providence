use super::*;

#[test]
fn smoothing_inherits_nearby_ground_and_does_not_invent_distant_materials() {
    let mut tiles = vec![60; 8100];
    tiles[0] = 155;
    tiles[20 * 90 + 20] = 156;
    let ground = shape_planning::local_ground(&tiles, &[155, 156]);
    assert_eq!(ground[21 * 90 + 21], Some(156));
    assert_eq!(ground[0], Some(155));
    assert_eq!(ground[30 * 90 + 30], None);
}

fn coordinates(points: impl Iterator<Item = (u8, u8)>) -> Vec<MapCoordinate> {
    points.map(|(x, y)| MapCoordinate { x, y }).collect()
}

#[test]
fn smoothing_keeps_both_sides_of_the_contour_within_the_selected_tolerance() {
    let diagonal =
        coordinates((0..36).flat_map(|y| (0..3).map(move |dx| (10 + y * 3 / 4 + dx, 10 + y))));
    let arm = coordinates(
        (20..32)
            .flat_map(|y| (20..32).map(move |x| (x, y)))
            .chain((32..58).flat_map(|x| [25, 26].map(|y| (x, y)))),
    );
    for original in [diagonal, arm] {
        for tolerance in 1..=3 {
            for mask in
                shape_adjustment::candidates(&original, &vec![true; 8100], tolerance, &mut || false)
            {
                for (from, to) in [(&original, &mask), (&mask, &original)] {
                    for cell in from {
                        assert!(
                            to.iter().any(|other| {
                                cell.x.abs_diff(other.x) + cell.y.abs_diff(other.y) <= tolerance
                            }),
                            "{cell:?} moved farther than {tolerance} cells"
                        );
                    }
                }
            }
        }
    }
}

#[test]
fn smoothing_leaves_unselected_special_artwork_and_other_terrain_untouched() {
    use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("artwork".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut snapshot = session.snapshot().clone();
    let protected = MapCoordinate { x: 23, y: 20 };
    let mask = coordinates((20..30).flat_map(|y| (20..30).map(move |x| (x, y))))
        .into_iter()
        .filter(|cell| *cell != protected)
        .collect();
    let intent = SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: "water".into(),
        mask,
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Strong,
    };
    for tile in [-3112, 122, 180] {
        snapshot.world.maps[0].tiles.fill(156);
        snapshot.world.maps[0].tiles[20 * 90 + 23] = tile;
        let plan = preview(&snapshot, &StableId("land:0".into()), &intent).unwrap();
        assert!(
            !plan
                .paint
                .painted_cells
                .iter()
                .any(|cell| cell.x == protected.x && cell.y == protected.y),
            "Smoothing replaced unselected artwork {tile}"
        );
    }
}

fn topology(cells: &[MapCoordinate], foreground: bool) -> usize {
    let selected: BTreeSet<_> = cells.iter().map(|c| (c.x as i16, c.y as i16)).collect();
    let mut remaining: BTreeSet<_> = (0..90)
        .flat_map(|y| (0..90).map(move |x| (x, y)))
        .filter(|p| selected.contains(p) == foreground)
        .collect();
    let mut count = 0;
    while let Some(first) = remaining.pop_first() {
        count += 1;
        let mut stack = vec![first];
        while let Some((x, y)) = stack.pop() {
            for dx in -1i16..=1 {
                for dy in -1i16..=1 {
                    if dx == 0 && dy == 0 || foreground && dx.abs() + dy.abs() != 1 {
                        continue;
                    }
                    let p = (x + dx, y + dy);
                    if remaining.remove(&p) {
                        stack.push(p);
                    }
                }
            }
        }
    }
    count
}

#[test]
fn smoothing_is_bounded_deterministic_and_preserves_holes_components_and_narrow_links() {
    let original = coordinates(
        (10..30)
            .flat_map(|y| (10..30).map(move |x| (x, y)))
            .filter(|(x, y)| !((16..23).contains(x) && (16..23).contains(y)))
            .chain((30..40).map(|x| (x, 20)))
            .chain((17..24).flat_map(|y| (40..47).map(move |x| (x, y))))
            .chain((50..57).flat_map(|y| (50..57).map(move |x| (x, y)))),
    );
    let original_topology = (topology(&original, true), topology(&original, false));
    let mut editable = vec![true; 8100];
    editable[10 * 90 + 10] = false;
    for tolerance in 1..=3 {
        let candidates =
            shape_adjustment::candidates(&original, &editable, tolerance, &mut || false);
        assert!(candidates.len() > 1);
        assert_eq!(
            candidates,
            shape_adjustment::candidates(&original, &editable, tolerance, &mut || false)
        );
        for mask in candidates {
            assert_eq!(
                (topology(&mask, true), topology(&mask, false)),
                original_topology
            );
            assert!(mask.contains(&MapCoordinate { x: 10, y: 10 }));
            for x in 30..40 {
                assert!(mask.contains(&MapCoordinate { x, y: 20 }));
            }
            for cell in original.iter().filter(|cell| !mask.contains(cell)) {
                assert!((0u8..90).any(|x| {
                    (0u8..90).any(|y| {
                        !original.contains(&MapCoordinate { x, y })
                            && x.abs_diff(cell.x) + y.abs_diff(cell.y) <= tolerance
                    })
                }));
            }
        }
    }
}

#[test]
fn literal_and_canceled_shape_work_never_adjust_the_original() {
    let mask = coordinates((10..20).flat_map(|y| (10..20).map(move |x| (x, y))));
    assert_eq!(
        shape_adjustment::candidates(&mask, &vec![true; 8100], 0, &mut || false),
        vec![mask.clone()]
    );
    assert_eq!(
        shape_adjustment::candidates(&mask, &vec![true; 8100], 3, &mut || true),
        vec![mask]
    );
}

#[test]
fn widening_keeps_holes_separate_regions_and_unselected_artwork() {
    let original = coordinates(
        (20..30)
            .flat_map(|y| (20..30).map(move |x| (x, y)))
            .filter(|(x, y)| *x == 20 || *x == 29 || *y == 20 || *y == 29)
            .chain((20..30).map(|y| (33, y))),
    );
    let expected = (topology(&original, true), topology(&original, false));
    let mut editable = vec![true; 8100];
    editable[19 * 90 + 25] = false;
    for tolerance in 1..=3 {
        for mask in
            shape_adjustment::widening_candidates(&original, &editable, tolerance, &mut || false)
        {
            assert_eq!((topology(&mask, true), topology(&mask, false)), expected);
            assert!(original.iter().all(|cell| mask.contains(cell)));
            assert!(!mask.contains(&MapCoordinate { x: 25, y: 19 }));
            assert!(!mask.contains(&MapCoordinate { x: 25, y: 25 }));
            assert!(mask.iter().all(|cell| {
                original
                    .iter()
                    .any(|other| cell.x.abs_diff(other.x) + cell.y.abs_diff(other.y) <= tolerance)
            }));
        }
    }
}

#[test]
fn smoothing_trims_dangling_lake_tips_without_shortening_standalone_streams() {
    let mut lake = coordinates((20..29).flat_map(|y| (20..29).map(move |x| (x, y))));
    let tip = MapCoordinate { x: 24, y: 19 };
    lake.push(tip);
    let masks = shape_adjustment::candidates(&lake, &vec![true; 8100], 1, &mut || false);
    assert!(masks.iter().skip(1).any(|mask| !mask.contains(&tip)));
    let stream = coordinates((20..29).map(|x| (x, 40)));
    for mask in shape_adjustment::candidates(&stream, &vec![true; 8100], 3, &mut || false) {
        assert_eq!(mask, stream);
    }
}

#[test]
fn smoothed_preview_keeps_original_mask_and_apply_uses_identical_plan() {
    use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};
    let mut session =
        EditorSession::new(ProjectSnapshot::new_authored(StableId("smoothing".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let identity = StableId("land:0".into());
    let original = coordinates((20..34).flat_map(|y| (20..34).map(move |x| (x, y))));
    let intent = SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: "water".into(),
        mask: original.clone(),
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Strong,
    };
    let before = session.snapshot().clone();
    let plan = preview(&before, &identity, &intent).unwrap();
    assert!(plan.unresolved.is_empty(), "{:?}", plan.unresolved_reason);
    assert_eq!(plan.mask, original);
    assert_ne!(
        plan.effective_mask, original,
        "Smoothing must actually improve this cornered mask"
    );
    let again = preview(&before, &identity, &intent).unwrap();
    assert_eq!(plan.paint, again.paint);
    assert_eq!(plan.effective_mask, again.effective_mask);
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
    for cell in &plan.paint.painted_cells {
        assert_eq!(
            session.snapshot().world.maps[0].tiles[usize::from(cell.y) * 90 + usize::from(cell.x)],
            cell.tile
        );
    }
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &before);
}
