use super::water_geometry::{PIECES, matching_edge};
use std::sync::OnceLock;

const EDGES: [u8; 5] = [0, 3, 6, 12, 15];

fn groups() -> &'static [[u64; 5]; 4] {
    static GROUPS: OnceLock<[[u64; 5]; 4]> = OnceLock::new();
    GROUPS.get_or_init(|| std::array::from_fn(|d| EDGES.map(|edge| matching_edge(d, edge))))
}

pub(super) fn support(domain: u64, direction: usize) -> u64 {
    let groups = groups();
    (0..5)
        .filter(|&edge| domain & groups[direction][edge] != 0)
        .fold(0, |support, edge| {
            support | groups[(direction + 2) % 4][edge]
        })
}

pub(super) fn wet_support(domain: u64, direction: usize) -> u64 {
    let groups = groups();
    (1..5)
        .filter(|&edge| domain & groups[direction][edge] != 0)
        .fold(0, |support, edge| {
            support | groups[(direction + 2) % 4][edge]
        })
}

pub(super) fn wet_domain(direction: usize) -> u64 {
    ((1 << PIECES.len()) - 1) & !groups()[direction][0]
}
