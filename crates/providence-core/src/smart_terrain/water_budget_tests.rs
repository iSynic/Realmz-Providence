use super::{
    water_solver,
    water_tests::{assert_joins, map, rectangle},
};
use crate::model::MapCoordinate;
use std::time::Instant;

fn cases() -> Vec<(&'static str, Vec<MapCoordinate>)> {
    let ring = rectangle(9, 9)
        .into_iter()
        .filter(|c| c.x == 10 || c.x == 18 || c.y == 10 || c.y == 18)
        .collect();
    let island = rectangle(16, 12)
        .into_iter()
        .filter(|c| !(15..20).contains(&c.x) || !(14..18).contains(&c.y))
        .collect();
    let lobes = rectangle(22, 10)
        .into_iter()
        .filter(|c| c.x < 18 || c.x >= 24 || c.y == 15)
        .collect();
    let staircase = rectangle(20, 14)
        .into_iter()
        .filter(|c| c.x >= 10 + (c.y - 10) / 2)
        .collect();
    let concave = rectangle(18, 14)
        .into_iter()
        .filter(|c| c.x < 17 || c.y < 16 || c.y >= 21)
        .collect();
    vec![
        ("32-cell-ring", ring),
        ("island", island),
        ("narrow-connection", lobes),
        ("staircase", staircase),
        ("concave", concave),
        ("large-filled", rectangle(60, 60)),
        (
            "many-isolated-rings",
            (0..36)
                .flat_map(|i| {
                    rectangle(9, 9)
                        .into_iter()
                        .filter(|c| c.x == 10 || c.x == 18 || c.y == 10 || c.y == 18)
                        .map(move |c| MapCoordinate {
                            x: c.x + (i % 6) * 11,
                            y: c.y + (i / 6) * 11,
                        })
                })
                .collect(),
        ),
    ]
}

#[test]
fn modest_authoring_shapes_have_continuous_deterministic_water() {
    let map = map();
    let mut failures = vec![];
    for (name, cells) in cases() {
        let start = Instant::now();
        let (result, stats) = water_solver::solve_recorded(&map, &cells, &mut || false);
        println!(
            "{name}: {} cells, {:?}, {:?}, {stats:?}",
            cells.len(),
            start.elapsed(),
            result.as_ref().map(|v| v.len())
        );
        match result {
            Ok(output) => {
                assert!(stats.work < 200_000, "{name}: {stats:?}");
                assert_eq!(
                    stats.connectivity_rejections, 0,
                    "{name}: late connectivity rejection"
                );
                assert_joins(&map, &cells, &output);
                assert_eq!(
                    output,
                    water_solver::solve(&map, &cells, &mut || false).unwrap()
                );
            }
            Err(failure) => failures.push((name, failure)),
        }
    }
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn overlapping_strokes_can_extend_a_tapered_lake_without_changing_the_mask() {
    let map = map();
    let rows = [
        (3, 3),
        (2, 3),
        (1, 3),
        (0, 5),
        (0, 5),
        (0, 6),
        (0, 6),
        (0, 6),
        (2, 6),
        (3, 7),
        (4, 7),
        (5, 7),
    ];
    let cells: Vec<_> = rows
        .into_iter()
        .enumerate()
        .flat_map(|(y, (left, right))| {
            (left..=right).map(move |x| MapCoordinate {
                x: 20 + x,
                y: 20 + y as u8,
            })
        })
        .collect();
    let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
    assert_joins(&map, &cells, &output);
    assert_eq!(
        output,
        water_solver::solve(&map, &cells, &mut || false).unwrap()
    );
}
