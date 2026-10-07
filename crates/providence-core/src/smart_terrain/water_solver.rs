use super::water_geometry::{PIECES, candidates, fixed_edge, index, matching_edge};
use super::{
    water_budget::{Budget, Statistics},
    water_connectivity, water_domains,
};
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel},
};
use std::collections::{BTreeSet, VecDeque};

const ALL: u64 = (1 << PIECES.len()) - 1;
const DIRECTIONS: [(i16, i16); 4] = [(0, -1), (1, 0), (0, 1), (-1, 0)];
const MAX_BRANCHES: usize = 32_768;

#[cfg(test)]
#[path = "water_search_tests.rs"]
mod tests;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Failure {
    Impossible,
    Budget,
    Canceled,
}

struct Region<'a> {
    preserve_filled_cells: bool,
    map: &'a MapLevel,
    cells: &'a [MapCoordinate],
    positions: Vec<usize>,
    neighbors: water_connectivity::Neighbors,
    topology: Option<water_connectivity::Topology>,
    budget: Budget,
    gradients: Vec<(i32, i32)>,
}

pub(super) fn solve(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<Vec<i16>, Failure> {
    solve_recorded(map, cells, canceled).0
}

pub(super) fn solve_recorded(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> (Result<Vec<i16>, Failure>, Statistics) {
    solve_with_policy(map, cells, canceled, false)
}

pub(super) fn solve_filled(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
) -> Result<Vec<i16>, Failure> {
    solve_with_policy(map, cells, canceled, true).0
}

fn solve_with_policy(
    map: &MapLevel,
    cells: &[MapCoordinate],
    canceled: &mut impl FnMut() -> bool,
    preserve_filled_cells: bool,
) -> (Result<Vec<i16>, Failure>, Statistics) {
    let mut budget = Budget::new(cells.len());
    let mut selection_positions = vec![usize::MAX; 8100];
    for (i, cell) in cells.iter().enumerate() {
        selection_positions[usize::from(cell.y) * 90 + usize::from(cell.x)] = i;
    }
    let regions = match super::water_regions::partition(cells, &mut budget, canceled) {
        Ok(regions) => regions,
        Err(failure) => return (Err(failure), budget.statistics),
    };
    let mut output = vec![0; cells.len()];
    for indices in regions {
        let selected: Vec<_> = indices.iter().map(|&i| cells[i]).collect();
        let (result, next_budget) = solve_component(
            map,
            &selected,
            &selection_positions,
            canceled,
            budget,
            preserve_filled_cells,
        );
        budget = next_budget;
        match result {
            Ok(tiles) => {
                for (i, tile) in indices.into_iter().zip(tiles) {
                    output[i] = tile;
                }
            }
            Err(failure) => return (Err(failure), budget.statistics),
        }
    }
    (Ok(output), budget.statistics)
}

fn solve_component(
    map: &MapLevel,
    cells: &[MapCoordinate],
    selection_positions: &[usize],
    canceled: &mut impl FnMut() -> bool,
    budget: Budget,
    preserve_filled_cells: bool,
) -> (Result<Vec<i16>, Failure>, Budget) {
    let mut positions = vec![usize::MAX; 8100];
    for (i, cell) in cells.iter().enumerate() {
        positions[usize::from(cell.y) * 90 + usize::from(cell.x)] = i;
    }
    let neighbors = cells
        .iter()
        .map(|cell| {
            std::array::from_fn(|d| {
                let (dx, dy) = DIRECTIONS[d];
                let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
                if !(0..90).contains(&x) || !(0..90).contains(&y) {
                    return None;
                }
                let other = positions[y as usize * 90 + x as usize];
                (other != usize::MAX).then_some(other)
            })
        })
        .collect();
    let gradients = cells
        .iter()
        .map(|cell| super::water_contour::gradient(map, selection_positions, *cell))
        .collect();
    let mut region = Region {
        preserve_filled_cells,
        map,
        cells,
        positions,
        neighbors,
        topology: None,
        budget,
        gradients,
    };
    let result = region.solve(canceled);
    (result, region.budget)
}

struct Decision {
    cell: usize,
    alternatives: u64,
    checkpoint: usize,
}

struct Domains {
    values: Vec<u64>,
    trail: Vec<(usize, u64)>,
}

impl Domains {
    fn set(&mut self, cell: usize, value: u64) {
        self.trail.push((cell, self.values[cell]));
        self.values[cell] = value;
    }

    fn restore(&mut self, checkpoint: usize) {
        while self.trail.len() > checkpoint {
            let (cell, value) = self.trail.pop().expect("trail checkpoint");
            self.values[cell] = value;
        }
    }
}

impl Region<'_> {
    fn solve(&mut self, canceled: &mut impl FnMut() -> bool) -> Result<Vec<i16>, Failure> {
        let attempts: &[(bool, i16)] = if self.preserve_filled_cells {
            &[(false, 1), (false, 2)]
        } else {
            &[(false, 1), (true, 1), (true, 2)]
        };
        for &(boundary_ports, interior_radius) in attempts {
            self.topology = None;
            let result = self.search(boundary_ports, interior_radius, canceled);
            if result != Err(Failure::Impossible) {
                return result;
            }
        }
        Err(Failure::Impossible)
    }

    fn search(
        &mut self,
        boundary_ports: bool,
        interior_radius: i16,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<Vec<i16>, Failure> {
        let mut domains = Domains {
            values: self.initial_domains(boundary_ports, interior_radius),
            trail: vec![],
        };
        let mut decisions = vec![];
        let mut seeds: Vec<_> = (0..self.cells.len()).collect();
        for _ in 0..MAX_BRANCHES {
            let valid = match self.constrain(&mut domains, seeds, canceled) {
                Ok(()) => true,
                Err(Failure::Impossible) => false,
                Err(reason) => return Err(reason),
            };
            let choice = domains
                .values
                .iter()
                .enumerate()
                .filter(|(_, d)| d.count_ones() > 1)
                .min_by_key(|(i, d)| (d.count_ones(), *i))
                .map(|(i, _)| i);
            if valid
                && choice.is_none()
                && let Some(tiles) = self.finish(&domains.values, canceled)?
            {
                return Ok(tiles);
            }
            let next = match (valid, choice) {
                (true, Some(cell)) => Some(Decision {
                    cell,
                    alternatives: domains.values[cell],
                    checkpoint: domains.trail.len(),
                }),
                _ => self.backtrack(&mut domains, &mut decisions),
            };
            let Some(mut next) = next else {
                return Err(Failure::Impossible);
            };
            let chosen = self.preferred(next.cell, next.alternatives);
            next.alternatives &= !(1 << chosen);
            domains.set(next.cell, 1 << chosen);
            self.budget.statistics.decisions += 1;
            seeds = vec![next.cell];
            decisions.push(next);
        }
        Err(Failure::Budget)
    }

    fn finish(
        &mut self,
        domains: &[u64],
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<Option<Vec<i16>>, Failure> {
        self.budget.charge(self.cells.len() * 8)?;
        if !self.connected(domains) {
            self.budget.statistics.connectivity_rejections += 1;
            return Ok(None);
        }
        let mut tiles = domains
            .iter()
            .map(|d| PIECES[d.trailing_zeros() as usize].tile)
            .collect::<Vec<_>>();
        super::water_refinement::refine(
            self.map,
            self.cells,
            &mut tiles,
            &self.gradients,
            canceled,
        )?;
        Ok(Some(tiles))
    }

    fn backtrack(
        &mut self,
        domains: &mut Domains,
        decisions: &mut Vec<Decision>,
    ) -> Option<Decision> {
        self.budget.statistics.backtracks += 1;
        while let Some(decision) = decisions.pop() {
            domains.restore(decision.checkpoint);
            if decision.alternatives != 0 {
                return Some(decision);
            }
        }
        None
    }

    fn neighbor(&self, cell: usize, direction: usize) -> Option<(u8, u8)> {
        let c = self.cells[cell];
        let (dx, dy) = DIRECTIONS[direction];
        let (x, y) = (i16::from(c.x) + dx, i16::from(c.y) + dy);
        ((0..90).contains(&x) && (0..90).contains(&y)).then_some((x as u8, y as u8))
    }

    fn initial_domains(&self, boundary_ports: bool, interior_radius: i16) -> Vec<u64> {
        self.cells
            .iter()
            .enumerate()
            .map(|(i, _)| {
                let mut domain = self.occupancy_domain(i, boundary_ports, interior_radius);
                for d in 0..4 {
                    let Some((x, y)) = self.neighbor(i, d) else {
                        continue;
                    };
                    if self.positions[usize::from(y) * 90 + usize::from(x)] != usize::MAX {
                        continue;
                    }
                    let raw = self.map.tiles[usize::from(y) * 90 + usize::from(x)];
                    let edge =
                        terrain_tile(raw).map_or(0, |tile| fixed_edge(tile as i16, (d + 2) % 4));
                    domain &= matching_edge(d, edge);
                }
                domain
            })
            .collect()
    }

    fn occupancy_domain(&self, cell: usize, boundary_ports: bool, interior_radius: i16) -> u64 {
        let cell = self.cells[cell];
        let selected = |dx: i16, dy: i16| {
            let (x, y) = (i16::from(cell.x) + dx, i16::from(cell.y) + dy);
            (0..90).contains(&x)
                && (0..90).contains(&y)
                && self.positions[y as usize * 90 + x as usize] != usize::MAX
        };
        if (-interior_radius..=interior_radius)
            .all(|y| (-interior_radius..=interior_radius).all(|x| selected(x, y)))
        {
            return 1 << index(60).expect("full water");
        }
        // Two-phase shores and tapered mouths may extend two cells into a
        // literal boundary. The fallback admits these pieces, not arbitrary
        // center substitutions; deeper interior water remains required.
        if !boundary_ports && super::water_contour::broad(&self.positions, cell) {
            return PIECES
                .iter()
                .enumerate()
                .filter(|(_, p)| p.tile <= 32 || p.tile == 60)
                .fold(0, |mask, (i, _)| mask | (1 << i));
        }
        ALL
    }

    fn propagate(
        &mut self,
        domains: &mut Domains,
        seeds: Vec<usize>,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<(), Failure> {
        let mut queued = vec![false; domains.values.len()];
        let mut sent = vec![[0; 4]; domains.values.len()];
        for &cell in &seeds {
            queued[cell] = true;
        }
        let mut queue: VecDeque<_> = seeds.into();
        while let Some(i) = queue.pop_front() {
            queued[i] = false;
            if canceled() {
                return Err(Failure::Canceled);
            }
            if domains.values[i] == 0 {
                return Err(Failure::Impossible);
            }
            for (d, last_sent) in sent[i].iter_mut().enumerate() {
                let Some(other) = self.neighbors[i][d] else {
                    continue;
                };
                self.budget.charge(5)?;
                let supported = water_domains::support(domains.values[i], d);
                if *last_sent == supported {
                    continue;
                }
                *last_sent = supported;
                let narrowed = domains.values[other] & supported;
                if narrowed != domains.values[other] {
                    if narrowed == 0 {
                        return Err(Failure::Impossible);
                    }
                    domains.set(other, narrowed);
                    if !queued[other] {
                        queued[other] = true;
                        queue.push_back(other);
                    }
                }
            }
        }
        Ok(())
    }

    fn constrain(
        &mut self,
        domains: &mut Domains,
        mut seeds: Vec<usize>,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<(), Failure> {
        loop {
            self.propagate(domains, seeds, canceled)?;
            if self.topology.is_none() {
                self.topology = Some(water_connectivity::Topology::new(
                    &self.neighbors,
                    &domains.values,
                    &mut self.budget,
                    canceled,
                )?);
            }
            let bridges = self.topology.as_ref().unwrap().bridges(
                &domains.values,
                &mut self.budget,
                canceled,
            )?;
            seeds = vec![];
            for (a, b, d) in bridges {
                for (cell, direction) in [(a, d), (b, (d + 2) % 4)] {
                    let wet = domains.values[cell] & water_domains::wet_domain(direction);
                    if wet != domains.values[cell] {
                        domains.set(cell, wet);
                        seeds.push(cell);
                    }
                }
            }
            if seeds.is_empty() {
                return Ok(());
            }
        }
    }

    fn preferred(&self, cell: usize, domain: u64) -> usize {
        let c = self.cells[cell];
        let original = terrain_tile(self.map.tiles[usize::from(c.y) * 90 + usize::from(c.x)])
            .and_then(|tile| index(tile as i16));
        candidates(domain)
            .max_by_key(|i| {
                (
                    PIECES[*i].tile == 60,
                    PIECES[*i].tile <= 32,
                    super::water_contour::alignment(*i, self.gradients[cell]),
                    PIECES[*i].area,
                    Some(*i) == original,
                    std::cmp::Reverse(*i),
                )
            })
            .expect("propagation retained a candidate")
    }

    fn connected(&self, domains: &[u64]) -> bool {
        let mut unchecked: BTreeSet<_> = (0..domains.len()).collect();
        while let Some(&start) = unchecked.first() {
            let intended = self.component(start, None);
            let rendered = self.component(start, Some(domains));
            if intended != rendered {
                return false;
            }
            for i in intended {
                unchecked.remove(&i);
            }
        }
        true
    }

    fn component(&self, start: usize, domains: Option<&[u64]>) -> BTreeSet<usize> {
        let mut visited = BTreeSet::from([start]);
        let mut queue = VecDeque::from([start]);
        while let Some(i) = queue.pop_front() {
            for d in 0..4 {
                if domains
                    .is_some_and(|values| PIECES[values[i].trailing_zeros() as usize].edges[d] == 0)
                {
                    continue;
                }
                let Some(position) = self.neighbor(i, d) else {
                    continue;
                };
                let other = self.positions[usize::from(position.1) * 90 + usize::from(position.0)];
                if other == usize::MAX {
                    continue;
                }
                if visited.insert(other) {
                    queue.push_back(other);
                }
            }
        }
        visited
    }
}
