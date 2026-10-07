use super::{CompatibilityBlocker, blocker, is_sha256_blob};
use crate::model::{LevelType, ProjectSnapshot};
use crate::rebuilt::{
    ApplicationMediaCatalog, RebuiltV3TopologyError, project_rebuilt_v3_random_rectangle,
    project_rebuilt_v3_topologies, special_land_asset_lookup,
    special_land_asset_lookup_with_application,
};

pub(super) fn terrain_catalog_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.terrain_catalog.is_empty()
        && snapshot
            .world
            .maps
            .iter()
            .any(|map| map.level_type == LevelType::Land)
    {
        return vec![blocker(
            "rebuilt.terrain-catalog.unavailable",
            "Data LD tile words lack mapstats-derived movement, solidity, LOS, boat, sound, forest, and combat-build facts.",
            None,
        )];
    }
    let mut blockers = terrain_map_blockers(snapshot);
    blockers.extend(terrain_profile_blockers(snapshot));
    blockers
}

fn terrain_map_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    for map in &snapshot.world.maps {
        if map.level_type == LevelType::Dungeon {
            continue;
        }
        let Some(runtime) = &map.runtime else {
            continue;
        };
        let mut required_tiles = map
            .tiles
            .iter()
            .filter_map(|raw_tile| {
                let normalized_tile = normalized_land_tile(*raw_tile);
                if *raw_tile < 0 || normalized_tile > 200 {
                    runtime.base_tile
                } else {
                    Some(normalized_tile)
                }
            })
            .collect::<std::collections::BTreeSet<_>>();
        required_tiles.extend([60, 147]);
        let missing = required_tiles
            .into_iter()
            .filter(|tile| {
                !snapshot.terrain_catalog.iter().any(|profile| {
                    profile.tile == *tile
                        && (profile.landlook == runtime.landlook || profile.landlook.is_none())
                })
            })
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            blockers.push(blocker(
                "rebuilt.terrain-catalog.missing-profiles",
                format!(
                    "Map '{}' lacks normalized terrain profiles for tiles {}.",
                    map.identity.0,
                    missing
                        .iter()
                        .take(8)
                        .map(i16::to_string)
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                Some(map.identity.clone()),
            ));
        }
    }
    blockers
}

fn terrain_profile_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut blockers = Vec::new();
    let mut profile_keys = std::collections::BTreeSet::new();
    for profile in &snapshot.terrain_catalog {
        if !profile_keys.insert((profile.landlook, profile.tile)) {
            blockers.push(blocker(
                "rebuilt.terrain-catalog.duplicate-profile",
                format!(
                    "Terrain tile {} has more than one profile for landlook {:?}.",
                    profile.tile, profile.landlook
                ),
                None,
            ));
        }
        if profile.source.trim().is_empty()
            || profile
                .source_blob
                .as_ref()
                .is_some_and(|blob| !is_sha256_blob(&blob.0))
        {
            blockers.push(blocker(
                "rebuilt.terrain-catalog.provenance",
                format!(
                    "Terrain tile {} has invalid source attribution.",
                    profile.tile
                ),
                None,
            ));
        }
        if !(0..=400).contains(&profile.tile)
            || profile.movement_cost < 0
            || !(0..=2).contains(&profile.boat_requirement)
        {
            blockers.push(blocker(
                "rebuilt.terrain-catalog.invalid-profile",
                format!(
                    "Terrain tile {} has movement cost {} and boat requirement {}; expected tile 0 through 400, nonnegative cost, and boat requirement 0 through 2.",
                    profile.tile, profile.movement_cost, profile.boat_requirement
                ),
                None,
            ));
        }
    }
    blockers
}

pub(super) fn map_runtime_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    if snapshot.world.maps.is_empty() || snapshot.world.maps.iter().any(|map| map.runtime.is_none())
    {
        return vec![blocker(
            "rebuilt.map-runtime-metadata.unavailable",
            "Effective landlook, base scale, darkness, LOS mode, tileset identity, and random-level rectangles are not certified for every map.",
            None,
        )];
    }
    let mut blockers = Vec::new();
    for map in &snapshot.world.maps {
        let runtime = map.runtime.as_ref().expect("checked above");
        if runtime.source.trim().is_empty()
            || runtime
                .source_blob
                .as_ref()
                .is_some_and(|blob| !is_sha256_blob(&blob.0))
        {
            blockers.push(blocker(
                "rebuilt.map-runtime-metadata.provenance",
                format!(
                    "Map '{}' has invalid runtime source attribution.",
                    map.identity.0
                ),
                Some(map.identity.clone()),
            ));
        }
        if runtime.tileset_id.0.trim().is_empty()
            || (map.level_type == LevelType::Land
                && (runtime.landlook.is_none()
                    || runtime.base_scale.is_none()
                    || runtime.base_tile.is_none()))
        {
            blockers.push(blocker(
                "rebuilt.map-runtime-metadata.incomplete",
                format!("Map '{}' has incomplete runtime metadata.", map.identity.0),
                Some(map.identity.clone()),
            ));
        }
        for rectangle in &runtime.random_rectangles {
            if project_rebuilt_v3_random_rectangle(rectangle).is_none() {
                blockers.push(blocker(
                    "rebuilt.map-runtime-metadata.random-rectangle",
                    format!(
                        "Random rectangle '{}' has no nonempty intersection with the 90 by 90 playable map.",
                        rectangle.identity.0
                    ),
                    Some(rectangle.identity.clone()),
                ));
            }
        }
    }
    blockers
}

pub(super) fn topology_blockers(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Vec<CompatibilityBlocker> {
    let special_land_assets = application_media.map_or_else(
        || special_land_asset_lookup(snapshot),
        |application_media| special_land_asset_lookup_with_application(snapshot, application_media),
    );
    match project_rebuilt_v3_topologies(snapshot, &special_land_assets) {
        Ok(_) => Vec::new(),
        Err(RebuiltV3TopologyError::MissingSpecialLandAssets(resource_ids)) => vec![blocker(
            "rebuilt.map-topology.special-land-assets",
            format!(
                "Special land resources {} need exact content-addressed CICN asset identities before compact topology can be emitted.",
                resource_ids
                    .iter()
                    .map(i16::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            None,
        )],
        Err(error) => vec![blocker(
            "rebuilt.map-topology.invalid-input",
            error.to_string(),
            None,
        )],
    }
}

fn normalized_land_tile(raw_tile: i16) -> i16 {
    let mut magnitude = if raw_tile < 0 {
        -i32::from(raw_tile)
    } else {
        i32::from((raw_tile as u16) & !0x6000)
    };
    while magnitude > 999 {
        magnitude -= 1000;
    }
    magnitude as i16
}
