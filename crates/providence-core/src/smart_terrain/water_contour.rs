use super::water_geometry::{PIECES, index};
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel},
};

/// A filled 2-by-2 patch is shoreline or open water, never a narrow stream.
pub(super) fn broad(positions: &[usize], cell: MapCoordinate) -> bool {
    [-1, 1].into_iter().any(|dx| {
        [-1, 1].into_iter().any(|dy| {
            [(dx, 0), (0, dy), (dx, dy)].into_iter().all(|(dx, dy)| {
                let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
                (0..90).contains(&x)
                    && (0..90).contains(&y)
                    && positions[y as usize * 90 + x as usize] != usize::MAX
            })
        })
    })
}

pub(super) fn fills_existing_stream(
    map: &MapLevel,
    mask: &[MapCoordinate],
    context: &[MapCoordinate],
) -> bool {
    let mut positions = vec![usize::MAX; 8100];
    for cell in mask {
        positions[cell.y as usize * 90 + cell.x as usize] = 0;
    }
    mask.iter().any(|cell| broad(&positions, *cell))
        && context.iter().any(|cell| {
            terrain_tile(map.tiles[cell.y as usize * 90 + cell.x as usize])
                .is_some_and(|tile| (38..=51).contains(&tile))
        })
}

pub(super) fn stream_intrusions(map: &MapLevel, plan: &super::SmartTerrainPlan) -> usize {
    let mut positions = vec![usize::MAX; 8100];
    let mut rendered = map.tiles.clone();
    for cell in &plan.mask {
        positions[cell.y as usize * 90 + cell.x as usize] = 0;
    }
    for cell in &plan.paint.painted_cells {
        rendered[cell.y as usize * 90 + cell.x as usize] = cell.tile;
    }
    plan.mask
        .iter()
        .filter(|cell| {
            broad(&positions, **cell)
                && terrain_tile(rendered[cell.y as usize * 90 + cell.x as usize])
                    .is_some_and(|tile| (38..=51).contains(&tile))
        })
        .count()
}

pub(super) fn gradient(map: &MapLevel, cells: &[usize], cell: MapCoordinate) -> (i32, i32) {
    if let Some(normal) = straight_boundary(map, cells, cell) {
        return normal;
    }
    let mut gradient = (0, 0);
    for dy in -3i16..=3 {
        for dx in -3i16..=3 {
            let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
            if !(0..90).contains(&x) || !(0..90).contains(&y) {
                continue;
            }
            let offset = y as usize * 90 + x as usize;
            let tile = terrain_tile(map.tiles[offset]).unwrap_or(0) as i16;
            if cells[offset] != usize::MAX
                || index(tile).is_some()
                || (33..=35).contains(&tile)
                || (56..=59).contains(&tile)
            {
                // Nearby occupancy determines the intended contour, including fixed water.
                let weight = i32::from((4 - dx.abs()) * (4 - dy.abs()));
                gradient.0 += i32::from(dx) * weight;
                gradient.1 += i32::from(dy) * weight;
            }
        }
    }
    gradient
}

fn straight_boundary(map: &MapLevel, cells: &[usize], cell: MapCoordinate) -> Option<(i32, i32)> {
    let inside = |dx: i16, dy: i16| {
        let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
        if !(0..90).contains(&x) || !(0..90).contains(&y) {
            return false;
        }
        let offset = y as usize * 90 + x as usize;
        let tile = terrain_tile(map.tiles[offset]).unwrap_or(0) as i16;
        cells[offset] != usize::MAX
            || index(tile).is_some()
            || (33..=35).contains(&tile)
            || (56..=59).contains(&tile)
    };
    for (nx, ny) in [(0i16, 1i16), (1, 0), (0, -1), (-1, 0)] {
        let (tx, ty) = (-ny, nx);
        if inside(tx, ty)
            && inside(-tx, -ty)
            && (-1..=1)
                .all(|t| !inside(-nx + t * tx, -ny + t * ty) && inside(nx + t * tx, ny + t * ty))
        {
            return Some((i32::from(nx), i32::from(ny)));
        }
    }
    None
}

pub(super) fn alignment(candidate: usize, gradient: (i32, i32)) -> i64 {
    let mut normal = (0i64, 0i64);
    for (direction, edge) in PIECES[candidate].edges.into_iter().enumerate() {
        for (bit, along) in [-3, -1, 1, 3].into_iter().enumerate() {
            if edge & (1 << bit) == 0 {
                continue;
            }
            let (x, y) = match direction {
                0 => (along, -4),
                1 => (4, along),
                2 => (along, 4),
                _ => (-4, along),
            };
            normal.0 += x;
            normal.1 += y;
        }
    }
    let length = normal.0 * normal.0 + normal.1 * normal.1;
    let gradient_length = i64::from(gradient.0).pow(2) + i64::from(gradient.1).pow(2);
    if length == 0 || gradient_length == 0 {
        return 0;
    }
    let dot = normal.0 * i64::from(gradient.0) + normal.1 * i64::from(gradient.1);
    dot.signum() * dot * dot * 1_000_000 / (length * gradient_length)
}
