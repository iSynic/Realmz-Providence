use super::{
    contracts::*,
    inputs::{cell_random_rectangle_ids, cell_trigger_ids, map_runtime},
    terrain::{
        compact_land_tile_profile, edge_flags, normalized_land_tile, semantic_flags,
        special_land_resource_id, terrain_profile,
    },
};
use crate::model::{
    CLASSIC_MAP_SIZE, LevelType, MapLevel, MapRuntimeMetadata, ProjectOrigin, ProjectSnapshot,
    SpecialLandSolidityCatalog, StableId, TerrainProfile,
};
use crate::rebuilt::application_media::rebuilt_application_special_land_identity;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn project_land_topologies(
    snapshot: &ProjectSnapshot,
    special_land_assets: &BTreeMap<i16, StableId>,
) -> Result<Vec<RebuiltV3Topology>, RebuiltV3TopologyError> {
    let has_special_land = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .flat_map(|map| map.tiles.iter())
        .any(|tile| *tile < 0);
    let solidity = if has_special_land {
        let catalog = snapshot
            .world
            .special_land_solidity
            .as_ref()
            .ok_or(RebuiltV3TopologyError::MissingSpecialLandSolidity)?;
        if catalog.solid.len() != crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES {
            return Err(RebuiltV3TopologyError::InvalidSpecialLandSolidityCount(
                catalog.solid.len(),
            ));
        }
        Some(catalog)
    } else {
        None
    };
    let missing_assets = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .flat_map(|map| map.tiles.iter().copied())
        .filter_map(special_land_resource_id)
        .filter(|resource_id| !special_land_assets.contains_key(resource_id))
        .collect::<BTreeSet<_>>();
    if !missing_assets.is_empty() && !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Err(RebuiltV3TopologyError::MissingSpecialLandAssets(
            missing_assets.into_iter().collect(),
        ));
    }

    let mut maps = snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .collect::<Vec<_>>();
    maps.sort_by_key(|map| map.identity.clone());
    maps.into_iter()
        .map(|map| project_land_topology(snapshot, map, special_land_assets, solidity))
        .collect()
}

fn project_land_topology(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    special_land_assets: &BTreeMap<i16, StableId>,
    solidity: Option<&crate::model::SpecialLandSolidityCatalog>,
) -> Result<RebuiltV3Topology, RebuiltV3TopologyError> {
    let runtime = map_runtime(map)?;
    let base_tile = runtime
        .base_tile
        .ok_or_else(|| RebuiltV3TopologyError::MissingRuntimeMetadata(map.identity.clone()))?;
    let removed = compact_land_tile_profile(terrain_profile(
        snapshot,
        &map.identity,
        60,
        runtime.landlook,
    )?)?;
    let placed = compact_land_tile_profile(terrain_profile(
        snapshot,
        &map.identity,
        147,
        runtime.landlook,
    )?)?;
    let projection = LandProjection {
        snapshot,
        map,
        runtime,
        base_tile,
        special_land_assets,
        solidity,
    };
    let mut cells = Vec::with_capacity(map.tiles.len());
    for y in 0..CLASSIC_MAP_SIZE {
        for x in 0..CLASSIC_MAP_SIZE {
            cells.push(projection.cell(x, y)?);
        }
    }
    Ok(RebuiltV3Topology {
        id: map.identity.clone(),
        topology_format: "realmz2.compact-cell-rows.v2".into(),
        cells,
        boat_replacement_profiles: Some(RebuiltV3BoatReplacementProfiles { removed, placed }),
    })
}

struct LandProjection<'snapshot> {
    snapshot: &'snapshot ProjectSnapshot,
    map: &'snapshot MapLevel,
    runtime: &'snapshot MapRuntimeMetadata,
    base_tile: i16,
    special_land_assets: &'snapshot BTreeMap<i16, StableId>,
    solidity: Option<&'snapshot SpecialLandSolidityCatalog>,
}

struct LandCellTerrain<'snapshot> {
    profile: &'snapshot TerrainProfile,
    render_tile: i16,
    marker_band: u8,
    passable: bool,
    blocks_los: bool,
}

