use super::{water_budget::Budget, water_solver::Failure};
use crate::model::MapCoordinate;

pub(super) fn partition(
    cells: &[MapCoordinate],
    budget: &mut Budget,
    canceled: &mut impl FnMut() -> bool,
) -> Result<Vec<Vec<usize>>, Failure> {
    let mut positions = vec![usize::MAX; 8100];
    for (i, c) in cells.iter().enumerate() {
        positions[usize::from(c.y) * 90 + usize::from(c.x)] = i;
    }
    let mut seen = vec![false; cells.len()];
    let mut regions = vec![];
    for start in 0..cells.len() {
        if seen[start] {
            continue;
        }
        seen[start] = true;
        let mut region = vec![];
        let mut stack = vec![start];
        while let Some(i) = stack.pop() {
            if canceled() {
                return Err(Failure::Canceled);
            }
            budget.charge(4)?;
            region.push(i);
            for (dx, dy) in [(0, -1), (1, 0), (0, 1), (-1, 0)] {
                let (x, y) = (i16::from(cells[i].x) + dx, i16::from(cells[i].y) + dy);
                if !(0..90).contains(&x) || !(0..90).contains(&y) {
                    continue;
                }
                let other = positions[y as usize * 90 + x as usize];
                if other != usize::MAX && !seen[other] {
                    seen[other] = true;
                    stack.push(other);
                }
            }
        }
        region.sort_unstable();
        regions.push(region);
    }
    Ok(regions)
}
