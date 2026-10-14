//! Keep both the original stroke and its replacement within the chosen distance.
pub(super) struct ShapeBounds {
    original: Vec<bool>,
    coverage: Vec<u8>,
    tolerance: u8,
}

impl ShapeBounds {
    pub(super) fn new(original: &[bool], tolerance: u8) -> Self {
        let coverage = (0..8100)
            .map(|i| nearby(i, tolerance).filter(|&j| original[j]).count() as u8)
            .collect();
        Self {
            original: original.to_vec(),
            coverage,
            tolerance,
        }
    }

    pub(super) fn allows(&self, i: usize, adding: bool) -> bool {
        if adding {
            nearby(i, self.tolerance).any(|j| self.original[j])
        } else {
            // A thin arm lies entirely in the boundary band. Checking only that
            // band lets repeated local removals consume an arbitrarily long arm.
            nearby(i, self.tolerance).all(|j| !self.original[j] || self.coverage[j] > 1)
        }
    }

    pub(super) fn record(&mut self, i: usize, adding: bool) {
        for j in nearby(i, self.tolerance) {
            if adding {
                self.coverage[j] += 1;
            } else {
                self.coverage[j] -= 1;
            }
        }
    }
}

fn nearby(i: usize, tolerance: u8) -> impl Iterator<Item = usize> {
    let (x, y, radius) = ((i % 90) as i16, (i / 90) as i16, i16::from(tolerance));
    (-radius..=radius).flat_map(move |dy| {
        let width = radius - dy.abs();
        (-width..=width).filter_map(move |dx| {
            let (nx, ny) = (x + dx, y + dy);
            ((0..90).contains(&nx) && (0..90).contains(&ny)).then_some((ny * 90 + nx) as usize)
        })
    })
}
