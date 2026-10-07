use super::contracts::{RebuiltV3CompactLandTileProfile, RebuiltV3TopologyError};
use crate::model::{ProjectSnapshot, StableId, TerrainProfile};

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

pub(super) fn terrain_profile<'snapshot>(
    snapshot: &'snapshot ProjectSnapshot,
    map: &StableId,
    tile: i16,
    landlook: Option<i8>,
) -> Result<&'snapshot TerrainProfile, RebuiltV3TopologyError> {
    let exact = snapshot
        .terrain_catalog
        .iter()
        .filter(|profile| profile.tile == tile && profile.landlook == landlook)
        .collect::<Vec<_>>();
    if exact.len() > 1 {
        return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile { landlook, tile });
    }
    if let Some(profile) = exact.first() {
        return Ok(profile);
    }
    if landlook.is_some() {
        let shared = snapshot
            .terrain_catalog
            .iter()
            .filter(|profile| profile.tile == tile && profile.landlook.is_none())
            .collect::<Vec<_>>();
        if shared.len() > 1 {
            return Err(RebuiltV3TopologyError::AmbiguousTerrainProfile {
                landlook: None,
                tile,
            });
        }
        if let Some(profile) = shared.first() {
            return Ok(profile);
        }
    }
    Err(RebuiltV3TopologyError::MissingTerrainProfile {
        map: map.clone(),
        tile,
    })
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
