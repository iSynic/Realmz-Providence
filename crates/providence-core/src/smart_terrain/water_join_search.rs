//! Small exact edge search for a stream entrance, including optional ground cells.
use super::water_geometry::{PIECES, candidates, fixed_edge, index, matching_edge};
use super::water_solver::Failure;
use std::collections::VecDeque;
use std::sync::OnceLock;

pub(super) const GROUND: u64 = 1 << PIECES.len();
pub(super) const ALL: u64 = (GROUND << 1) - 1;

pub(super) struct Limits {
    pub mouths: usize,
    pub branches: usize,
    pub stream_cost: (usize, usize),
}

impl Limits {
    fn permits(&self, domains: &[u64]) -> bool {
        let required = |first, last| {
            let mask = PIECES
                .iter()
                .enumerate()
                .filter(|(_, p)| (first..=last).contains(&p.tile))
                .fold(0, |mask, (p, _)| mask | (1 << p));
            domains.iter().filter(|&&d| d & !mask == 0).count()
        };
        required(21, 24) <= self.mouths
            && required(44, 47) <= self.branches
            && (required(38, 51), required(40, 51)) < self.stream_cost
    }
}

pub(super) fn neighbor(i: usize, d: usize) -> Option<usize> {
    let (x, y) = ((i % 90) as i16, (i / 90) as i16);
    let (dx, dy) = [(0, -1), (1, 0), (0, 1), (-1, 0)][d];
    ((0..90).contains(&(x + dx)) && (0..90).contains(&(y + dy)))
        .then_some(((y + dy) * 90 + x + dx) as usize)
}

fn matching(d: usize, edge: u8) -> u64 {
    matching_edge(d, edge) | if edge == 0 { GROUND } else { 0 }
}

fn support(domain: u64, d: usize) -> u64 {
    static TABLE: OnceLock<[[u64; 48]; 4]> = OnceLock::new();
    let table = TABLE.get_or_init(|| {
        std::array::from_fn(|d| {
            std::array::from_fn(|p| matching((d + 2) % 4, PIECES.get(p).map_or(0, |p| p.edges[d])))
        })
    });
    candidates(domain).fold(0, |mask, p| mask | table[d][p])
}

pub(super) struct Patch<'a> {
    pub rendered: &'a [i16],
    pub cells: Vec<usize>,
    pub domains: Vec<u64>,
}

impl Patch<'_> {
    pub fn solve(
        &self,
        budget: &mut usize,
        canceled: &mut impl FnMut() -> bool,
        preferred: Option<&[i16]>,
        mut limits: Option<Limits>,
        mut accept: impl FnMut(&[i16]) -> bool,
    ) -> Result<Option<Vec<i16>>, Failure> {
        let mut positions = vec![usize::MAX; 8100];
        for (p, &i) in self.cells.iter().enumerate() {
            positions[i] = p;
        }
        let domains = self.initial_domains(&positions);
        let mut pending = vec![domains];
        let mut best = None;
        while let Some(mut domains) = pending.pop() {
            match self.propagate(&mut domains, &positions, budget, canceled) {
                Ok(false) => continue,
                Err(Failure::Budget) if best.is_some() => return Ok(best),
                Err(error) => return Err(error),
                Ok(true) => {}
            }
            if limits
                .as_ref()
                .is_some_and(|limits| !limits.permits(&domains))
            {
                continue;
            }
            let choice = domains
                .iter()
                .enumerate()
                .filter(|(_, d)| d.count_ones() > 1)
                .min_by_key(|(p, d)| (d.count_ones(), *p))
                .map(|(p, _)| p);
            let Some(p) = choice else {
                let tiles: Vec<_> = domains
                    .iter()
                    .map(|d| {
                        PIECES
                            .get(d.trailing_zeros() as usize)
                            .map_or(0, |p| p.tile)
                    })
                    .collect();
                if accept(&tiles) {
                    let Some(limits) = limits.as_mut() else {
                        return Ok(Some(tiles));
                    };
                    limits.stream_cost = (
                        tiles.iter().filter(|&&t| (38..=51).contains(&t)).count(),
                        tiles.iter().filter(|&&t| (40..=51).contains(&t)).count(),
                    );
                    best = Some(tiles);
                }
                continue;
            };
            pending.extend(self.branches(&domains, p, preferred));
        }
        Ok(best)
    }

    fn branches(&self, domains: &[u64], p: usize, preferred: Option<&[i16]>) -> Vec<Vec<u64>> {
        let mut options: Vec<_> = candidates(domains[p]).collect();
        let old = preferred.unwrap_or(self.rendered)[self.cells[p]];
        let area = index(old).map_or(0, |p| PIECES[p].area);
        options.sort_by_key(|&p| {
            let tile = PIECES.get(p).map_or(0, |p| p.tile);
            (
                tile != old,
                PIECES.get(p).map_or(0, |p| p.area).abs_diff(area),
                p,
            )
        });
        options
            .into_iter()
            .rev()
            .map(|piece| {
                let mut branch = domains.to_vec();
                branch[p] = 1 << piece;
                branch
            })
            .collect()
    }

    fn initial_domains(&self, positions: &[usize]) -> Vec<u64> {
        let mut domains = self.domains.clone();
        for (p, &i) in self.cells.iter().enumerate() {
            for d in 0..4 {
                if let Some(j) = neighbor(i, d).filter(|j| positions[*j] == usize::MAX) {
                    domains[p] &= matching(d, fixed_edge(self.rendered[j], (d + 2) % 4));
                } else if neighbor(i, d).is_none() {
                    domains[p] &= matching(d, 0);
                }
            }
        }
        domains
    }

    fn propagate(
        &self,
        domains: &mut [u64],
        positions: &[usize],
        budget: &mut usize,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<bool, Failure> {
        let mut queue: VecDeque<_> = (0..domains.len()).collect();
        while let Some(p) = queue.pop_front() {
            if canceled() {
                return Err(Failure::Canceled);
            }
            if *budget == 0 {
                return Err(Failure::Budget);
            }
            *budget -= 1;
            if domains[p] == 0 {
                return Ok(false);
            }
            for d in 0..4 {
                let Some(j) = neighbor(self.cells[p], d) else {
                    continue;
                };
                let q = positions[j];
                if q == usize::MAX {
                    continue;
                }
                let reduced = domains[q] & support(domains[p], d);
                if reduced != domains[q] {
                    domains[q] = reduced;
                    queue.push_back(q);
                }
            }
        }
        Ok(true)
    }
}
