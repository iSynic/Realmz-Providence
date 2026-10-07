use super::{
    water_contour,
    water_geometry::{PIECES, candidates, fixed_edge, index, matching_edge},
};
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel},
};

const DIRECTIONS: [(i16, i16); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

pub(super) fn refine(
    map: &MapLevel,
    cells: &[MapCoordinate],
    tiles: &mut [i16],
    gradients: &[(i32, i32)],
    canceled: &mut impl FnMut() -> bool,
) -> Result<(), super::water_solver::Failure> {
    let mut positions = vec![usize::MAX; 8100];
    let mut rendered = map.tiles.clone();
    for (i, cell) in cells.iter().enumerate() {
        positions[usize::from(cell.y) * 90 + usize::from(cell.x)] = i;
        rendered[usize::from(cell.y) * 90 + usize::from(cell.x)] = tiles[i];
    }
    for _ in 0..4 {
        let mut changed = false;
        for (i, cell) in cells.iter().enumerate() {
            if canceled() {
                return Err(super::water_solver::Failure::Canceled);
            }
            for direction in [1, 2] {
                let Some(offset) = neighbor(*cell, direction) else {
                    continue;
                };
                let other = positions[offset];
                if other == usize::MAX {
                    continue;
                }
                let (a, b) = best_pair(
                    map,
                    &rendered,
                    [*cell, cells[other]],
                    direction,
                    [gradients[i], gradients[other]],
                    [
                        water_contour::broad(&positions, *cell),
                        water_contour::broad(&positions, cells[other]),
                    ],
                );
                if (tiles[i], tiles[other]) == (a, b) {
                    continue;
                }
                tiles[i] = a;
                tiles[other] = b;
                rendered[usize::from(cell.y) * 90 + usize::from(cell.x)] = a;
                rendered[offset] = b;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    Ok(())
}

fn neighbor(cell: MapCoordinate, d: usize) -> Option<usize> {
    let (x, y) = (
        i16::from(cell.x) + DIRECTIONS[d].0,
        i16::from(cell.y) + DIRECTIONS[d].1,
    );
    ((0..90).contains(&x) && (0..90).contains(&y)).then_some(y as usize * 90 + x as usize)
}

fn domain(rendered: &[i16], cell: MapCoordinate, join: usize, broad: bool) -> u64 {
    let mut domain = PIECES
        .iter()
        .enumerate()
        .filter(|(_, p)| !broad || !(38..=51).contains(&p.tile))
        .fold(0, |mask, (i, _)| mask | (1 << i));
    for d in 0..4 {
        if d == join {
            continue;
        }
        if let Some(offset) = neighbor(cell, d) {
            let tile = terrain_tile(rendered[offset]).unwrap_or(0) as i16;
            domain &= matching_edge(d, fixed_edge(tile, (d + 2) % 4));
        }
    }
    domain
}

fn score(candidate: usize, original: i16, gradient: (i32, i32)) -> (u8, i64, u8, u8) {
    (
        u8::from(PIECES[candidate].tile <= 32 || PIECES[candidate].tile == 60),
        water_contour::alignment(candidate, gradient),
        PIECES[candidate].area,
        u8::from(PIECES[candidate].tile == original),
    )
}

fn best_pair(
    map: &MapLevel,
    rendered: &[i16],
    cells: [MapCoordinate; 2],
    d: usize,
    gradients: [(i32, i32); 2],
    broad: [bool; 2],
) -> (i16, i16) {
    let [a, b] = cells;
    let [ga, gb] = gradients;
    let (ia, ib) = (
        usize::from(a.y) * 90 + usize::from(a.x),
        usize::from(b.y) * 90 + usize::from(b.x),
    );
    let original_a = terrain_tile(map.tiles[ia]).unwrap_or(0) as i16;
    let original_b = terrain_tile(map.tiles[ib]).unwrap_or(0) as i16;
    let combine = |x, y| {
        let x = score(x, original_a, ga);
        let y = score(y, original_b, gb);
        (
            x.0 + y.0,
            x.1 + y.1,
            u16::from(x.2) + u16::from(y.2),
            x.3 + y.3,
        )
    };
    let mut best = (index(rendered[ia]).unwrap(), index(rendered[ib]).unwrap());
    let mut best_score = combine(best.0, best.1);
    let wet = PIECES[best.0].edges[d] != 0;
    let other_domain = domain(rendered, b, (d + 2) % 4, broad[1]);
    for x in candidates(domain(rendered, a, d, broad[0])) {
        if wet && PIECES[x].edges[d] == 0 {
            continue;
        }
        for y in candidates(other_domain & matching_edge((d + 2) % 4, PIECES[x].edges[d])) {
            let value = combine(x, y);
            if value > best_score {
                best = (x, y);
                best_score = value;
            }
        }
    }
    (PIECES[best.0].tile, PIECES[best.1].tile)
}
