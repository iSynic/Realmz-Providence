use super::water_tests::{assert_joins, map};
use super::*;

fn tapered_mask() -> Vec<MapCoordinate> {
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
    rows.into_iter()
        .enumerate()
        .flat_map(|(y, (left, right))| {
            (left..=right).map(move |x| MapCoordinate {
                x: 20 + x,
                y: 20 + y as u8,
            })
        })
        .collect()
}

fn masks() -> Vec<(&'static str, Vec<MapCoordinate>)> {
    let rectangle = |width, height, include: fn(u8, u8) -> bool| {
        (0..height)
            .flat_map(|y| {
                (0..width).filter_map(move |x| {
                    include(x, y).then_some(MapCoordinate {
                        x: 20 + x,
                        y: 20 + y,
                    })
                })
            })
            .collect()
    };
    vec![
        ("overlapping-taper", tapered_mask()),
        ("acute-slope", rectangle(24, 12, |x, y| x >= 2 * y)),
        (
            "ragged-shore",
            rectangle(18, 16, |x, y| {
                x >= u8::from(y % 3 == 0) && x < 18 - u8::from(y % 3 == 1)
            }),
        ),
        (
            "rounded-lake",
            rectangle(19, 15, |x, y| {
                let (x, y) = (i32::from(x) - 9, i32::from(y) - 7);
                x * x * 49 + y * y * 81 <= 3969
            }),
        ),
        (
            "notched-lake",
            rectangle(18, 14, |x, y| x < 7 || !(6..11).contains(&y)),
        ),
        (
            "narrow-connection",
            rectangle(22, 10, |x, y| !(8..14).contains(&x) || y == 5),
        ),
    ]
}

fn transform(cells: &[MapCoordinate], orientation: u8) -> Vec<MapCoordinate> {
    let mut transformed: Vec<_> = cells
        .iter()
        .map(|c| {
            let (x, y) = (c.x - 20, c.y - 20);
            let (x, y) = if orientation & 1 == 0 { (x, y) } else { (y, x) };
            MapCoordinate {
                x: 20 + if orientation & 2 == 0 { x } else { 24 - x },
                y: 20 + if orientation & 4 == 0 { y } else { 24 - y },
            }
        })
        .collect();
    transformed.sort_by_key(|c| (c.y, c.x));
    transformed
}

#[test]
fn irregular_lakes_resolve_in_every_orientation_and_at_every_tolerance() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("irregular-water".into()));
    let map = map();
    let identity = map.identity.clone();
    snapshot.world.maps.push(map.clone());
    let mut failures = vec![];
    for (name, source) in masks() {
        for orientation in 0..8 {
            let mask = transform(&source, orientation);
            for tolerance in [
                ShapeTolerance::Literal,
                ShapeTolerance::Gentle,
                ShapeTolerance::Balanced,
                ShapeTolerance::Strong,
            ] {
                let intent = SmartTerrainIntent {
                    tileset_id: StableId("classic.landlook.0".into()),
                    preset: "water".into(),
                    mask: mask.clone(),
                    atlas_blob: None,
                    mapping_revision: 0,
                    tolerance,
                };
                let plan = preview(&snapshot, &identity, &intent).unwrap();
                if !plan.unresolved.is_empty() {
                    failures.push((name, orientation, tolerance, plan.unresolved_reason));
                    continue;
                }
                assert_eq!(plan.mask, mask, "Smoothing changed the original selection");
                if tolerance == ShapeTolerance::Literal {
                    assert_eq!(plan.effective_mask, mask);
                }
                let cells: Vec<_> = plan
                    .paint
                    .painted_cells
                    .iter()
                    .map(|c| MapCoordinate { x: c.x, y: c.y })
                    .collect();
                let tiles: Vec<_> = plan.paint.painted_cells.iter().map(|c| c.tile).collect();
                assert_joins(&map, &cells, &tiles);
                let again = preview(&snapshot, &identity, &intent).unwrap();
                assert_eq!(plan.paint, again.paint);
                assert_eq!(plan.effective_mask, again.effective_mask);
            }
        }
    }
    assert!(failures.is_empty(), "{failures:?}");
}
