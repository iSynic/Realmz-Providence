use super::{topology, water_geometry};
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel},
};
use std::collections::BTreeSet;

/// Existing joining tiles may change phase, but ground and decorative neighbors stay fixed.
pub(super) fn include_neighbors(map: &MapLevel, selected: &[MapCoordinate]) -> Vec<MapCoordinate> {
    let mut cells: BTreeSet<_> = selected.iter().map(|cell| (cell.y, cell.x)).collect();
    let mut frontier = selected.to_vec();
    for _ in 0..2 {
        let mut next = vec![];
        for cell in frontier {
            for (x, y) in topology::neighbors(cell) {
                if !(0..90).contains(&x) || !(0..90).contains(&y) {
                    continue;
                }
                let (x, y) = (x as u8, y as u8);
                let raw = map.tiles[usize::from(y) * 90 + usize::from(x)];
                if terrain_tile(raw)
                    .and_then(|tile| water_geometry::index(tile as i16))
                    .is_none()
                {
                    continue;
                }
                if cells.insert((y, x)) {
                    next.push(MapCoordinate { x, y });
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
