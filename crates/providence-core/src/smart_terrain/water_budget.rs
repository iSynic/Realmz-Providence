use super::water_solver::Failure;

#[derive(Default, Debug, Clone, Copy)]
pub(super) struct Statistics {
    pub work: usize,
    pub decisions: usize,
    pub backtracks: usize,
    pub connectivity_rejections: usize,
}

pub(super) struct Budget {
    pub statistics: Statistics,
    limit: usize,
}

impl Budget {
    pub fn new(cells: usize) -> Self {
        // Account for linear graph scans as well as ambiguous boundary search.
        Self {
            statistics: Statistics::default(),
            limit: 200_000 + cells.min(8100) * 256,
        }
    }

    pub fn charge(&mut self, work: usize) -> Result<(), Failure> {
        self.statistics.work += work;
        if self.statistics.work > self.limit {
            Err(Failure::Budget)
        } else {
            Ok(())
        }
    }
}
