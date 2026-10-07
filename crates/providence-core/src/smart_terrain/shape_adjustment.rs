//! Boundary relaxation uses the original mask as a fixed distance and topology anchor.
use super::*;
use std::collections::VecDeque;

pub(super) fn candidates(
    original: &[MapCoordinate],
    editable: &[bool],
    tolerance: u8,
    canceled: &mut impl FnMut() -> bool,
) -> Vec<Vec<MapCoordinate>> {
    let mut current = vec![false; 8100];
    for cell in original {
        current[index(*cell)] = true;
    }
    let source = current.clone();
    let outside = exterior_background(&source);
    let distances = boundary_distances(&source);
    let mut candidates = vec![original.to_vec()];
    // Tolerance bounds distance, not the number of relaxation passes. Let a local
    // contour settle without granting it additional space on subsequent passes.
    for pass in 1..=if tolerance == 0 { 0 } else { 6 } {
        let mut changed = false;
        for i in 0..8100 {
            if canceled() {
                return vec![original.to_vec()];
            }
            let narrow = protected_narrow(&source, i);
            let beside_hole = ring(i)
                .iter()
                .flatten()
                .any(|j| !source[*j] && !outside[*j]);
            if !editable[i]
                || distances[i] > pass.min(tolerance)
                || narrow
                || beside_hole
                || !source[i] && !outside[i]
            {
                continue;
            }
            let count = ring(i)
                .into_iter()
                .flatten()
                .filter(|j| current[*j])
                .count();
            let next = if count >= 5 {
                true
            } else if count <= 3 {
                false
            } else {
                continue;
            };
            if current[i] == next || !simple_point(&current, i) {
                continue;
            }
            current[i] = next;
            changed = true;
        }
        if !changed {
            break;
        }
        candidates.push(cells(&current));
    }
    candidates
}

fn protected_narrow(source: &[bool], i: usize) -> bool {
    if broad(source, i, source[i]) {
        return false;
    }
    let neighbors = cardinal(i);
    if !source[i] {
        return neighbors.iter().flatten().filter(|j| !source[**j]).count() >= 2;
    }
    // Preserve lines and connecting necks, but let smoothing trim a dangling
    // one-cell lake tip. A standalone stream has no adjacent broad water.
    neighbors.iter().flatten().filter(|j| source[**j]).count() >= 2
        || !ring(i)
            .iter()
            .flatten()
            .any(|j| source[*j] && broad(source, *j, true))
}

fn exterior_background(mask: &[bool]) -> Vec<bool> {
    let mut outside = vec![false; 8100];
    let mut queue = VecDeque::new();
    for i in 0..8100 {
        if !mask[i] && (!(90..8010).contains(&i) || i % 90 == 0 || i % 90 == 89) {
            outside[i] = true;
            queue.push_back(i);
        }
    }
    while let Some(i) = queue.pop_front() {
        for j in ring(i).into_iter().flatten() {
            if !mask[j] && !outside[j] {
                outside[j] = true;
                queue.push_back(j);
            }
        }
    }
    outside
}

pub(super) fn boundary_distances(mask: &[bool]) -> Vec<u8> {
    let mut distance = vec![u8::MAX; 8100];
    let mut queue = VecDeque::new();
    for i in 0..8100 {
        if cardinal(i)
            .iter()
            .any(|j| j.is_none_or(|j| mask[j] != mask[i]))
        {
            distance[i] = 1;
            queue.push_back(i);
        }
    }
    while let Some(i) = queue.pop_front() {
        if distance[i] >= 3 {
            continue;
        }
        for j in cardinal(i).into_iter().flatten() {
            if distance[j] > distance[i] + 1 {
                distance[j] = distance[i] + 1;
                queue.push_back(j);
            }
        }
    }
    distance
}

