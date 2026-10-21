use super::{domains::Prepared, *};
use std::collections::VecDeque;

struct Decision {
    cell: usize,
    remaining: u64,
    mark: usize,
}

pub(super) struct Search {
    input: Prepared,
    supports: Vec<Vec<u64>>,
    trail: Vec<(usize, u64)>,
    stack: Vec<Decision>,
    random: u64,
    density: Density,
    work: usize,
    decisions: usize,
    limit: usize,
}

impl Search {
    pub fn new(input: Prepared, intent: &Intent) -> Self {
        let count = input.pieces.len();
        let supports = (0..4)
            .map(|d| {
                (0..count)
                    .map(|a| {
                        (0..count)
                            .filter(|&b| input.pieces[a].1[d] == input.pieces[b].1[(d + 2) % 4])
                            .fold(0, |mask, b| mask | 1 << b)
                    })
                    .collect()
            })
            .collect();
        let cells = input.editable.iter().filter(|&&editable| editable).count();
        Self {
            input,
            supports,
            trail: vec![],
            stack: vec![],
            random: u64::from(intent.seed),
            density: intent.density,
            work: 0,
            decisions: 0,
            limit: 1_000_000 + cells * 16_384,
        }
    }

    pub fn work(&self) -> usize {
        self.work
    }
    pub fn decisions(&self) -> usize {
        self.decisions
    }
    pub fn protected_cells(&self) -> Vec<MapCoordinate> {
        self.input.protected.clone()
    }

    pub fn solve(
        &mut self,
        canceled: &mut impl FnMut() -> bool,
        accept: &mut impl FnMut(&[LandMapCellPaint]) -> bool,
    ) -> Result<Vec<LandMapCellPaint>, Outcome> {
        let initial = (0..8100)
            .filter(|&i| {
                self.input.editable[i]
                    || map_connectivity::neighbors(i).any(|n| self.input.editable[n])
            })
            .collect();
        self.propagate(initial, canceled)?;
        loop {
            self.charge(8100, canceled)?;
            let next = (0..8100)
                .filter(|&i| self.input.editable[i] && self.input.domains[i].count_ones() > 1)
                .min_by_key(|&i| (self.input.domains[i].count_ones(), i));
            if let Some(cell) = next {
                self.stack.push(Decision {
                    cell,
                    remaining: self.input.domains[cell],
                    mark: self.trail.len(),
                });
            } else {
                let cells = self.cells();
                if accept(&cells) {
                    return Ok(cells);
                }
            }
            loop {
                self.charge(1, canceled)?;
                if !self.retry() {
                    return Err(Outcome::Contradiction);
                }
                let cell = self.stack.last().unwrap().cell;
                match self.propagate(VecDeque::from([cell]), canceled) {
                    Ok(()) => break,
                    Err(Outcome::Contradiction) => (),
                    Err(reason) => return Err(reason),
                }
            }
        }
    }

    fn retry(&mut self) -> bool {
        while let Some(decision) = self.stack.last_mut() {
            while self.trail.len() > decision.mark {
                let (i, value) = self.trail.pop().unwrap();
                self.input.domains[i] = value;
            }
            if decision.remaining == 0 {
                self.stack.pop();
                continue;
            }
            let cell = decision.cell;
            let remaining = decision.remaining;
            let choice = self.choose(remaining);
            self.stack.last_mut().unwrap().remaining &= !choice;
            self.trail.push((cell, self.input.domains[cell]));
            self.input.domains[cell] = choice;
            self.decisions += 1;
            return true;
        }
        false
    }

    fn choose(&mut self, domain: u64) -> u64 {
        // SplitMix64 and integer weights keep output independent of floating-point/platform details.
        self.random = self.random.wrapping_add(0x9e3779b97f4a7c15);
        let mut value = self.random;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
        value ^= value >> 31;
        let base = match self.density {
            Density::Sparse => 180,
            Density::Balanced => 36,
            Density::Dense => 4,
        };
        let weights: Vec<_> = (0..self.input.pieces.len())
            .filter(|&i| domain & (1 << i) != 0)
            .map(|i| (i, if i == 0 { base } else { 4u64 }))
            .collect();
        let mut draw = value % weights.iter().map(|(_, weight)| weight).sum::<u64>();
        for (i, weight) in weights {
            if draw < weight {
                return 1 << i;
            }
            draw -= weight;
        }
        unreachable!()
    }

    fn charge(&mut self, work: usize, canceled: &mut impl FnMut() -> bool) -> Result<(), Outcome> {
        self.work += work;
        if canceled() {
            return Err(Outcome::Canceled);
        }
        if self.work > self.limit || self.decisions > 32_768 {
            return Err(Outcome::BudgetExhausted);
        }
        Ok(())
    }

    fn propagate(
        &mut self,
        mut queue: VecDeque<usize>,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<(), Outcome> {
        while let Some(i) = queue.pop_front() {
            self.charge(self.input.pieces.len(), canceled)?;
            for (d, neighbor) in adjacent(i).into_iter().enumerate() {
                let Some(n) = neighbor else {
                    if self.input.editable[i] {
                        self.boundary(i, d, &mut queue)?;
                    }
                    continue;
                };
                if !self.input.editable[n] {
                    continue;
                }
                let support = self.supports[d]
                    .iter()
                    .enumerate()
                    .filter(|(p, _)| self.input.domains[i] & (1 << p) != 0)
                    .fold(0, |mask, (_, support)| mask | support);
                let narrowed = self.input.domains[n] & support;
                if narrowed == 0 {
                    return Err(Outcome::Contradiction);
                }
                if narrowed != self.input.domains[n] {
                    self.trail.push((n, self.input.domains[n]));
                    self.input.domains[n] = narrowed;
                    queue.push_back(n);
                }
            }
        }
        Ok(())
    }

    fn boundary(&mut self, i: usize, d: usize, queue: &mut VecDeque<usize>) -> Result<(), Outcome> {
        let permitted = self
            .input
            .pieces
            .iter()
            .enumerate()
            .filter(|(_, piece)| piece.1[d] == 0)
            .fold(0, |mask, (p, _)| mask | 1 << p);
        let narrowed = self.input.domains[i] & permitted;
        if narrowed == 0 {
            return Err(Outcome::Contradiction);
        }
        if narrowed != self.input.domains[i] {
            self.trail.push((i, self.input.domains[i]));
            self.input.domains[i] = narrowed;
            queue.push_back(i);
        }
        Ok(())
    }

    fn cells(&self) -> Vec<LandMapCellPaint> {
        (0..8100)
            .filter(|&i| self.input.editable[i])
            .filter_map(|i| {
                let tile = self.input.pieces[self.input.domains[i].trailing_zeros() as usize].0;
                (tile != self.input.before[i]).then(|| {
                    let cell = map_connectivity::coordinate(i);
                    LandMapCellPaint {
                        x: cell.x,
                        y: cell.y,
                        tile,
                    }
                })
            })
            .collect()
    }
}

fn adjacent(i: usize) -> [Option<usize>; 4] {
    let x = i % 90;
    let y = i / 90;
    [
        y.checked_sub(1).map(|y| y * 90 + x),
        (x < 89).then_some(i + 1),
        (y < 89).then_some(i + 90),
        x.checked_sub(1).map(|x| y * 90 + x),
    ]
}
