use super::*;

fn rotated_case(turns: usize) -> (ProjectSnapshot, SmartTerrainIntent) {
    let mut map = water_tests::map();
    water_fill_tests::crossing_stream(&mut map);
    let mut mask = water_fill_tests::tapered_mask();
    for _ in 0..turns {
        let before = map.tiles.clone();
        for y in 0..90 {
            for x in 0..90 {
                let tile = before[y * 90 + x];
                let rotated = water_geometry::index(tile).map_or(tile, |p| {
                    let edges = water_geometry::PIECES[p].edges;
                    water_geometry::PIECES
                        .iter()
                        .find(|q| q.edges == [edges[3], edges[0], edges[1], edges[2]])
                        .unwrap()
                        .tile
                });
                map.tiles[x * 90 + 89 - y] = rotated;
            }
        }
        mask = mask
            .iter()
            .map(|c| MapCoordinate {
                x: 89 - c.y,
                y: c.x,
            })
            .collect();
    }
    let mut snapshot = ProjectSnapshot::new_authored(StableId("mouth".into()));
    snapshot.world.maps.push(map);
    let intent = SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: "water".into(),
        mask,
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Balanced,
    };
    (snapshot, intent)
}

#[test]
fn balanced_fills_join_streams_in_every_orientation_within_the_original_band() {
    for turns in 0..4 {
        let (snapshot, intent) = rotated_case(turns);
        let plan = preview(&snapshot, &StableId("land:0".into()), &intent).unwrap();
        assert!(
            plan.unresolved.is_empty(),
            "rotation {turns}: {:?}",
            plan.unresolved
        );
        let cells: Vec<_> = plan
            .paint
            .painted_cells
            .iter()
            .map(|c| MapCoordinate { x: c.x, y: c.y })
            .collect();
        let tiles: Vec<_> = plan.paint.painted_cells.iter().map(|c| c.tile).collect();
        water_tests::assert_joins(&snapshot.world.maps[0], &cells, &tiles);
        assert!(
            tiles.iter().filter(|&&t| (21..=24).contains(&t)).count() >= 2,
            "rotation {turns}: {tiles:?}"
        );
        for cell in cells.iter().filter(|c| !intent.mask.contains(c)) {
            assert!(
                intent
                    .mask
                    .iter()
                    .any(|c| c.x.abs_diff(cell.x) + c.y.abs_diff(cell.y) <= 2)
            );
        }
        for cell in &plan.removed_cells {
            assert!((0u8..90).any(|x| (0u8..90).any(|y| {
                x.abs_diff(cell.x) + y.abs_diff(cell.y) <= 2
                    && !intent.mask.contains(&MapCoordinate { x, y })
            })));
        }
        let repeated = preview(&snapshot, &StableId("land:0".into()), &intent).unwrap();
        assert_eq!(plan.paint, repeated.paint);
        assert_eq!(plan.effective_mask, repeated.effective_mask);
    }
}

#[test]
fn mouth_search_is_bounded_and_cancellable() {
    let rendered = vec![156; 8100];
    let patch = water_join_search::Patch {
        rendered: &rendered,
        cells: vec![910],
        domains: vec![water_join_search::ALL],
    };
    assert_eq!(
        patch.solve(&mut 0, &mut || false, None, None, |_| true),
        Err(water_solver::Failure::Budget)
    );
    assert_eq!(
        patch.solve(&mut 100, &mut || true, None, None, |_| true),
        Err(water_solver::Failure::Canceled)
    );
}
