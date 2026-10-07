//! Preserve a lake's silhouette when fixed stream ports make a perfect join impossible.
use super::*;
use water_solver::Failure;

pub(super) fn resolve(
    map: &MapLevel,
    mask: &[MapCoordinate],
    context: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<(Vec<i16>, Vec<MapCoordinate>), Failure> {
    let selected: BTreeSet<_> = mask.iter().map(|c| offset(*c)).collect();
    let lake: Vec<_> = context
        .iter()
        .copied()
        .filter(|c| selected.contains(&offset(*c)) || !stream(map.tiles[offset(*c)]))
        .collect();
    let mut ground = map.clone();
    for tile in &mut ground.tiles {
        if stream(*tile) {
            *tile = 0;
        }
    }
    // This temporary boundary is only a shape guide. Original streams remain in
    // the returned context; any imperfect lake/stream seam remains a warning.
    let shape = match water_solver::solve_filled(&ground, &lake, canceled) {
        Ok(shape) => shape,
        Err(Failure::Canceled) => return Err(Failure::Canceled),
        Err(_) => water_fallback::solve(&ground, &lake, canceled)?.0,
    };
    let mut rendered = map.tiles.clone();
    for (cell, tile) in lake.iter().zip(shape) {
        rendered[offset(*cell)] = tile;
    }
    let mut tiles: Vec<_> = context
        .iter()
        .map(|c| map_paint::terrain_tile(rendered[offset(*c)]).unwrap_or(0) as i16)
        .collect();
    let mut positions = vec![usize::MAX; 8100];
    for (i, cell) in context.iter().enumerate() {
        positions[offset(*cell)] = i;
    }
    let gradients: Vec<_> = context
        .iter()
        .map(|c| water_contour::gradient(map, &positions, *c))
        .collect();
    water_refinement::refine(map, context, &mut tiles, &gradients, canceled)?;
    let warnings = water_fallback::seam_warnings(map, context, &tiles);
    Ok((tiles, warnings))
}

fn offset(cell: MapCoordinate) -> usize {
    cell.y as usize * 90 + cell.x as usize
}

fn stream(tile: i16) -> bool {
    map_paint::terrain_tile(tile).is_some_and(|tile| (38..=51).contains(&tile))
}
