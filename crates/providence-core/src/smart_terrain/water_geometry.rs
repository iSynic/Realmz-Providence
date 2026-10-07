//! Reviewed Plains edge geometry: N/S run left to right; E/W run top to bottom.
//! Mid-edge shores and centered stream ports are different connections.
//! Providence 56ac232c landlookTileSemantics.ts pins slope endpoints and ports;
//! the source atlas and authored contexts are inventoried in maps-brush-overhaul.md.

#[derive(Clone, Copy, Debug)]
pub(super) struct Piece {
    pub tile: i16,
    pub edges: [u8; 4],
    pub area: u8,
}

const G: u8 = 0;
const W: u8 = 15;
const L: u8 = 3;
const H: u8 = 12;
const C: u8 = 6;

const fn piece(tile: i16, edges: [u8; 4], area: u8) -> Piece {
    Piece { tile, edges, area }
}

pub(super) const PIECES: [Piece; 47] = [
    piece(1, [H, W, H, G], 8),
    piece(2, [L, G, L, W], 8),
    piece(3, [G, H, W, H], 8),
    piece(4, [W, L, G, L], 8),
    piece(5, [H, W, G, G], 4),
    piece(6, [W, W, H, G], 12),
    piece(7, [W, G, L, W], 12),
    piece(8, [L, G, G, W], 4),
    piece(9, [G, W, H, G], 4),
    piece(10, [H, W, W, G], 12),
    piece(11, [G, G, L, W], 4),
    piece(12, [L, G, W, W], 12),
    piece(13, [G, H, W, W], 12),
    piece(14, [G, G, W, H], 4),
    piece(15, [W, L, G, W], 12),
    piece(16, [W, G, G, L], 4),
    piece(17, [G, H, W, G], 4),
    piece(18, [G, W, W, H], 12),
    piece(19, [W, L, G, G], 4),
    piece(20, [W, W, G, L], 12),
    piece(21, [W, L, C, L], 10),
    piece(22, [H, W, H, C], 10),
    piece(23, [L, C, L, W], 10),
    piece(24, [C, H, W, H], 10),
    piece(25, [G, H, H, G], 2),
    piece(26, [G, G, L, H], 2),
    piece(27, [H, L, G, G], 2),
    piece(28, [L, G, G, L], 2),
    piece(29, [L, H, W, W], 14),
    piece(30, [H, W, W, H], 14),
    piece(31, [W, L, L, W], 14),
    piece(32, [W, W, H, L], 14),
    piece(38, [C, G, C, G], 4),
    piece(39, [G, C, G, C], 4),
    piece(40, [C, G, G, G], 2),
    piece(41, [G, C, G, G], 2),
    piece(42, [G, G, C, G], 2),
    piece(43, [G, G, G, C], 2),
    piece(44, [C, C, G, C], 6),
    piece(45, [C, C, C, G], 6),
    piece(46, [G, C, C, C], 6),
    piece(47, [C, G, C, C], 6),
    piece(48, [G, C, C, G], 4),
    piece(49, [G, G, C, C], 4),
    piece(50, [C, C, G, G], 4),
    piece(51, [C, G, G, C], 4),
    piece(60, [W, W, W, W], 16),
];

pub(super) fn index(tile: i16) -> Option<usize> {
    PIECES.iter().position(|piece| piece.tile == tile)
}

pub(super) fn fixed_edge(tile: i16, direction: usize) -> u8 {
    // Plains road bridges are fixed artwork, but their streams must stay connected.
    if tile == 130 {
        return [C, G, C, G][direction];
    }
    if tile == 131 {
        return [G, C, G, C][direction];
    }
    if (33..=35).contains(&tile) || (56..=59).contains(&tile) {
        return W;
    }
    let water_sides: &[usize] = match tile {
        86 => &[0, 3],
        87 => &[0, 1],
        88 => &[2, 3],
        89 => &[1, 2],
        90 => &[3],
        91 => &[1],
        92 => &[0],
        93 => &[2],
        _ => &[],
    };
    if water_sides.contains(&direction) {
        return W;
    }
    index(tile).map_or(G, |index| PIECES[index].edges[direction])
}

pub(super) fn candidates(mut domain: u64) -> impl Iterator<Item = usize> {
    std::iter::from_fn(move || {
        if domain == 0 {
            return None;
        }
        let index = domain.trailing_zeros() as usize;
        domain &= domain - 1;
        Some(index)
    })
}

pub(super) fn matching_edge(direction: usize, edge: u8) -> u64 {
    PIECES
        .iter()
        .enumerate()
        .filter(|(_, piece)| piece.edges[direction] == edge)
        .fold(0, |mask, (index, _)| mask | (1 << index))
}
