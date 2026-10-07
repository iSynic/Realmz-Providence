use super::versions::*;
use crate::model::{PlayerMapNameCatalog, ProjectSnapshot};

pub(super) fn migrate(
    snapshot: &mut ProjectSnapshot,
    source_version: u32,
    migrated_player_map_names: Option<PlayerMapNameCatalog>,
) {
    if source_version < LANDLOOK_MAPSTATS_SNAPSHOT_FORMAT_VERSION {
        snapshot.landlook_catalogs.clear();
    }
    if source_version < LAND_LAYOUT_SNAPSHOT_FORMAT_VERSION {
        snapshot.world.land_layout = None;
    }
    if source_version < PLAYER_MAP_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.world.player_maps.clear();
    }
    if source_version < PLAYER_MAP_NAME_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.player_map_names = migrated_player_map_names;
    }
    if source_version < SPECIAL_LAND_SOLIDITY_SNAPSHOT_FORMAT_VERSION {
        snapshot.world.special_land_solidity = None;
    }
    if source_version < PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION {
        snapshot.quest_labels.clear();
    }
}
