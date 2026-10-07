use super::*;

// Reconstructed from the owner's 2026-10-06 mask screenshot, not recovered project data.
pub(super) fn tapered_mask() -> Vec<MapCoordinate> {
    [
        (12, 13),
        (11, 13),
        (11, 12),
        (9, 12),
        (8, 12),
        (6, 12),
        (5, 11),
        (3, 10),
        (2, 9),
        (1, 9),
        (1, 9),
        (0, 8),
        (0, 7),
        (0, 5),
        (0, 4),
    ]
    .into_iter()
    .enumerate()
    .flat_map(|(y, (left, right))| {
        (left..=right).map(move |x| MapCoordinate {
            x: 20 + x,
            y: 20 + y as u8,
        })
    })
    .collect()
}

#[test]
fn a_filled_taper_does_not_turn_into_boundary_streams() {
    for crossing in [false, true] {
        let mut map = water_tests::map();
        if crossing {
            crossing_stream(&mut map);
        }
        let mut snapshot = ProjectSnapshot::new_authored(StableId("fill".into()));
        snapshot.world.maps.push(map);
        for tolerance in [
            ShapeTolerance::Literal,
            ShapeTolerance::Gentle,
            ShapeTolerance::Balanced,
            ShapeTolerance::Strong,
        ] {
            let intent = SmartTerrainIntent {
                tileset_id: StableId("classic.landlook.0".into()),
                preset: "water".into(),
                mask: tapered_mask(),
                atlas_blob: None,
                mapping_revision: 0,
                tolerance,
            };
            let plan = preview(&snapshot, &StableId("land:0".into()), &intent).unwrap();
            if crossing && tolerance == ShapeTolerance::Balanced {
                assert!(plan.unresolved.is_empty(), "mouths: {:?}", plan.unresolved);
            }
            let mut rendered = snapshot.world.maps[0].tiles.clone();
            for cell in &plan.paint.painted_cells {
                rendered[cell.y as usize * 90 + cell.x as usize] = cell.tile;
            }
            assert!(
                intent
                    .mask
                    .iter()
                    .all(|cell| !(38..=51)
                        .contains(&rendered[cell.y as usize * 90 + cell.x as usize])),
                "{crossing}, {tolerance:?}"
            );
            assert_eq!(
                plan.paint,
                preview(&snapshot, &StableId("land:0".into()), &intent)
                    .unwrap()
                    .paint
            );
        }
    }
}
pub(super) fn crossing_stream(map: &mut MapLevel) {
    let mut path = BTreeSet::from([(15, 26)]);
    let mut y = 26;
    for x in 16..39 {
        path.insert((x, y));
        if x % 2 == 0 {
            y += 1;
            path.insert((x, y));
        }
    }
    for &(x, y) in &path {
        let ports = [(0, -1, 1), (1, 0, 2), (0, 1, 4), (-1, 0, 8)]
            .into_iter()
            .filter(|(dx, dy, _)| path.contains(&(x + dx, y + dy)))
            .map(|(_, _, port)| port)
            .sum();
        let tile = match ports {
            1 => 40,
            2 => 41,
            4 => 42,
            8 => 43,
            5 => 38,
            10 => 39,
            6 => 48,
            12 => 49,
            3 => 50,
            9 => 51,
            _ => panic!("stream fixture"),
        };
        map.tiles[y as usize * 90 + x as usize] = tile;
    }
}

#[test]
fn approximate_lakes_keep_straight_banks_in_all_four_directions() {
    let map = water_tests::map();
    let cells = water_tests::rectangle(14, 10);
    let (tiles, warnings) = water_fallback::solve(&map, &cells, &mut || false).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    let mut rendered = map.tiles.clone();
    for (cell, tile) in cells.iter().zip(tiles) {
        rendered[cell.y as usize * 90 + cell.x as usize] = tile;
    }
    for x in 12..22 {
        assert_eq!(rendered[10 * 90 + x], 3, "north shore at {x}");
        assert_eq!(rendered[19 * 90 + x], 4, "south shore at {x}");
    }
    for y in 12..18 {
        assert_eq!(rendered[y * 90 + 10], 1, "west shore at {y}");
        assert_eq!(rendered[y * 90 + 23], 2, "east shore at {y}");
    }
}
