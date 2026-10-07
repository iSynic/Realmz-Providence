//! Use the original tolerance band to repair stream mouths with exact local joins.
use super::*;
use water_geometry::{PIECES, fixed_edge, index};
use water_join_search::{ALL, GROUND, Patch, neighbor};

#[path = "water_mouth_smoothing.rs"]
mod smoothing;

pub(super) fn improve(
    target: shape_planning::Target<'_>,
    intent: &SmartTerrainIntent,
    ground: &[Option<i16>],
    plan: SmartTerrainPlan,
    canceled: &mut impl FnMut() -> bool,
) -> Result<SmartTerrainPlan, SessionError> {
    let mut draft = Draft::new(target.map, &plan);
    let mut joins = entrances(&draft.rendered, &plan.unresolved);
    joins.extend(crossings(target.map, &draft.original));
    if joins.is_empty() {
        return Ok(plan);
    }
    let before = disconnected(&draft.source, &draft.rendered, &draft.original, &joins);
    if before != 0 || !plan.unresolved.is_empty() {
        draft
            .connect(&joins, ground, intent.tolerance.cells(), canceled)
            .map_err(|_| planning::canceled_error(target.identity))?;
    }
    let connected_more =
        disconnected(&draft.source, &draft.rendered, &draft.original, &joins) < before;
    let smoother = draft
        .smooth(&joins, ground, intent.tolerance.cells(), canceled)
        .map_err(|_| planning::canceled_error(target.identity))?;
    finish(target, intent, plan, draft, connected_more || smoother)
}

struct Draft {
    source: Vec<i16>,
    rendered: Vec<i16>,
    original: Vec<bool>,
    distances: Vec<u8>,
    effective: Vec<bool>,
    touched: BTreeSet<usize>,
}

impl Draft {
    fn new(map: &MapLevel, plan: &SmartTerrainPlan) -> Self {
        let mut rendered: Vec<_> = map.tiles.iter().map(|&t| normalized(t)).collect();
        for cell in &plan.paint.painted_cells {
            rendered[offset(cell.x, cell.y)] = normalized(cell.tile);
        }
        let original = occupied(&plan.mask);
        Self {
            source: map.tiles.iter().map(|&t| normalized(t)).collect(),
            rendered,
            distances: shape_adjustment::boundary_distances(&original),
            original,
            effective: occupied(&plan.effective_mask),
            touched: plan
                .paint
                .painted_cells
                .iter()
                .map(|c| offset(c.x, c.y))
                .collect(),
        }
    }

