use super::{
    water_geometry::{PIECES, fixed_edge},
    water_solver,
};
use crate::model::{MapCoordinate, MapLevel};
use std::collections::BTreeSet;

fn reverse(edge: u8) -> u8 {
    ((edge & 1) << 3) | ((edge & 2) << 1) | ((edge & 4) >> 1) | ((edge & 8) >> 3)
}

fn transform_tile(tile: i16, mirror: bool, rotations: usize) -> i16 {
    let Some(piece) = PIECES.iter().find(|piece| piece.tile == tile) else {
        return tile;
    };
    let mut edges = piece.edges;
    if mirror {
        edges = [reverse(edges[0]), edges[3], reverse(edges[2]), edges[1]];
    }
    for _ in 0..rotations {
        edges = [reverse(edges[3]), edges[0], reverse(edges[1]), edges[2]];
    }
    PIECES
        .iter()
        .find(|piece| piece.edges == edges)
        .expect("symmetric reviewed shoreline")
        .tile
}

fn position(mut x: u8, mut y: u8, mirror: bool, rotations: usize) -> MapCoordinate {
    if mirror {
        x = 89 - x;
    }
    for _ in 0..rotations {
        (x, y) = (89 - y, x);
    }
    MapCoordinate { x, y }
}

fn transformed(map: &MapLevel, mirror: bool, rotations: usize) -> MapLevel {
    let mut result = map.clone();
    for y in 0..90 {
        for x in 0..90 {
            let p = position(x, y, mirror, rotations);
            result.tiles[usize::from(p.y) * 90 + usize::from(p.x)] = transform_tile(
                map.tiles[usize::from(y) * 90 + usize::from(x)],
                mirror,
                rotations,
            );
        }
    }
    result
}

pub(super) fn verify_runs(map: &MapLevel, cells: &[MapCoordinate]) {
    let mut phases = BTreeSet::new();
    for mirror in [false, true] {
        for rotations in 0..4 {
            let map = transformed(map, mirror, rotations);
            let cells: Vec<_> = cells
                .iter()
                .map(|p| position(p.x, p.y, mirror, rotations))
                .collect();
            let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
            let expected: Vec<_> = [6, 5]
                .repeat(12)
                .into_iter()
                .map(|tile| transform_tile(tile, mirror, rotations))
                .collect();
            assert_eq!(output, expected, "mirror {mirror}, rotations {rotations}");
            phases.extend(output);
        }
    }
    assert_eq!(phases, (5..=20).collect());
}

pub(super) fn verify_mouths(map: &MapLevel) {
    let mut original = map.clone();
    original.tiles.fill(156);
    let cells: Vec<_> = (20..26)
        .flat_map(|y| (20..26).map(move |x| MapCoordinate { x, y }))
        .chain((26..32).map(|y| MapCoordinate { x: 22, y }))
        .collect();
    let mut mouths = BTreeSet::new();
    for rotations in 0..4 {
        let map = transformed(&original, false, rotations);
        let cells: Vec<_> = cells
            .iter()
            .map(|p| position(p.x, p.y, false, rotations))
            .collect();
        let output = water_solver::solve(&map, &cells, &mut || false).unwrap();
        mouths.extend(
            output
                .iter()
                .filter(|tile| (21..=24).contains(*tile))
                .copied(),
        );
        let mut rendered = map;
        for (p, tile) in cells.iter().zip(&output) {
            rendered.tiles[usize::from(p.y) * 90 + usize::from(p.x)] = *tile;
        }
        for p in &cells {
            for (d, (dx, dy)) in [(0, -1), (1, 0), (0, 1), (-1, 0)].into_iter().enumerate() {
                let tile = rendered.tiles[usize::from(p.y) * 90 + usize::from(p.x)];
                let other = rendered.tiles
                    [(i16::from(p.y) + dy) as usize * 90 + (i16::from(p.x) + dx) as usize];
                assert_eq!(fixed_edge(tile, d), fixed_edge(other, (d + 2) % 4));
            }
        }
    }
    assert_eq!(mouths, (21..=24).collect());
}
