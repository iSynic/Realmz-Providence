use super::{coordinate, index};
use crate::model::{CLASSIC_MAP_SIZE, MapCoordinate};
use std::collections::{BTreeSet, VecDeque};

pub(super) fn fill(cells: &[MapCoordinate]) -> Vec<MapCoordinate> {
    let mut selected: BTreeSet<_> = cells.iter().map(index).collect();
    selected.extend(enclosed(&selected));
    selected.into_iter().map(coordinate).collect()
}

pub(super) fn close_added_outline(selected: &mut BTreeSet<usize>, current: &[MapCoordinate]) {
    // Add may close an outline over several strokes; existing holes retain the
    // author's subtraction instead of being refilled by an unrelated addition.
    let old: BTreeSet<_> = current.iter().map(index).collect();
    let existing_holes = enclosed(&old);
    selected.extend(enclosed(selected).difference(&existing_holes).copied());
}

fn enclosed(selected: &BTreeSet<usize>) -> BTreeSet<usize> {
    const COUNT: usize = CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE;
    let mut blocked = [false; COUNT];
    let mut outside = [false; COUNT];
    for &cell in selected {
        blocked[cell] = true;
    }
    let mut queue = VecDeque::new();
    for cell in 0..COUNT {
        let (x, y) = (cell % CLASSIC_MAP_SIZE, cell / CLASSIC_MAP_SIZE);
        if !blocked[cell]
            && (x == 0 || y == 0 || x + 1 == CLASSIC_MAP_SIZE || y + 1 == CLASSIC_MAP_SIZE)
        {
            outside[cell] = true;
            queue.push_back(cell);
        }
    }
    while let Some(cell) = queue.pop_front() {
        let (x, y) = (
            (cell % CLASSIC_MAP_SIZE) as i16,
            (cell / CLASSIC_MAP_SIZE) as i16,
        );
        for (dx, dy) in [(0, -1), (1, 0), (0, 1), (-1, 0)] {
            let (nx, ny) = (x + dx, y + dy);
            if !(0..CLASSIC_MAP_SIZE as i16).contains(&nx)
                || !(0..CLASSIC_MAP_SIZE as i16).contains(&ny)
            {
                continue;
            }
            let neighbor = ny as usize * CLASSIC_MAP_SIZE + nx as usize;
            if !blocked[neighbor] && !outside[neighbor] {
                outside[neighbor] = true;
                queue.push_back(neighbor);
            }
        }
    }
    (0..COUNT)
        .filter(|cell| !blocked[*cell] && !outside[*cell])
        .collect()
}
