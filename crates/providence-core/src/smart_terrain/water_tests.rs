use super::{
    water_geometry::{PIECES, fixed_edge},
    water_solver::{self, Failure},
};
use crate::{
    model::*,
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
};

pub(super) fn map() -> MapLevel {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("water".into())));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::CreateMap {
                level_type: LevelType::Land,
            },
        })
        .unwrap();
    let mut map = session.snapshot().world.maps[0].clone();
    map.tiles.fill(156);
    map
}

pub(super) fn rectangle(width: u8, height: u8) -> Vec<MapCoordinate> {
    (10..10 + height)
        .flat_map(|y| (10..10 + width).map(move |x| MapCoordinate { x, y }))
        .collect()
}

pub(super) fn assert_joins(map: &MapLevel, cells: &[MapCoordinate], output: &[i16]) {
    let mut rendered = map.clone();
    for (cell, tile) in cells.iter().zip(output) {
        rendered.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)] = *tile;
    }
    for cell in cells {
        let tile = rendered.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)];
        for (d, (dx, dy)) in [(0, -1), (1, 0), (0, 1), (-1, 0)].into_iter().enumerate() {
            let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
            if !(0..90).contains(&x) || !(0..90).contains(&y) {
                continue;
            }
            let other = rendered.tiles[y as usize * 90 + x as usize];
            assert_eq!(
                fixed_edge(tile, d),
                fixed_edge(other, (d + 2) % 4),
                "{tile} to {other}, direction {d}"
            );
        }
    }
}

#[test]
fn literal_lake_and_stream_have_matching_boundaries_and_repeat_exactly() {
    let map = map();
    for cells in [
        rectangle(3, 3),
        rectangle(12, 8),
        rectangle(20, 1),
        rectangle(1, 20),
    ] {
        let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
        assert_joins(&map, &cells, &output);
        assert_eq!(
            output,
            water_solver::solve(&map, &cells, &mut || false).unwrap()
        );
        assert!(
            output
                .iter()
                .all(|tile| !(33..=35).contains(tile) && !(56..=59).contains(tile))
        );
    }
}

#[test]
fn impossible_singleton_and_cancellation_never_return_partial_tiles() {
    let map = map();
    assert_eq!(
        water_solver::solve(&map, &rectangle(1, 1), &mut || false),
        Err(Failure::Impossible)
    );
    assert_eq!(
        water_solver::solve(&map, &rectangle(3, 3), &mut || true),
        Err(Failure::Canceled)
    );
}

#[test]
fn every_joining_piece_can_be_recovered_from_its_fixed_neighbors() {
    for piece in PIECES {
        let mut map = map();
        for (d, (x, y)) in [(10, 9), (11, 10), (10, 11), (9, 10)]
            .into_iter()
            .enumerate()
        {
            let neighbor = PIECES
                .iter()
                .find(|candidate| candidate.edges[(d + 2) % 4] == piece.edges[d])
                .unwrap();
            map.tiles[y * 90 + x] = neighbor.tile;
        }
        let cells = rectangle(1, 1);
        let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
        assert_eq!(
            output,
            vec![piece.tile],
            "fixed boundary for {}",
            piece.tile
        );
        assert_joins(&map, &cells, &output);
    }
}

#[test]
fn large_lake_stays_within_the_solver_work_budget() {
    let map = map();
    let cells = rectangle(40, 40);
    let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
    assert_joins(&map, &cells, &output);
}

#[test]
fn straight_lake_edges_do_not_gain_artificial_sawtooth_phases() {
    let map = map();
    let output = water_solver::solve(&map, &rectangle(16, 12), &mut || false).unwrap();
    assert!(
        output[1..15].iter().all(|tile| *tile == 3),
        "{:?}",
        &output[..16]
    );
    assert!(output[177..191].iter().all(|tile| *tile == 4));
    for y in 1..11 {
        assert_eq!((output[y * 16], output[y * 16 + 15]), (1, 2));
    }
}

