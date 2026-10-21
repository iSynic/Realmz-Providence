use super::contracts::{RebuiltV3CompactLandTileProfile, RebuiltV3TopologyError};
use crate::model::{StableId, TerrainProfile};
use std::collections::BTreeMap;

pub(super) fn compact_land_tile_profile(
    profile: &TerrainProfile,
) -> Result<RebuiltV3CompactLandTileProfile, RebuiltV3TopologyError> {
    let passable = profile.walkable || profile.solid_type == 0;
    Ok(RebuiltV3CompactLandTileProfile(
        StableId(format!("classic.terrain.{}", profile.tile)),
        profile.movement_cost,
        semantic_flags(profile, passable, profile.blocks_los)?,
        profile.movement_sound_id,
        profile.tile,
        profile.boat_requirement,
        profile.movement_cost,
    ))
}

#[derive(Clone, Copy)]
enum TerrainProfileIndexEntry<'snapshot> {
    Unique(&'snapshot TerrainProfile),
    Ambiguous,
}

pub(super) struct TerrainProfileIndex<'snapshot> {
    profiles: BTreeMap<(i16, Option<i8>), TerrainProfileIndexEntry<'snapshot>>,
}

impl<'snapshot> TerrainProfileIndex<'snapshot> {
    pub(super) fn new(catalog: &'snapshot [TerrainProfile]) -> Self {
        let mut profiles = BTreeMap::new();
        for profile in catalog {
            let key = (profile.tile, profile.landlook);
            profiles
                .entry(key)
                .and_modify(|entry| *entry = TerrainProfileIndexEntry::Ambiguous)
                .or_insert(TerrainProfileIndexEntry::Unique(profile));
        }
        Self { profiles }
    }

    pub(super) fn get(
        &self,
        map: &StableId,
        tile: i16,
        landlook: Option<i8>,
    ) -> Result<&'snapshot TerrainProfile, RebuiltV3TopologyError> {
        let exact = self.profiles.get(&(tile, landlook));
        match exact {
            Some(TerrainProfileIndexEntry::Unique(profile)) => return Ok(profile),
            Some(TerrainProfileIndexEntry::Ambiguous) => {
                return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile { landlook, tile });
            }
            None => {}
        }
        if landlook.is_some() {
            match self.profiles.get(&(tile, None)) {
                Some(TerrainProfileIndexEntry::Unique(profile)) => return Ok(profile),
                Some(TerrainProfileIndexEntry::Ambiguous) => {
                    return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile {
                        landlook: None,
                        tile,
                    });
                }
                None => {}
            }
        }
        Err(RebuiltV3TopologyError::MissingTerrainProfile {
            map: map.clone(),
            tile,
        })
    }
}

pub(super) fn semantic_flags(
    profile: &TerrainProfile,
    passable: bool,
    blocks_los: bool,
) -> Result<u16, RebuiltV3TopologyError> {
    if !(0..=2).contains(&profile.boat_requirement) {
        return Err(RebuiltV3TopologyError::InvalidBoatRequirement {
            tile: profile.tile,
            requirement: profile.boat_requirement,
        });
    }
    let mut flags = 0u16;
    for (bit, enabled) in [
        (0, passable),
        (1, blocks_los),
        (2, true),
        (3, profile.boat_requirement == 2),
        (4, profile.shore),
        (5, profile.path),
        (6, profile.boat_requirement != 0),
        (7, profile.fly_float),
        (8, profile.forest_type != 0),
    ] {
        if enabled {
            flags |= 1 << bit;
        }
    }
    Ok(flags)
}

pub(super) fn edge_flags(passable: bool, blocks_los: bool, initially_discovered: bool) -> u8 {
    u8::from(passable) | (u8::from(blocks_los) << 1) | (u8::from(initially_discovered) << 2)
}

pub(super) fn normalized_land_tile(raw_tile: i16) -> (i16, u8) {
    let mut magnitude = if raw_tile < 0 {
        -i32::from(raw_tile)
    } else {
        i32::from((raw_tile as u16) & !0x6000)
    };
    let marker_band = (magnitude / 1000).clamp(0, 3) as u8;
    while magnitude > 999 {
        magnitude -= 1000;
    }
    (magnitude as i16, marker_band)
}

pub(super) fn special_land_resource_id(raw_tile: i16) -> Option<i16> {
    if !(-3999..0).contains(&raw_tile) {
        return None;
    }
    let mut resource_id = raw_tile;
    for _ in 0..3 {
        if resource_id >= -999 {
            break;
        }
        resource_id += 1000;
    }
    Some(resource_id)
}

#[cfg(test)]
#[path = "terrain_index_tests.rs"]
mod tests;
