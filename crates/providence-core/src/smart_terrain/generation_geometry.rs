//! Exact adjacency geometry shared with generation, independent of solver policy.
use super::*;

pub(crate) fn pieces(family: &str) -> Vec<(i16, [u8; 4])> {
    if family == "water" {
        return water_geometry::PIECES
            .iter()
            .map(|piece| (piece.tile, piece.edges))
            .collect();
    }
    let Some(profile) = rules().presets.get(family) else {
        return vec![];
    };
    profile
        .roles
        .iter()
        .flat_map(|(role, tiles)| {
            let edges = match role.as_str() {
                "center" => [15, 15, 15, 15],
                "north" => [0, 12, 15, 12],
                "south" => [15, 3, 0, 3],
                "east" => [3, 0, 3, 15],
                "west" => [12, 15, 12, 0],
                "northEast" => [0, 0, 3, 12],
                "northWest" => [0, 12, 12, 0],
                "southEast" => [3, 0, 0, 3],
                "southWest" => [12, 3, 0, 0],
                _ => return vec![],
            };
            tiles.iter().map(|&tile| (tile, edges)).collect()
        })
        .collect()
}
