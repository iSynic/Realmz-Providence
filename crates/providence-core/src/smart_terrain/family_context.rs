use super::*;

/// Reconsider nearby joining pieces together, without claiming decorative family tiles.
pub(super) fn include_neighbors(
    map: &MapLevel,
    profile: &Profile,
    selected: &[MapCoordinate],
) -> Vec<MapCoordinate> {
    let joining: BTreeSet<_> = profile
        .center
        .iter()
        .chain(profile.roles.values().flatten())
        .chain(profile.water_roles.values().flatten())
        .chain(profile.masks.values().flatten())
        .copied()
        .collect();
    let mut cells: BTreeSet<_> = selected.iter().map(|cell| (cell.y, cell.x)).collect();
    let mut frontier = selected.to_vec();
    for _ in 0..2 {
        let mut next = vec![];
        for cell in frontier {
            for dy in -1..=1i16 {
                for dx in -1..=1i16 {
                    let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
                    if !(0..90).contains(&x) || !(0..90).contains(&y) {
                        continue;
                    }
                    let raw = map.tiles[y as usize * 90 + x as usize];
                    if map_paint::terrain_tile(raw)
                        .is_some_and(|tile| joining.contains(&(tile as i16)))
                        && cells.insert((y as u8, x as u8))
                    {
                        next.push(MapCoordinate {
                            x: x as u8,
                            y: y as u8,
                        });
                    }
                }
            }
        }
        frontier = next;
    }
    cells
        .into_iter()
        .map(|(y, x)| MapCoordinate { x, y })
        .collect()
}