#[test]
fn acute_diagonal_resolves_its_tips_and_preserves_filled_interiors() {
    let map = map();
    for transpose in [false, true] {
        for flip_x in [false, true] {
            for flip_y in [false, true] {
                let cells: Vec<_> = (0..12)
                    .flat_map(|y| {
                        (0..24).filter_map(move |x| {
                            if x < 2 * y {
                                return None;
                            }
                            let (x, y) = if transpose { (y, x) } else { (x, y) };
                            Some(MapCoordinate {
                                x: 10 + if flip_x { 24 - x } else { x },
                                y: 10 + if flip_y { 24 - y } else { y },
                            })
                        })
                    })
                    .collect();
                let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
                assert_joins(&map, &cells, &output);
                let selected: std::collections::BTreeSet<_> =
                    cells.iter().map(|c| (c.x as i16, c.y as i16)).collect();
                for (cell, tile) in cells.iter().zip(&output) {
                    let interior = (-1..=1).all(|dy| {
                        (-1..=1)
                            .all(|dx| selected.contains(&(cell.x as i16 + dx, cell.y as i16 + dy)))
                    });
                    if interior {
                        assert_eq!(*tile, 60, "A broad water interior became a stream");
                    }
                }
            }
        }
    }
}

#[test]
fn authored_slope_and_mouth_contexts_recover_exact_tiles_without_the_original_hint() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/authored-water-joins.json")).unwrap();
    let mut checked = 0;
    for source in fixtures["sources"].as_array().unwrap() {
        for case in source["cases"].as_array().unwrap() {
            let mut map = map();
            for (d, (x, y)) in [(10, 9), (11, 10), (10, 11), (9, 10)]
                .into_iter()
                .enumerate()
            {
                map.tiles[y * 90 + x] = case["neighbors"][d].as_i64().unwrap() as i16;
            }
            let tiles = water_solver::solve(&map, &rectangle(1, 1), &mut || false).unwrap();
            assert_eq!(
                tiles,
                vec![case["expectedTile"].as_i64().unwrap() as i16],
                "{case}"
            );
            checked += 1;
        }
    }
    assert_eq!(checked, 50);
}

#[test]
fn alternating_slope_runs_solve_together_without_original_tile_hints() {
    let mut map = map();
    // Twelve rising phases, enclosed by exact fixed artwork at both ends.
    let cells: Vec<_> = (0..12)
        .flat_map(|n| {
            [
                MapCoordinate {
                    x: 20 + n,
                    y: 20 + 2 * n,
                },
                MapCoordinate {
                    x: 20 + n,
                    y: 21 + 2 * n,
                },
            ]
        })
        .collect();
    for y in 15..50 {
        for x in 15..40 {
            let boundary = 20 + (y as i16 - 20).div_euclid(2);
            map.tiles[y * 90 + x] = if x as i16 > boundary { 60 } else { 156 };
        }
    }
    map.tiles[19 * 90 + 20] = 60;
    for cell in &cells {
        map.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)] = 156;
    }
    let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
    assert_eq!(output, [6, 5].repeat(12));
    assert_joins(&map, &cells, &output);
    super::water_orientations::verify_runs(&map, &cells);
    super::water_orientations::verify_mouths(&map);
}

#[test]
fn repainting_an_authored_inlet_can_improve_coverage_while_preserving_fixed_joins() {
    let mut map = map();
    // Trouble Land 0 (77,78): the 19/20 and 17/18 phases bound an inlet.
    for (x, y, tile) in [
        (10, 9, 60),
        (11, 9, 35),
        (12, 10, 56),
        (12, 11, 60),
        (11, 12, 58),
        (10, 12, 60),
        (9, 10, 177),
        (9, 11, 177),
    ] {
        map.tiles[y * 90 + x] = tile;
    }
    // The fixed water on the east joins both rows; keep one column in the region.
    let cells = rectangle(3, 2);
    for (cell, tile) in cells.iter().zip([19, 20, 60, 17, 18, 60]) {
        map.tiles[usize::from(cell.y) * 90 + usize::from(cell.x)] = tile;
    }
    map.tiles[10 * 90 + 13] = 60;
    map.tiles[11 * 90 + 13] = 60;
    map.tiles[9 * 90 + 12] = 60;
    map.tiles[12 * 90 + 12] = 60;
    let original = [19, 20, 60, 17, 18, 60];
    assert_joins(&map, &cells, &original);
    let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
    assert_joins(&map, &cells, &output);
    let area = |tiles: &[i16]| {
        tiles
            .iter()
            .map(|tile| {
                u32::from(
                    PIECES
                        .iter()
                        .find(|piece| piece.tile == *tile)
                        .unwrap()
                        .area,
                )
            })
            .sum::<u32>()
    };
    assert!(area(&output) > area(&original));
    assert_eq!(
        output,
        water_solver::solve(&map, &cells, &mut || false).unwrap()
    );
}
