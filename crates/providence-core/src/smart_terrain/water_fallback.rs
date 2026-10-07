//! Bounded best-fit output when the exact atlas constraints cannot all be met.
use super::water_geometry::{PIECES, fixed_edge};
use super::water_solver::Failure;
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel},
};

const DIRECTIONS: [(i16, i16); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];

pub(super) fn seam_warnings(
    map: &MapLevel,
    cells: &[MapCoordinate],
    tiles: &[i16],
) -> Vec<MapCoordinate> {
    let mut rendered = map.tiles.clone();
    for (cell, tile) in cells.iter().zip(tiles) {
        rendered[offset(*cell)] = *tile;
    }
    cells
        .iter()
        .copied()
        .filter(|cell| {
            (0..4).any(|d| {
                neighbor(*cell, d).is_some_and(|other| {
                    fixed_edge(normalized(rendered[offset(*cell)]), d)
                        != fixed_edge(normalized(rendered[other]), (d + 2) % 4)
                })
            })
        })
        .collect()
}

pub(super) fn solve(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<(Vec<i16>, Vec<MapCoordinate>), Failure> {
    let regions = super::water_regions::partition(
        cells,
        &mut super::water_budget::Budget::new(cells.len()),
        canceled,
    )?;
    if regions.len() > 1 {
        return solve_components(map, cells, regions, canceled);
    }
    approximate(map, cells, canceled)
}

// An isolated unmatchable stroke must not downgrade a separate solvable lake.
fn solve_components(
    map: &MapLevel,
    cells: &[MapCoordinate],
    regions: Vec<Vec<usize>>,
    canceled: &mut impl FnMut() -> bool,
) -> Result<(Vec<i16>, Vec<MapCoordinate>), Failure> {
    let mut tiles = vec![0; cells.len()];
    let mut warnings = vec![];
    for region in regions {
        let selected: Vec<_> = region.iter().map(|&i| cells[i]).collect();
        let exact = if super::water_contour::fills_existing_stream(map, &selected, &selected) {
            super::water_solver::solve_filled(map, &selected, canceled)
        } else {
            super::water_solver::solve(map, &selected, canceled)
        };
        let output = match exact {
            Ok(output) => output,
            Err(Failure::Canceled) => return Err(Failure::Canceled),
            Err(_) => {
                let (output, unresolved) = approximate(map, &selected, canceled)?;
                warnings.extend(unresolved);
                output
            }
        };
        for (i, tile) in region.into_iter().zip(output) {
            tiles[i] = tile;
        }
    }
    Ok((tiles, warnings))
}

fn approximate(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<(Vec<i16>, Vec<MapCoordinate>), Failure> {
    let mut positions = vec![usize::MAX; 8100];
    for (i, cell) in cells.iter().enumerate() {
        positions[offset(*cell)] = i;
    }
    let gradients: Vec<_> = cells
        .iter()
        .map(|cell| super::water_contour::gradient(map, &positions, *cell))
        .collect();
    let mut rendered = map.tiles.clone();
    for (i, cell) in cells.iter().enumerate() {
        if canceled() {
            return Err(Failure::Canceled);
        }
        rendered[offset(*cell)] = best(&rendered, &positions, *cell, gradients[i], false);
    }
    // A fixed pass count bounds work independently of exact-search branching.
    for _ in 0..6 {
        let mut changed = false;
        for (i, cell) in cells.iter().enumerate() {
            if canceled() {
                return Err(Failure::Canceled);
            }
            let tile = best(&rendered, &positions, *cell, gradients[i], true);
            changed |= rendered[offset(*cell)] != tile;
            rendered[offset(*cell)] = tile;
        }
        if !changed {
            break;
        }
    }
    let warnings = cells
        .iter()
        .copied()
        .filter(|cell| {
            let tile = rendered[offset(*cell)];
            (0..4).any(|d| {
                neighbor(*cell, d).is_some_and(|other| {
                    let edge = fixed_edge(tile, d);
                    let other_edge = fixed_edge(normalized(rendered[other]), (d + 2) % 4);
                    edge != other_edge || positions[other] != usize::MAX && edge == 0
                })
            })
        })
        .collect();
    Ok((
        cells.iter().map(|cell| rendered[offset(*cell)]).collect(),
        warnings,
    ))
}

fn offset(cell: MapCoordinate) -> usize {
    usize::from(cell.y) * 90 + usize::from(cell.x)
}

fn normalized(tile: i16) -> i16 {
    terrain_tile(tile).unwrap_or(0) as i16
}

fn neighbor(cell: MapCoordinate, d: usize) -> Option<usize> {
    let (dx, dy) = DIRECTIONS[d];
    let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
    ((0..90).contains(&x) && (0..90).contains(&y)).then_some(y as usize * 90 + x as usize)
}

fn best(
    rendered: &[i16],
    positions: &[usize],
    cell: MapCoordinate,
    gradient: (i32, i32),
    paired: bool,
) -> i16 {
    let broad = super::water_contour::broad(positions, cell);
    let boundary = broad
        && (0..4).any(|d| neighbor(cell, d).is_some_and(|other| positions[other] == usize::MAX));
    PIECES
        .iter()
        .enumerate()
        .filter(|(_, piece)| !broad || !(38..=51).contains(&piece.tile))
        .min_by_key(|(index, piece)| {
            let mut cost = 0;
            let mut boundary_cost = 0;
            for (d, &edge) in piece.edges.iter().enumerate() {
                let Some(other) = neighbor(cell, d) else {
                    continue;
                };
                if positions[other] == usize::MAX {
                    boundary_cost +=
                        (edge ^ fixed_edge(normalized(rendered[other]), (d + 2) % 4)).count_ones();
                } else {
                    cost += if edge == 0 { 8 } else { 0 };
                    if broad {
                        cost += 3 * (edge ^ 15).count_ones();
                    }
                    if paired {
                        cost += 3
                            * (edge ^ fixed_edge(normalized(rendered[other]), (d + 2) % 4))
                                .count_ones();
                    }
                }
            }
            // Once fixed exterior edges agree, prefer the bank direction over
            // extra water coverage. Coverage alone rewards repeated sawteeth.
            let contour = if boundary {
                24 * (1_000_000 - super::water_contour::alignment(*index, gradient))
            } else {
                0
            };
            (
                boundary_cost,
                if boundary && gradient.0.abs() + gradient.1.abs() == 1 {
                    contour
                } else {
                    0
                },
                i64::from(cost) * 1_000_000 + contour,
                16 - piece.area,
                piece.tile,
            )
        })
        .expect("reviewed water pieces")
        .1
        .tile
}
