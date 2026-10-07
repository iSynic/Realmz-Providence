use super::versions::*;
use crate::model::ProjectSnapshot;

pub(super) fn migrate(snapshot: &mut ProjectSnapshot, version: u32) {
    if version == LEGACY_SNAPSHOT_FORMAT_VERSION {
        snapshot.campaign = None;
        snapshot.start_location = None;
    }
    if version == PACKAGE_BOOTSTRAP_SNAPSHOT_FORMAT_VERSION {
        for map in &mut snapshot.world.maps {
            map.runtime = None;
        }
    }
    if version <= PACKAGE_BOOTSTRAP_SNAPSHOT_FORMAT_VERSION {
        snapshot.terrain_catalog.clear();
    }
    if version <= MAP_INPUT_SNAPSHOT_FORMAT_VERSION {
        snapshot.assets.clear();
    }
    if version <= ASSET_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.extra_codes.clear();
    }
    if version <= EXTRA_CODE_SNAPSHOT_FORMAT_VERSION {
        snapshot.race_rules.clear();
        snapshot.caste_rules.clear();
    }
    if version <= RULE_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.scenario_application = None;
    }
    if version <= APPLICATION_CONTRACT_SNAPSHOT_FORMAT_VERSION {
        snapshot.rule_names = None;
    }
    if version <= RULE_NAME_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.item_rules.clear();
    }
    if version <= STANDARD_ITEM_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.scenario_item_rules.clear();
    }
    if version <= SCENARIO_ITEM_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.classic_sources.clear();
    }
}