    fn connect(
        &mut self,
        joins: &BTreeSet<(usize, usize)>,
        ground: &[Option<i16>],
        tolerance: u8,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<(), water_solver::Failure> {
        let mut budget = 200_000;
        for &(a, b) in joins.iter().take(16) {
            for radius in 1..=tolerance + 1 {
                let Some(lake) = lake_anchor(&self.rendered, &self.original, a, radius) else {
                    continue;
                };
                let outside = if self.original[a] { b } else { a };
                let stream = stream_anchor(
                    &self.source,
                    &self.rendered,
                    &self.original,
                    outside,
                    a,
                    radius,
                )
                .unwrap_or(outside);
                let region = MouthRegion {
                    rendered: &self.rendered,
                    original: &self.original,
                    distances: &self.distances,
                    ground,
                    tolerance,
                };
                let patch = region.patch(a, radius, &[a, b]);
                let result = patch.solve(&mut budget, canceled, None, None, |tiles| {
                    let proposed = changed_mask(&self.effective, &patch, tiles);
                    shape_adjustment::preserves_topology(&self.original, &proposed)
                        && connected(&self.rendered, &patch, tiles, a, lake)
                        && connected(&self.rendered, &patch, tiles, b, lake)
                        && connected(&self.rendered, &patch, tiles, stream, lake)
                });
                match result {
                    Ok(Some(tiles)) => {
                        self.effective = changed_mask(&self.effective, &patch, &tiles);
                        apply_tiles(
                            patch.cells,
                            tiles,
                            ground,
                            &mut self.rendered,
                            &mut self.touched,
                        );
                        break;
                    }
                    Err(water_solver::Failure::Canceled) => {
                        return Err(water_solver::Failure::Canceled);
                    }
                    Err(water_solver::Failure::Budget) => return Ok(()),
                    _ => {}
                }
            }
        }
        Ok(())
    }
}

// Anchor the untouched incoming stream, not a crossing cell the patch can absorb.
fn stream_anchor(
    source: &[i16],
    rendered: &[i16],
    original: &[bool],
    start: usize,
    center: usize,
    radius: u8,
) -> Option<usize> {
    let mut seen = BTreeSet::from([start]);
    let mut queue = std::collections::VecDeque::from([start]);
    while let Some(i) = queue.pop_front() {
        if (i % 90)
            .abs_diff(center % 90)
            .max((i / 90).abs_diff(center / 90))
            > radius as usize
            && source[i] == rendered[i]
        {
            return Some(i);
        }
        for d in 0..4 {
            let Some(j) = neighbor(i, d) else {
                continue;
            };
            if !original[j]
                && fixed_edge(source[i], d) == 6
                && fixed_edge(source[j], (d + 2) % 4) == 6
                && seen.insert(j)
            {
                queue.push_back(j);
            }
        }
    }
    None
}

fn lake_anchor(rendered: &[i16], original: &[bool], entrance: usize, radius: u8) -> Option<usize> {
    (0..8100)
        .filter(|&i| {
            original[i]
                && rendered[i] == 60
                && (i % 90)
                    .abs_diff(entrance % 90)
                    .max((i / 90).abs_diff(entrance / 90))
                    > radius as usize
        })
        .min_by_key(|&i| (i % 90).abs_diff(entrance % 90) + (i / 90).abs_diff(entrance / 90))
}

fn apply_tiles(
    cells: Vec<usize>,
    tiles: Vec<i16>,
    ground: &[Option<i16>],
    rendered: &mut [i16],
    touched: &mut BTreeSet<usize>,
) {
    for (i, tile) in cells.into_iter().zip(tiles) {
        rendered[i] = if tile == 0 {
            ground[i].unwrap_or(rendered[i])
        } else {
            tile
        };
        touched.insert(i);
    }
}

struct MouthRegion<'a> {
    rendered: &'a [i16],
    original: &'a [bool],
    distances: &'a [u8],
    ground: &'a [Option<i16>],
    tolerance: u8,
}

impl MouthRegion<'_> {
    fn patch(&self, center: usize, radius: u8, anchors: &[usize]) -> Patch<'_> {
        let (x, y) = (center % 90, center / 90);
        let mut cells = vec![];
        let mut domains = vec![];
        for i in 0usize..8100 {
            if (i % 90).abs_diff(x).max((i / 90).abs_diff(y)) > radius as usize {
                continue;
            }
            let water = index(self.rendered[i]).is_some();
            let ground = self.ground[i] == Some(self.rendered[i]);
            let flexible = self.distances[i] <= self.tolerance;
            if (!water && !ground) || (!self.original[i] && !flexible) {
                continue;
            }
            let mut domain = ALL & !GROUND;
            if flexible
                && self.ground[i].is_some()
                && !anchors.contains(&i)
                && (!water || self.original[i])
            {
                domain |= GROUND;
            }
            // A broad filled selection must remain water, not a relocated stream maze.
            if self.original[i] && shape_adjustment::broad(self.original, i, true) {
                for (p, piece) in PIECES.iter().enumerate() {
                    if (38..=51).contains(&piece.tile) {
                        domain &= !(1 << p);
                    }
                }
            }
            cells.push(i);
            domains.push(domain);
        }
        Patch {
            rendered: self.rendered,
            cells,
            domains,
        }
    }
}

fn crossings(map: &MapLevel, original: &[bool]) -> BTreeSet<(usize, usize)> {
    let mut joins = BTreeSet::new();
    for i in 0..8100 {
        for d in [1, 2] {
            let Some(j) = neighbor(i, d) else {
                continue;
            };
            if original[i] != original[j]
                && fixed_edge(normalized(map.tiles[i]), d) == 6
                && fixed_edge(normalized(map.tiles[j]), (d + 2) % 4) == 6
            {
                joins.insert((i, j));
            }
        }
    }
    joins
}

fn disconnected(
    source: &[i16],
    rendered: &[i16],
    original: &[bool],
    joins: &BTreeSet<(usize, usize)>,
) -> usize {
    joins
        .iter()
        .filter(|&&(a, b)| {
            let outside = if original[a] { b } else { a };
            let stream =
                stream_anchor(source, rendered, original, outside, a, 0).unwrap_or(outside);
            lake_anchor(rendered, original, a, 0).is_none_or(|lake| {
                !reaches(rendered, stream, lake)
                    || !reaches(rendered, a, lake)
                    || !reaches(rendered, b, lake)
            })
        })
        .count()
}