impl LandProjection<'_> {
    fn terrain(&self, raw_tile: i16) -> Result<LandCellTerrain<'_>, RebuiltV3TopologyError> {
        let (normalized_tile, marker_band) = normalized_land_tile(raw_tile);
        let positive_out_of_atlas = raw_tile >= 0 && normalized_tile > 200;
        let profile_tile = if raw_tile < 0 || positive_out_of_atlas {
            self.base_tile
        } else {
            normalized_tile
        };
        let profile = terrain_profile(
            self.snapshot,
            &self.map.identity,
            profile_tile,
            self.runtime.landlook,
        )?;
        let special_solid = if (-999..0).contains(&raw_tile) {
            self.solidity
                .and_then(|catalog| catalog.solid.get((-raw_tile) as usize))
                .copied()
                .unwrap_or(false)
        } else {
            false
        };
        let passable = (profile.walkable || profile.solid_type == 0) && !special_solid;
        let blocks_los = if raw_tile < 0 {
            false
        } else {
            profile.blocks_los
        };
        let render_tile = if raw_tile < 0 || positive_out_of_atlas {
            self.base_tile
        } else {
            normalized_tile
        };
        Ok(LandCellTerrain {
            profile,
            render_tile,
            marker_band,
            passable,
            blocks_los,
        })
    }

    fn cell(&self, x: usize, y: usize) -> Result<RebuiltV3CompactCell, RebuiltV3TopologyError> {
        let raw_tile = self.map.tiles[y * CLASSIC_MAP_SIZE + x];
        let terrain = self.terrain(raw_tile)?;
        let cell_id = StableId(format!("{}:cell:{x},{y}", self.map.identity.0));
        let trigger_ids = cell_trigger_ids(self.snapshot, self.map, x, y);
        let random_rectangle_ids = cell_random_rectangle_ids(self.runtime, x, y);
        let features = land_features(&cell_id, terrain.marker_band, !trigger_ids.is_empty());
        let edge = RebuiltV3CompactEdge(
            if terrain.passable { "open" } else { "wall" }.into(),
            edge_flags(terrain.passable, terrain.blocks_los, true),
            None,
            None,
        );
        let overlay_asset_id = self.overlay_asset(raw_tile);
        let profile = terrain.profile;
        Ok(RebuiltV3CompactCell(
            StableId(format!("classic.terrain.{}", terrain.render_tile)),
            profile.movement_cost,
            semantic_flags(profile, terrain.passable, terrain.blocks_los)?,
            if raw_tile <= 0 {
                Some(82)
            } else {
                profile.movement_sound_id
            },
            trigger_ids,
            random_rectangle_ids,
            [edge.clone(), edge.clone(), edge.clone(), edge],
            features,
            terrain.render_tile,
            self.runtime.tileset_id.clone(),
            overlay_asset_id,
            profile.boat_requirement,
            if raw_tile <= 0 {
                3
            } else {
                profile.movement_cost
            },
        ))
    }

    fn overlay_asset(&self, raw_tile: i16) -> Option<StableId> {
        special_land_resource_id(raw_tile).and_then(|resource_id| {
            self.special_land_assets
                .get(&resource_id)
                .cloned()
                .or_else(|| {
                    matches!(self.snapshot.origin, ProjectOrigin::Imported { .. }).then(|| {
                        rebuilt_application_special_land_identity(resource_id)
                            .unwrap_or_else(|| StableId(format!("realmz-land-cicn-{resource_id}")))
                    })
                })
        })
    }
}

fn land_features(
    cell_id: &StableId,
    marker_band: u8,
    has_trigger: bool,
) -> Vec<RebuiltV3CompactFeature> {
    let mut features = Vec::new();
    if marker_band > 0 || has_trigger {
        features.push(RebuiltV3CompactFeature(
            StableId(format!("{}:action-point", cell_id.0)),
            "action-point".into(),
            Some("active".into()),
            None,
        ));
    }
    if marker_band >= 2 {
        features.push(RebuiltV3CompactFeature(
            StableId(format!("{}:secret", cell_id.0)),
            "secret".into(),
            Some(if marker_band >= 3 {
                "hidden".into()
            } else {
                "revealed".into()
            }),
            None,
        ));
    }
    features
}
