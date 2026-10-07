//! Line brushes use reviewed connection ports, independently of area-fill geometry.
use super::*;
use crate::terrain_joining::{AtlasEvidence, layouts};

pub struct Profile {
    pub identity: &'static str,
    pub name: &'static str,
    pub pieces: &'static [(i16, u8)],
    looks: &'static [i8],
}

// Ports are north, east, south, west. Doors, bridges and decorated walls are excluded.
const PROFILES: &[Profile] = &[
    Profile {
        identity: "wall",
        name: "Wall",
        looks: &[0, 3, 5, 9, 10],
        pieces: &[
            (94, 5),
            (95, 10),
            (96, 7),
            (97, 13),
            (98, 3),
            (99, 9),
            (100, 15),
            (101, 11),
            (102, 14),
            (103, 6),
            (104, 12),
        ],
    },
    Profile {
        identity: "road",
        name: "Road",
        looks: &[0, 2, 3, 5, 9, 10],
        pieces: &[
            (132, 10),
            (133, 5),
            (134, 15),
            (135, 14),
            (136, 11),
            (137, 7),
            (138, 13),
            (139, 6),
            (140, 9),
            (141, 3),
            (142, 12),
            (143, 2),
            (144, 4),
            (145, 8),
            (146, 1),
        ],
    },
    Profile {
        identity: "castle-wall",
        name: "Castle wall",
        looks: &[4],
        pieces: &[
            (1, 5),
            (2, 10),
            (11, 7),
            (12, 13),
            (13, 3),
            (14, 9),
            (15, 6),
            (16, 12),
            (17, 11),
            (18, 14),
            (19, 15),
            (20, 1),
            (21, 2),
            (22, 4),
            (23, 8),
        ],
    },
];

impl Profile {
    pub fn ports(&self, tile: i16) -> Option<u8> {
        self.pieces
            .iter()
            .find(|(id, _)| *id == tile)
            .map(|(_, ports)| *ports)
    }

    fn tile(&self, ports: u8, fallback: i16) -> i16 {
        if ports == 0 {
            return fallback;
        }
        self.pieces
            .iter()
            .filter(|(_, mask)| *mask & ports == ports)
            .min_by_key(|(_, mask)| (*mask ^ ports).count_ones())
            .map_or(fallback, |(id, _)| *id)
    }
}

pub fn available(snapshot: &ProjectSnapshot, atlas: &AtlasEvidence) -> Vec<&'static Profile> {
    PROFILES
        .iter()
        .filter(|profile| compatible(snapshot, atlas, profile))
        .collect()
}

fn compatible(snapshot: &ProjectSnapshot, atlas: &AtlasEvidence, profile: &Profile) -> bool {
    if atlas.tile_fingerprints.len() != 200 {
        return false;
    }
    if crate::terrain_mapping::current(snapshot, atlas).is_some_and(|mapping| {
        profile
            .pieces
            .iter()
            .any(|(tile, _)| mapping.excluded_tiles.contains(tile))
    }) {
        return false;
    }
    layouts().iter().any(|layout| {
        profile.looks.contains(&layout.landlook)
            && profile.pieces.iter().all(|(tile, _)| {
                let index = *tile as usize - 1;
                atlas.tile_fingerprints[index] == layout.tile_fingerprints[index]
            })
    })
}

pub fn sampled(
    snapshot: &ProjectSnapshot,
    atlas: &AtlasEvidence,
    tile: u16,
) -> Option<&'static Profile> {
    available(snapshot, atlas)
        .into_iter()
        .find(|profile| profile.ports(tile as i16).is_some())
}

pub fn by_identity(identity: &str) -> Option<&'static Profile> {
    PROFILES.iter().find(|profile| profile.identity == identity)
}

/// Reconnect the drawn footprint and its immediate existing line neighbors together.
/// Existing neighbors keep connections away from the stroke; no remote line is rewritten.
pub fn paint(
    map: &mut MapLevel,
    cells: &[MapCoordinate],
    profile: &Profile,
    allowed: impl Fn(usize) -> bool,
) {
    let selected: BTreeSet<_> = cells
        .iter()
        .map(|cell| cell.y as usize * 90 + cell.x as usize)
        .collect();
    let mut affected = selected.clone();
    for &index in &selected {
        for (neighbor, _) in neighbors(index) {
            if allowed(neighbor) && profile.ports(terrain(map.tiles[neighbor])).is_some() {
                affected.insert(neighbor);
            }
        }
    }
    let changes: Vec<_> = affected
        .iter()
        .map(|&index| {
            let fallback = terrain(map.tiles[index]);
            let old = profile.ports(fallback).unwrap_or(0);
            let mut ports = if selected.contains(&index) { 0 } else { old };
            for (neighbor, direction) in neighbors(index) {
                if selected.contains(&neighbor)
                    || (selected.contains(&index)
                        && allowed(neighbor)
                        && profile.ports(terrain(map.tiles[neighbor])).is_some())
                {
                    ports |= direction;
                }
            }
            (index, profile.tile(ports, fallback))
        })
        .collect();
    for (index, tile) in changes {
        map.tiles[index] = map_paint::replace_terrain(map.tiles[index], tile);
    }
}

fn terrain(raw: i16) -> i16 {
    map_paint::terrain_tile(raw).map_or(-1, |tile| tile as i16)
}

fn neighbors(index: usize) -> impl Iterator<Item = (usize, u8)> {
    let x = index % 90;
    let y = index / 90;
    [
        (x as i16, y as i16 - 1, 1),
        (x as i16 + 1, y as i16, 2),
        (x as i16, y as i16 + 1, 4),
        (x as i16 - 1, y as i16, 8),
    ]
    .into_iter()
    .filter(|(x, y, _)| (0..90).contains(x) && (0..90).contains(y))
    .map(|(x, y, port)| (y as usize * 90 + x as usize, port))
}
