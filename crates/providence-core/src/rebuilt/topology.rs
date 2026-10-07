mod contracts;
mod dungeon;
mod inputs;
mod land;
mod terrain;

use crate::model::{LevelType, ProjectSnapshot, StableId};
pub use contracts::{
    RebuiltV3BoatReplacementProfiles, RebuiltV3CompactCell, RebuiltV3CompactEdge,
    RebuiltV3CompactFeature, RebuiltV3CompactLandTileProfile, RebuiltV3Topology,
    RebuiltV3TopologyError,
};
use dungeon::project_dungeon_topology;
use land::project_land_topologies;
use std::collections::BTreeMap;

pub fn project_rebuilt_v3_topologies(
    snapshot: &ProjectSnapshot,
    special_land_assets: &BTreeMap<i16, StableId>,
) -> Result<Vec<RebuiltV3Topology>, RebuiltV3TopologyError> {
    let mut topologies = project_land_topologies(snapshot, special_land_assets)?;
    topologies.extend(
        snapshot
            .world
            .maps
            .iter()
            .filter(|map| map.level_type == LevelType::Dungeon)
            .map(|map| project_dungeon_topology(snapshot, map))
            .collect::<Result<Vec<_>, _>>()?,
    );
    topologies.sort_by_key(|topology| topology.id.clone());
    Ok(topologies)
}

#[cfg(test)]
mod tests;