fn entrances(rendered: &[i16], warnings: &[MapCoordinate]) -> BTreeSet<(usize, usize)> {
    let mut result = BTreeSet::new();
    for cell in warnings {
        let i = offset(cell.x, cell.y);
        for d in 0..4 {
            let Some(j) = neighbor(i, d) else {
                continue;
            };
            let (a, b) = (
                fixed_edge(rendered[i], d),
                fixed_edge(rendered[j], (d + 2) % 4),
            );
            if a != b
                && (a == 6 || b == 6)
                && index(rendered[i]).is_some()
                && index(rendered[j]).is_some()
            {
                result.insert((i.min(j), i.max(j)));
            }
        }
    }
    result
}

fn changed_mask(current: &[bool], patch: &Patch<'_>, tiles: &[i16]) -> Vec<bool> {
    let mut proposed = current.to_vec();
    for (&i, &tile) in patch.cells.iter().zip(tiles) {
        if current[i] || index(patch.rendered[i]).is_none() {
            proposed[i] = tile != 0;
        }
    }
    proposed
}

fn connected(rendered: &[i16], patch: &Patch<'_>, tiles: &[i16], a: usize, b: usize) -> bool {
    let mut changed = rendered.to_vec();
    for (&i, &tile) in patch.cells.iter().zip(tiles) {
        changed[i] = tile;
    }
    reaches(&changed, a, b)
}

fn reaches(changed: &[i16], a: usize, b: usize) -> bool {
    let mut visited = vec![false; 8100];
    let mut pending = vec![a];
    visited[a] = true;
    while let Some(i) = pending.pop() {
        if i == b {
            return true;
        }
        for d in 0..4 {
            let Some(j) = neighbor(i, d) else {
                continue;
            };
            let edge = fixed_edge(changed[i], d);
            if !visited[j] && edge != 0 && edge == fixed_edge(changed[j], (d + 2) % 4) {
                visited[j] = true;
                pending.push(j);
            }
        }
    }
    false
}

fn finish(
    target: shape_planning::Target<'_>,
    intent: &SmartTerrainIntent,
    plan: SmartTerrainPlan,
    draft: Draft,
    connected_more: bool,
) -> Result<SmartTerrainPlan, SessionError> {
    let Draft {
        rendered,
        effective,
        mut touched,
        ..
    } = draft;
    touched.extend(plan.effective_mask.iter().map(|c| offset(c.x, c.y)));
    touched.extend(plan.unresolved.iter().map(|c| offset(c.x, c.y)));
    let cells: Vec<_> = touched.iter().map(|&i| coordinate(i)).collect();
    let tiles: Vec<_> = touched.iter().map(|&i| rendered[i]).collect();
    let unresolved = water_fallback::seam_warnings(target.map, &cells, &tiles);
    if unresolved.len() > plan.unresolved.len()
        || unresolved.len() == plan.unresolved.len() && !connected_more
    {
        return Ok(plan);
    }
    let resolved = planning::Resolved {
        cells: cells
            .iter()
            .zip(tiles)
            .map(|(c, tile)| LandMapCellPaint {
                x: c.x,
                y: c.y,
                tile,
            })
            .collect(),
        reason: (!unresolved.is_empty()).then(|| {
            "Warning: some transitions are approximate. Apply keeps the previewed tiles.".into()
        }),
        unresolved,
    };
    let mut result = planning::finish(
        target.snapshot,
        target.identity,
        intent,
        plan.mask.clone(),
        resolved,
    )?;
    shape_planning::set_effective_mask(
        &mut result,
        (0..8100)
            .filter(|&i| effective[i])
            .map(coordinate)
            .collect(),
    );
    Ok(result)
}

fn occupied(cells: &[MapCoordinate]) -> Vec<bool> {
    let mut mask = vec![false; 8100];
    for cell in cells {
        mask[offset(cell.x, cell.y)] = true;
    }
    mask
}
fn offset(x: u8, y: u8) -> usize {
    y as usize * 90 + x as usize
}
fn coordinate(i: usize) -> MapCoordinate {
    MapCoordinate {
        x: (i % 90) as u8,
        y: (i / 90) as u8,
    }
}
fn normalized(tile: i16) -> i16 {
    map_paint::terrain_tile(tile).unwrap_or(0) as i16
}
