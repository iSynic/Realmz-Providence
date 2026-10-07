use super::*;
use water_geometry::{PIECES, fixed_edge, index};

// TiSL Data LD land 0, stream around (49,18); provenance in stream-lake-joins.md.
fn source() -> MapLevel {
    let mut map = water_tests::map();
    map.runtime.as_mut().unwrap().landlook = Some(0);
    let rows: &[(usize, &[i16])] = &[
        (43, &[48, 51]),
        (43, &[38]),
        (43, &[50, 49]),
        (44, &[50, 49]),
        (44, &[48, 51]),
        (44, &[50, 49]),
        (45, &[50, 49]),
        (46, &[50, 49]),
        (47, &[50, 49]),
        (48, &[50, 49]),
        (48, &[48, 51]),
        (48, &[50, 39, 49]),
        (49, &[48, 51]),
        (49, &[130]),
        (48, &[48, 51]),
        (47, &[48, 51]),
        (46, &[48, 51]),
        (45, &[48, 51]),
        (44, &[48, 51]),
    ];
    for (y, (x, tiles)) in rows.iter().enumerate() {
        map.tiles[(y + 5) * 90 + x..(y + 5) * 90 + x + tiles.len()].copy_from_slice(tiles);
    }
    for x in 35..56 {
        if x != 49 {
            map.tiles[18 * 90 + x] = if x == 48 { 1132 } else { 132 };
        }
    }
    map
}

fn rotate(map: &mut MapLevel, mask: &mut [MapCoordinate]) {
    let before = map.tiles.clone();
    for (i, &tile) in before.iter().enumerate() {
        let rotated = match tile {
            130 => 131,
            131 => 130,
            _ => index(tile).map_or(tile, |p| {
                let e = PIECES[p].edges;
                PIECES
                    .iter()
                    .find(|q| q.edges == [e[3], e[0], e[1], e[2]])
                    .unwrap()
                    .tile
            }),
        };
        map.tiles[(i % 90) * 90 + 89 - i / 90] = rotated;
    }
    for c in mask {
        (c.x, c.y) = (89 - c.y, c.x);
    }
}

fn connected(tiles: &[i16], start: usize, goal: usize) -> bool {
    let mut seen = BTreeSet::from([start]);
    let mut pending = vec![start];
    while let Some(i) = pending.pop() {
        if i == goal {
            return true;
        }
        for d in 0..4 {
            let Some(j) = water_join_search::neighbor(i, d) else {
                continue;
            };
            let edge = fixed_edge(tiles[i], d);
            if edge != 0 && edge == fixed_edge(tiles[j], (d + 2) % 4) && seen.insert(j) {
                pending.push(j);
            }
        }
    }
    false
}

#[test]
fn lake_keeps_both_stream_arms_and_fixed_bridge_in_every_orientation() {
    for (x, y, w, h) in [
        (40, 10, 14, 6),
        (39, 10, 14, 6),
        (40, 9, 14, 7),
        (40, 11, 14, 6),
        (38, 9, 14, 8),
        (41, 11, 12, 6),
    ] {
        for turns in 0..4 {
            let mut map = source();
            let mut mask = (y..y + h)
                .flat_map(|y| (x..x + w).map(move |x| MapCoordinate { x, y }))
                .collect::<Vec<_>>();
            let mut anchors = [
                MapCoordinate { x: 43, y: 6 },
                MapCoordinate { x: 46, y: 21 },
            ]
            .to_vec();
            for _ in 0..turns {
                rotate(&mut map, &mut mask);
                for c in &mut anchors {
                    (c.x, c.y) = (89 - c.y, c.x);
                }
            }
            let after = assert_lake(map, mask, &anchors);
            for (cy, tile) in [
                (y + h - 1, [21, 22, 24, 23][turns]),
                (17, [38, 39, 38, 39][turns]),
            ] {
                let (mut cx, mut cy) = (49, cy);
                for _ in 0..turns {
                    (cx, cy) = (89 - cy, cx);
                }
                assert_eq!(
                    after[cy as usize * 90 + cx as usize],
                    tile,
                    "mouth above bridge, rotation {turns}"
                );
            }
        }
    }
}

fn assert_lake(map: MapLevel, mask: Vec<MapCoordinate>, anchors: &[MapCoordinate]) -> Vec<i16> {
    let before = map.tiles.clone();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("bridge".into()));
    snapshot.world.maps.push(map);
    let intent = SmartTerrainIntent {
        tileset_id: StableId("classic.landlook.0".into()),
        preset: "water".into(),
        mask,
        atlas_blob: None,
        mapping_revision: 0,
        tolerance: ShapeTolerance::Balanced,
    };
    let plan = preview(&snapshot, &StableId("land:0".into()), &intent).unwrap();
    let mut after = before.clone();
    for c in &plan.paint.painted_cells {
        after[c.y as usize * 90 + c.x as usize] = c.tile;
    }
    assert!(plan.unresolved.is_empty(), "{:?}", plan.unresolved);
    for (i, &tile) in before
        .iter()
        .enumerate()
        .filter(|(_, t)| **t >= 130 && **t != 156)
    {
        assert_eq!(after[i], tile, "fixed road or bridge changed");
    }
    let lake = intent
        .mask
        .iter()
        .map(|c| c.y as usize * 90 + c.x as usize)
        .find(|&i| after[i] == 60)
        .unwrap();
    assert!(
        !after.iter().any(|t| (40..=43).contains(t)),
        "new stream dead end"
    );
    for c in anchors {
        assert!(
            connected(&after, c.y as usize * 90 + c.x as usize, lake),
            "disconnected stream {c:?}"
        );
    }
    after
}

#[test]
fn bridges_carry_water_across_the_road_without_becoming_paint_candidates() {
    assert_eq!(
        std::array::from_fn::<_, 4, _>(|d| fixed_edge(130, d)),
        [6, 0, 6, 0]
    );
    assert_eq!(
        std::array::from_fn::<_, 4, _>(|d| fixed_edge(131, d)),
        [0, 6, 0, 6]
    );
    assert!(index(130).is_none() && index(131).is_none());
}