pub(super) fn preserves_topology(original: &[bool], proposed: &[bool]) -> bool {
    let outside = exterior_background(original);
    let mut current = original.to_vec();
    let mut pending: Vec<_> = (0..8100).filter(|&i| current[i] != proposed[i]).collect();
    if pending
        .iter()
        .any(|&i| protected_narrow(original, i) || !original[i] && !outside[i])
    {
        return false;
    }
    while !pending.is_empty() {
        let before = pending.len();
        pending.retain(|&i| {
            if !simple_point(&current, i) {
                return true;
            }
            current[i] = proposed[i];
            false
        });
        if pending.len() == before {
            return false;
        }
    }
    true
}

pub(super) fn broad(mask: &[bool], i: usize, value: bool) -> bool {
    let x = (i % 90) as i16;
    let y = (i / 90) as i16;
    [-1, 0].into_iter().any(|dx| {
        [-1, 0].into_iter().any(|dy| {
            (0..2).all(|ox| {
                (0..2).all(|oy| at(x + dx + ox, y + dy + oy).is_some_and(|j| mask[j] == value))
            })
        })
    })
}

// Four-connected foreground and eight-connected background are a complementary
// digital topology. Requiring one component of each prevents merges and new holes.
fn simple_point(mask: &[bool], i: usize) -> bool {
    let neighbors = ring(i);
    component_count(mask, &neighbors, true, false) == 1
        && component_count(mask, &neighbors, false, true) == 1
}

fn component_count(mask: &[bool], ring: &[Option<usize>; 8], value: bool, diagonal: bool) -> usize {
    let mut remaining: BTreeSet<_> = ring
        .iter()
        .flatten()
        .copied()
        .filter(|j| mask[*j] == value)
        .collect();
    let mut count = 0;
    while let Some(first) = remaining.pop_first() {
        count += 1;
        let mut queue = vec![first];
        while let Some(i) = queue.pop() {
            let linked: Vec<_> = remaining
                .iter()
                .copied()
                .filter(|j| {
                    let dx = (i % 90).abs_diff(*j % 90);
                    let dy = (i / 90).abs_diff(*j / 90);
                    if diagonal {
                        dx.max(dy) == 1
                    } else {
                        dx + dy == 1
                    }
                })
                .collect();
            for j in linked {
                remaining.remove(&j);
                queue.push(j);
            }
        }
    }
    count
}

fn at(x: i16, y: i16) -> Option<usize> {
    ((0..90).contains(&x) && (0..90).contains(&y)).then_some((y * 90 + x) as usize)
}
fn index(cell: MapCoordinate) -> usize {
    usize::from(cell.y) * 90 + usize::from(cell.x)
}
fn cardinal(i: usize) -> [Option<usize>; 4] {
    let x = (i % 90) as i16;
    let y = (i / 90) as i16;
    [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)]
}
fn ring(i: usize) -> [Option<usize>; 8] {
    let x = (i % 90) as i16;
    let y = (i / 90) as i16;
    [
        at(x - 1, y - 1),
        at(x, y - 1),
        at(x + 1, y - 1),
        at(x + 1, y),
        at(x + 1, y + 1),
        at(x, y + 1),
        at(x - 1, y + 1),
        at(x - 1, y),
    ]
}
fn cells(mask: &[bool]) -> Vec<MapCoordinate> {
    mask.iter()
        .enumerate()
        .filter(|(_, value)| **value)
        .map(|(i, _)| MapCoordinate {
            x: (i % 90) as u8,
            y: (i / 90) as u8,
        })
        .collect()
}

pub(super) fn contour_cost(mask: &[MapCoordinate]) -> usize {
    let mut occupied = vec![false; 8100];
    for cell in mask {
        occupied[index(*cell)] = true;
    }
    mask.iter()
        .map(|cell| {
            ring(index(*cell))
                .iter()
                .enumerate()
                .filter(|(_, j)| j.is_none_or(|j| !occupied[j]))
                .map(|(direction, _)| if direction % 2 == 0 { 2 } else { 3 })
                .sum::<usize>()
        })
        .sum()
}
