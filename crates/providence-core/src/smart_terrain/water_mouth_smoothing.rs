use super::*;

impl Draft {
    pub(super) fn smooth(
        &mut self,
        joins: &BTreeSet<(usize, usize)>,
        ground: &[Option<i16>],
        tolerance: u8,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<bool, water_solver::Failure> {
        let mut improved = false;
        let mut budget = 40_000;
        for &(a, b) in joins.iter().take(16) {
            let radius = tolerance + 1;
            let Some(lake) = lake_anchor(&self.rendered, &self.original, a, radius) else {
                continue;
            };
            let outside = if self.original[a] { b } else { a };
            let Some(stream) = stream_anchor(
                &self.source,
                &self.rendered,
                &self.original,
                outside,
                a,
                radius,
            ) else {
                continue;
            };
            let region = MouthRegion {
                rendered: &self.rendered,
                original: &self.original,
                distances: &self.distances,
                ground,
                tolerance,
            };
            let mut patch = region.patch(a, radius, &[]);
            let result = solve_approach(
                &mut patch,
                &self.effective,
                ground,
                [stream, lake],
                &mut budget,
                canceled,
            );
            match result {
                Ok(Some(tiles)) => {
                    apply_tiles(
                        patch.cells,
                        tiles,
                        ground,
                        &mut self.rendered,
                        &mut self.touched,
                    );
                    improved = true;
                }
                Err(water_solver::Failure::Budget) => break,
                Err(error) => return Err(error),
                _ => {}
            }
        }
        Ok(improved)
    }
}

fn solve_approach(
    patch: &mut Patch<'_>,
    effective: &[bool],
    ground: &[Option<i16>],
    [stream, lake]: [usize; 2],
    budget: &mut usize,
    canceled: &mut impl FnMut() -> bool,
) -> Result<Option<Vec<i16>>, water_solver::Failure> {
    for (p, &i) in patch.cells.iter().enumerate() {
        patch.domains[p] = smooth_domain(
            patch.rendered[i],
            ground[i].is_some() && !effective[i],
            straight_bank(effective, i),
        );
        if is_stream(patch.rendered[i]) && !reaches(patch.rendered, i, lake) {
            patch.domains[p] = 1 << index(patch.rendered[i]).unwrap();
        }
    }
    let mut preferred = patch.rendered.to_vec();
    for &i in &patch.cells {
        preferred[i] = match preferred[i] {
            21 => 4,
            22 => 1,
            23 => 2,
            24 => 3,
            t if is_stream(t) => 0,
            t => t,
        };
        if let Some(bank) = straight_bank(effective, i) {
            preferred[i] = PIECES.iter().find(|p| p.edges == bank).unwrap().tile;
        }
    }
    let before: Vec<_> = patch.cells.iter().map(|&i| patch.rendered[i]).collect();
    let feeds = fixed_feeds(patch, lake);
    let limits = water_join_search::Limits {
        mouths: mouth_count(&before),
        branches: branch_count(&before),
        stream_cost: stream_cost(&before),
    };
    patch.solve(budget, canceled, Some(&preferred), Some(limits), |tiles| {
        connected(patch.rendered, patch, tiles, stream, lake)
            && feeds
                .iter()
                .all(|&feed| connected(patch.rendered, patch, tiles, feed, lake))
    })
}

fn fixed_feeds(patch: &Patch<'_>, lake: usize) -> BTreeSet<usize> {
    patch
        .cells
        .iter()
        .flat_map(|&i| {
            (0..4).filter_map(move |d| {
                let j = neighbor(i, d)?;
                (!patch.cells.contains(&j)
                    && fixed_edge(patch.rendered[j], (d + 2) % 4) == 6
                    && reaches(patch.rendered, j, lake))
                .then_some(j)
            })
        })
        .collect()
}

// Move a mouth along its existing shoreline, without expanding the lake or changing
// islands. Only the narrow approach can move within the original tolerance band.
fn smooth_domain(old: i16, ground: bool, straight: Option<[u8; 4]>) -> u64 {
    let Some(old) = index(old).filter(|&p| !is_stream(PIECES[p].tile)) else {
        return PIECES
            .iter()
            .enumerate()
            .filter(|(_, p)| is_stream(p.tile) && (!(40..=43).contains(&p.tile) || p.tile == old))
            .fold(if ground { GROUND } else { 0 }, |d, (p, _)| d | (1 << p));
    };
    let bank = |edges: [u8; 4]| edges.map(|e| if e == 6 { 0 } else { e });
    PIECES
        .iter()
        .enumerate()
        .filter(|(_, p)| bank(p.edges) == straight.unwrap_or_else(|| bank(PIECES[old].edges)))
        .fold(0, |d, (p, _)| d | (1 << p))
}

fn straight_bank(mask: &[bool], i: usize) -> Option<[u8; 4]> {
    let inside = |dx: i16, dy: i16| {
        let (x, y) = ((i % 90) as i16 + dx, (i / 90) as i16 + dy);
        (0..90).contains(&x) && (0..90).contains(&y) && mask[y as usize * 90 + x as usize]
    };
    if !mask[i] {
        return None;
    }
    for (nx, ny, bank) in [
        (0, 1, [15, 3, 0, 3]),
        (1, 0, [3, 0, 3, 15]),
        (0, -1, [0, 12, 15, 12]),
        (-1, 0, [12, 15, 12, 0]),
    ] {
        let (tx, ty) = (-ny, nx);
        if inside(tx, ty)
            && inside(-tx, -ty)
            && (-1..=1)
                .all(|t| !inside(nx + t * tx, ny + t * ty) && inside(-nx + t * tx, -ny + t * ty))
        {
            return Some(bank);
        }
    }
    None
}

fn is_stream(tile: i16) -> bool {
    (38..=51).contains(&tile)
}

fn branch_count(tiles: &[i16]) -> usize {
    tiles.iter().filter(|&&t| (44..=47).contains(&t)).count()
}

fn mouth_count(tiles: &[i16]) -> usize {
    tiles.iter().filter(|&&t| (21..=24).contains(&t)).count()
}

fn stream_cost(tiles: &[i16]) -> (usize, usize) {
    (
        tiles.iter().filter(|&&t| is_stream(t)).count(),
        tiles.iter().filter(|&&t| (40..=51).contains(&t)).count(),
    )
}
